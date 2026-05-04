import "jsr:@supabase/functions-js@2/edge-runtime.d.ts";
import { corsHeaders, corsHeadersForCache } from "../_shared/cors.ts";
import { errorResp, tooManyRequestsResp } from "../_shared/responses.ts";
import { captureException, serveWithSentry } from "../_shared/sentry.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";
import { getProjectById } from "../_shared/dao/projectDao.ts";
import { getRequestOriginUrl, isAllowedOrigin } from "../_shared/origin.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";

// Pass-through endpoint that returns today's FIFA World Cup 2026 fixtures with
// live scores, minute, and goals scored so far. Mirrors the read shape of the
// sportsdata MCP at divee-worldcup/mcp-sportsdata/sportsdata.js but sized for
// browser polling — short CDN cache absorbs duplicate traffic so we don't burn
// SportsData.io quota one-fetch-per-client.

const SPORTSDATA_BASE = "https://api.sportsdata.io/v4/soccer";
// @ts-ignore: Deno globals are unavailable to the editor TS server
const COMPETITION_ID = parseInt(Deno.env.get("SPORTSDATA_COMPETITION_ID") || "21", 10);

interface SDGame {
  GameId: number;
  CompetitionId?: number;
  Status: string;
  Day?: string;
  DateTime?: string;
  DateTimeUTC?: string;
  HomeTeamId: number;
  HomeTeamName: string;
  HomeTeamScore: number | null;
  AwayTeamId: number;
  AwayTeamName: string;
  AwayTeamScore: number | null;
  Group?: string | null;
  Round?: string | null;
  Clock?: string | null;
  Minute?: number | null;
}

interface SDGoal {
  GameMinute?: number | null;
  TeamId: number;
  PlayerId: number;
  AssistedByPlayerId?: number | null;
  Type?: string | null;
}

interface SDBoxScore {
  Game?: SDGame;
  Goals?: SDGoal[];
}

interface SDMember {
  PlayerId: number;
  TeamId: number;
  FirstName?: string;
  LastName?: string;
  CommonName?: string;
  Active?: boolean;
}

function apiKey(): string {
  // @ts-ignore: Deno globals are unavailable to the editor TS server
  const k = Deno.env.get("SPORTSDATA_API_KEY");
  if (!k) throw new Error("SPORTSDATA_API_KEY missing");
  return k;
}

class NotFoundError extends Error {}

async function sdFetch<T>(feed: string, op: string): Promise<T> {
  const url = `${SPORTSDATA_BASE}/${feed}/json/${op}`;
  const res = await fetch(url, {
    headers: { "Ocp-Apim-Subscription-Key": apiKey() },
  });
  if (res.status === 404) {
    // SportsData returns 404 for valid endpoints with no data for the given
    // date / id (e.g. days with zero scheduled fixtures). We surface this as
    // a typed error so the caller can treat it as "empty" instead of failing.
    throw new NotFoundError(`SportsData.io ${feed}/${op} 404`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SportsData.io ${feed}/${op} ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// SportsData.io v4 Soccer GamesByDate expects YYYY-MMM-DD (e.g. 2026-MAY-05),
// not the ISO YYYY-MM-DD that other v4 endpoints accept. The mcp-sportsdata
// helper documents this ambiguity but currently passes ISO through; the WC
// season hadn't started when that was written so it was untested in practice.
const SD_MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];
function toSdDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${y}-${SD_MONTHS[parseInt(m, 10) - 1]}-${d}`;
}

// Player name resolution. Memberships rarely change mid-tournament, so we
// keep the lookup table in module scope; it survives across requests on a
// warm isolate. A 24h soft TTL forces a refresh after squad updates.
const MEMBERSHIPS_TTL_MS = 24 * 60 * 60 * 1000;
let playersByIdCache: Map<number, string> | null = null;
let playersFetchedAt = 0;
let playersInflight: Promise<Map<number, string>> | null = null;

async function getPlayerNames(): Promise<Map<number, string>> {
  const fresh = playersByIdCache && Date.now() - playersFetchedAt < MEMBERSHIPS_TTL_MS;
  if (fresh) return playersByIdCache!;
  if (playersInflight) return playersInflight;
  playersInflight = (async () => {
    const members = await sdFetch<SDMember[]>("scores", "Memberships");
    const map = new Map<number, string>();
    for (const m of members ?? []) {
      const name = m.CommonName ?? `${m.FirstName ?? ""} ${m.LastName ?? ""}`.trim();
      if (name) map.set(m.PlayerId, name);
    }
    playersByIdCache = map;
    playersFetchedAt = Date.now();
    return map;
  })();
  try {
    return await playersInflight;
  } finally {
    playersInflight = null;
  }
}

function todayIsoUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function isValidIsoDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

function addDaysIso(iso: string, n: number): string {
  return new Date(new Date(iso + "T00:00:00Z").getTime() + n * 86_400_000)
    .toISOString().slice(0, 10);
}

const MAX_RANGE_DAYS = 7;

// Goals are only worth fetching for matches that have actually started. A
// Scheduled match has nothing to report; an InProgress match is what callers
// are polling for; a Final match shows the full goal list.
function shouldFetchGoals(g: SDGame): boolean {
  return g.Status === "InProgress" || g.Status === "Final" ||
    g.Status === "F/SO" || g.Status === "F/OT";
}

// Fetches a single day from SportsData and shapes it into the response slice
// the widget consumes. Returns `{ date, matches: [] }` on a 404 so a missing
// day inside a multi-day range doesn't fail the whole request.
async function fetchDay(
  date: string,
  names: Map<number, string>,
): Promise<{ date: string; matches: ReturnType<typeof summarizeMatch>[] }> {
  let games: SDGame[] = [];
  try {
    games = await sdFetch<SDGame[]>("scores", `GamesByDate/${toSdDate(date)}`);
  } catch (e) {
    if (!(e instanceof NotFoundError)) throw e;
  }
  const wcGames = games.filter(
    (g) => !g.CompetitionId || g.CompetitionId === COMPETITION_ID,
  );
  const goalFetches = await Promise.all(
    wcGames.map((g) =>
      shouldFetchGoals(g)
        ? sdFetch<SDBoxScore>("stats", `BoxScore/${g.GameId}`)
          .then((box) => box.Goals ?? [])
          .catch(() => [] as SDGoal[])
        : Promise.resolve([] as SDGoal[])
    ),
  );
  const matches = wcGames.map((g, i) => summarizeMatch(g, goalFetches[i], names));
  return { date, matches };
}

function summarizeMatch(g: SDGame, goals: SDGoal[], names: Map<number, string>) {
  return {
    match_id: g.GameId,
    status: g.Status,
    kickoff_utc: g.DateTimeUTC ?? g.DateTime ?? null,
    minute: g.Clock ?? g.Minute ?? null,
    group: g.Group ?? null,
    round: g.Round ?? null,
    home: { team_id: g.HomeTeamId, name: g.HomeTeamName, score: g.HomeTeamScore },
    away: { team_id: g.AwayTeamId, name: g.AwayTeamName, score: g.AwayTeamScore },
    goals: goals
      .slice()
      .sort((a, b) => (a.GameMinute ?? 0) - (b.GameMinute ?? 0))
      .map((x) => ({
        minute: x.GameMinute ?? null,
        team_id: x.TeamId,
        scorer_player_id: x.PlayerId,
        scorer_name: names.get(x.PlayerId) ?? null,
        type: x.Type ?? null,
      })),
  };
}

export async function gamesHandler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "GET") {
    return errorResp("Method not allowed", 405);
  }

  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId") ||
      url.searchParams.get("client_id");
    if (!projectId) {
      return errorResp("Missing projectId", 400);
    }

    const dateParam = url.searchParams.get("date");
    const today = todayIsoUtc();
    const startDate = dateParam ?? today;

    if (!isValidIsoDate(startDate)) {
      return errorResp("Invalid 'date' (expected YYYY-MM-DD)", 400);
    }

    const daysParam = url.searchParams.get("days");
    const dayCount = daysParam ? parseInt(daysParam, 10) : 1;
    if (!Number.isFinite(dayCount) || dayCount < 1 || dayCount > MAX_RANGE_DAYS) {
      return errorResp(
        `Invalid 'days' (1..${MAX_RANGE_DAYS})`,
        400,
      );
    }
    const dateRange = Array.from({ length: dayCount }, (_, i) => addDaysIso(startDate, i));
    const endDate = dateRange[dateRange.length - 1];

    // Origin allowlist: same pattern as /config. Origin is stripped by the
    // CDN, so we fall back to Referer. Requests without either are treated
    // as infra (CDN cache warm) and let through — see isAllowedOrigin.
    const supabase = await supabaseClient();
    const project = await getProjectById(projectId, supabase);
    const requestUrl = getRequestOriginUrl(req);
    if (!isAllowedOrigin(requestUrl, project.allowed_urls)) {
      console.warn("games-worldcup: origin not allowed", {
        attempted: requestUrl,
        projectId,
      });
      return errorResp("Origin not allowed", 403);
    }

    // Rate limit AFTER origin check so unauthorized traffic doesn't burn
    // the bucket. visitor_id is not part of GET polling; gate on IP +
    // project only.
    const rateLimit = await checkRateLimit(
      supabase,
      "games",
      null,
      projectId,
      req.headers.get("cf-connecting-ip"),
    );
    if (rateLimit.limited) {
      return tooManyRequestsResp(rateLimit.retryAfterSeconds);
    }

    // Memberships covers the whole tournament squad, so one lookup feeds
    // every day's BoxScore goal-name resolution. Pre-warm before fanning out
    // per-day fetches so the player map is ready by the time goals arrive.
    const names = await getPlayerNames().catch(() => new Map<number, string>());

    // Fetch all requested days in parallel. Each day is independent — a 404
    // on one date doesn't affect the others.
    const days = await Promise.all(dateRange.map((d) => fetchDay(d, names)));

    // Cache headers: if any day in the range is "today or future", treat the
    // whole response as live (15s s-maxage). Pure-past ranges are immutable
    // and can be cached aggressively.
    const allPast = dateRange.every((d) => d < today);
    const sMaxAge = allPast ? 3600 : 15;
    const maxAge = allPast ? 300 : 5;

    return new Response(
      JSON.stringify({
        start_date: startDate,
        end_date: endDate,
        competition_id: COMPETITION_ID,
        fetched_at: new Date().toISOString(),
        days,
      }),
      {
        status: 200,
        headers: {
          ...corsHeadersForCache,
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${maxAge}, s-maxage=${sMaxAge}`,
          "Surrogate-Control": `max-age=${sMaxAge}`,
          "Surrogate-Key": "games-worldcup",
        },
      },
    );
  } catch (error) {
    console.error("games-worldcup error:", error);
    captureException(error, { handler: "games-worldcup" });
    return errorResp("Internal Server Error", 500);
  }
}

// @ts-ignore: Deno globals and JSR imports are unavailable to the editor TS server
Deno.serve(serveWithSentry("games-worldcup", (req: Request) => gamesHandler(req)));
