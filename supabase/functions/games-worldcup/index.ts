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

interface SDSeason {
  Year?: number | string;
  Season?: number | string;
  Description?: string;
}

interface SDCompetitionDetails {
  Seasons?: SDSeason[];
  Competition?: { Seasons?: SDSeason[] };
}

function apiKey(): string {
  // @ts-ignore: Deno globals are unavailable to the editor TS server
  const k = Deno.env.get("SPORTSDATA_API_KEY");
  if (!k) throw new Error("SPORTSDATA_API_KEY missing");
  return k;
}

async function sdFetch<T>(feed: string, op: string): Promise<T> {
  const url = `${SPORTSDATA_BASE}/${feed}/json/${op}`;
  const res = await fetch(url, {
    headers: { "Ocp-Apim-Subscription-Key": apiKey() },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`SportsData.io ${feed}/${op} ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

// SportsData v4 Soccer endpoints are mostly per-competition+season (Schedule,
// Standings, Memberships). The bare `GamesByDate/{date}` path returns 404 in
// practice — the MCP shipped before live data flowed and that endpoint never
// got exercised. So instead we pull the full Schedule once per request,
// filter client-side by date, and cache the upstream response in-isolate.

const SEASON_OVERRIDE = // @ts-ignore: Deno globals are unavailable to the editor TS server
  Deno.env.get("SPORTSDATA_SEASON_OVERRIDE") || "";
const FALLBACK_SEASON = SEASON_OVERRIDE || "2026";

const SEASON_TTL_MS = 24 * 60 * 60 * 1000;
let cachedSeason: string | null = null;
let seasonFetchedAt = 0;
let seasonInflight: Promise<string> | null = null;

// Resolves the SportsData season identifier for the active CompetitionId.
// Mirrors the MCP's `getSeason()` logic: prefer SPORTSDATA_SEASON_OVERRIDE,
// then CompetitionDetails, then "2026" as a last resort.
async function getSeason(): Promise<string> {
  if (SEASON_OVERRIDE) return SEASON_OVERRIDE;
  const fresh = cachedSeason && Date.now() - seasonFetchedAt < SEASON_TTL_MS;
  if (fresh) return cachedSeason!;
  if (seasonInflight) return seasonInflight;
  seasonInflight = (async () => {
    try {
      const details = await sdFetch<SDCompetitionDetails>(
        "scores",
        `CompetitionDetails/${COMPETITION_ID}`,
      );
      const seasons = details.Seasons ?? details.Competition?.Seasons ?? [];
      // Prefer a season tagged 2026 (WC year). For other competitions fall
      // back to the most recent listed season — SD usually orders these
      // descending, but we don't trust the order and pick the max instead.
      const target = seasons.find((s) =>
        String(s.Year) === "2026" || String(s.Season) === "2026" ||
        /2026/.test(String(s.Description ?? ""))
      ) ??
        seasons.reduce<SDSeason | undefined>((best, s) => {
          const cur = parseInt(String(s.Season ?? s.Year ?? 0), 10);
          const top = best ? parseInt(String(best.Season ?? best.Year ?? 0), 10) : 0;
          return cur > top ? s : best;
        }, undefined);
      const resolved = target?.Season != null ? String(target.Season) : FALLBACK_SEASON;
      cachedSeason = resolved;
      seasonFetchedAt = Date.now();
      return resolved;
    } catch (e) {
      console.warn(
        `[games-worldcup] getSeason failed; falling back to ${FALLBACK_SEASON}`,
        e && (e as Error).message,
      );
      return FALLBACK_SEASON;
    }
  })();
  try {
    return await seasonInflight;
  } finally {
    seasonInflight = null;
  }
}

// Schedule cache. The full season schedule is large but stable — it changes
// at most a few times per day (postponements, time updates). 5-minute TTL is
// the right balance between freshness and not hammering the upstream.
const SCHEDULE_TTL_MS = 5 * 60 * 1000;
let scheduleCache: SDGame[] | null = null;
let scheduleFetchedAt = 0;
let scheduleInflight: Promise<SDGame[]> | null = null;

async function getSchedule(): Promise<SDGame[]> {
  const fresh = scheduleCache && Date.now() - scheduleFetchedAt < SCHEDULE_TTL_MS;
  if (fresh) return scheduleCache!;
  if (scheduleInflight) return scheduleInflight;
  scheduleInflight = (async () => {
    const season = await getSeason();
    const games = await sdFetch<SDGame[]>(
      "scores",
      `Schedule/${COMPETITION_ID}/${season}`,
    );
    scheduleCache = games ?? [];
    scheduleFetchedAt = Date.now();
    return scheduleCache;
  })();
  try {
    return await scheduleInflight;
  } finally {
    scheduleInflight = null;
  }
}

// Player name resolution. Memberships in v4 soccer is per-competition+season;
// the bare `Memberships` path returns an empty array. 24h TTL handles squad
// changes between matchdays.
const MEMBERSHIPS_TTL_MS = 24 * 60 * 60 * 1000;
let playersByIdCache: Map<number, string> | null = null;
let playersFetchedAt = 0;
let playersInflight: Promise<Map<number, string>> | null = null;

async function getPlayerNames(): Promise<Map<number, string>> {
  const fresh = playersByIdCache && Date.now() - playersFetchedAt < MEMBERSHIPS_TTL_MS;
  if (fresh) return playersByIdCache!;
  if (playersInflight) return playersInflight;
  playersInflight = (async () => {
    // `ActiveMemberships/{competition}` is the working v4 soccer path —
    // bare `Memberships` returns 404, and the per-season variants don't
    // exist either. Probed empirically against the WC competition (id=21)
    // and confirmed to return the full squad pool (~1300 players).
    const members = await sdFetch<SDMember[]>(
      "scores",
      `ActiveMemberships/${COMPETITION_ID}`,
    ).catch((err) => {
      console.warn(
        `[games-worldcup] ActiveMemberships failed`,
        err && err.message ? err.message : err,
      );
      return [] as SDMember[];
    });
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
// Filters the cached schedule down to a single day, then fans out BoxScore
// fetches for any in-progress / final matches to attach goals.
async function fetchDay(
  date: string,
  schedule: SDGame[],
  names: Map<number, string>,
): Promise<{ date: string; matches: ReturnType<typeof summarizeMatch>[] }> {
  const t0 = Date.now();
  // Prefer Day if present (date-only, matches our `date` directly), fall
  // back to DateTime/DateTimeUTC. SD Schedule entries usually have all three.
  const dayGames = schedule.filter((g) => {
    const ds = (g.Day ?? g.DateTimeUTC ?? g.DateTime ?? "").slice(0, 10);
    return ds === date;
  });

  let boxScoreErrors = 0;
  const goalFetches = await Promise.all(
    dayGames.map((g) =>
      shouldFetchGoals(g)
        ? sdFetch<SDBoxScore>("stats", `BoxScore/${g.GameId}`)
          .then((box) => box.Goals ?? [])
          .catch((err) => {
            boxScoreErrors++;
            console.warn(
              `[games-worldcup] fetchDay ${date}: BoxScore ${g.GameId} failed`,
              err && err.message ? err.message : err,
            );
            return [] as SDGoal[];
          })
        : Promise.resolve([] as SDGoal[])
    ),
  );
  const totalGoals = goalFetches.reduce((n, gs) => n + gs.length, 0);
  const liveOrFinal = dayGames.filter(shouldFetchGoals).length;
  const matches = dayGames.map((g, i) => summarizeMatch(g, goalFetches[i], names));
  console.log(
    `[games-worldcup] fetchDay ${date}: ` +
      `matchedFromSchedule=${dayGames.length} ` +
      `boxScoresAttempted=${liveOrFinal} ` +
      `boxScoreErrors=${boxScoreErrors} goals=${totalGoals} ` +
      `ms=${Date.now() - t0}`,
  );
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

  const reqStart = Date.now();
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId") ||
      url.searchParams.get("client_id");
    if (!projectId) {
      console.warn("[games-worldcup] missing projectId");
      return errorResp("Missing projectId", 400);
    }

    // `previewDate` is a dev-time override that pretends "today" is some other
    // date — useful before the WC starts, so we can render real Scheduled
    // fixtures from June onward against today's UI. When set, it wins over
    // the widget's `date` param (the widget always passes today UTC) and
    // also drives the past/future cache decision below.
    const previewDateParam = url.searchParams.get("previewDate");
    if (previewDateParam && !isValidIsoDate(previewDateParam)) {
      return errorResp("Invalid 'previewDate' (expected YYYY-MM-DD)", 400);
    }

    const dateParam = url.searchParams.get("date");
    const realToday = todayIsoUtc();
    const today = previewDateParam ?? realToday;
    const startDate = previewDateParam ?? dateParam ?? realToday;

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
    if (previewDateParam) {
      console.log(
        `[games-worldcup] PREVIEW mode: realToday=${realToday} ` +
          `previewDate=${previewDateParam}`,
      );
    }
    console.log(
      `[games-worldcup] request projectId=${projectId} ` +
        `range=${startDate}..${endDate} (${dayCount}d) competition=${COMPETITION_ID}`,
    );

    // Origin allowlist: same pattern as /config. Origin is stripped by the
    // CDN, so we fall back to Referer. Requests without either are treated
    // as infra (CDN cache warm) and let through — see isAllowedOrigin.
    const supabase = await supabaseClient();
    const project = await getProjectById(projectId, supabase);
    const requestUrl = getRequestOriginUrl(req);
    if (!isAllowedOrigin(requestUrl, project.allowed_urls)) {
      console.warn("[games-worldcup] origin not allowed", {
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
      console.warn(
        `[games-worldcup] rate limited projectId=${projectId} ` +
          `retryAfter=${rateLimit.retryAfterSeconds}s`,
      );
      return tooManyRequestsResp(rateLimit.retryAfterSeconds);
    }

    // One Schedule call per request (cached for 5 minutes in-isolate) is the
    // data source — `GamesByDate/{date}` returns 404 in v4 soccer, so we
    // pull the season schedule and filter by date client-side.
    // Memberships is fetched in parallel; both share the same season resolver.
    const tFetch = Date.now();
    const [schedule, names] = await Promise.all([
      getSchedule().catch((err) => {
        console.error("[games-worldcup] getSchedule failed", err);
        return [] as SDGame[];
      }),
      getPlayerNames().catch(() => new Map<number, string>()),
    ]);
    console.log(
      `[games-worldcup] schedule games=${schedule.length} ` +
        `players=${names.size} ms=${Date.now() - tFetch}`,
    );

    // Fan out per-day filtering + BoxScore fetches in parallel.
    const days = await Promise.all(
      dateRange.map((d) => fetchDay(d, schedule, names)),
    );
    const totalMatches = days.reduce((n, d) => n + d.matches.length, 0);
    console.log(
      `[games-worldcup] response projectId=${projectId} ` +
        `range=${startDate}..${endDate} totalMatches=${totalMatches} ` +
        `ms=${Date.now() - reqStart}`,
    );

    // Cache headers: if any day in the range is "today or future", treat the
    // whole response as live (15s s-maxage). Pure-past ranges are immutable
    // and can be cached aggressively. Preview-mode responses bypass the CDN
    // entirely so two devs scrubbing different dates don't poison each
    // other's cache entry.
    const allPast = dateRange.every((d) => d < today);
    const sMaxAge = previewDateParam ? 0 : (allPast ? 3600 : 15);
    const maxAge = previewDateParam ? 0 : (allPast ? 300 : 5);

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
