import "jsr:@supabase/functions-js@2/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import {
  enforceContentLength,
  errorResp,
  successResp,
  tooManyRequestsResp,
} from "../_shared/responses.ts";
import { classifyAdContext } from "../_shared/ai.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";
import { getProjectById } from "../_shared/dao/projectDao.ts";
import { getRequestOriginUrl, isAllowedOriginStrict } from "../_shared/origin.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";

// ─── Teads In-Chat Recommendation API (V2.0) ──────────────────────────────
// Conversation-aware sponsored-content endpoint. The widget POSTs the recent
// conversation; this function derives IAB categories + keywords from it (cheap
// mini-model call), then proxies to the Teads in-chat-recs API.
//
// IMPORTANT: response_version / response_types are QUERY params, not body
// fields. The request body carries only keywords / iabCategories / chat.
const TEADS_ENDPOINT = "https://mv.outbrain.com/Multivac/api/in-chat-recs";
const DEFAULT_UA = "Mozilla/5.0 (compatible; DiveeBot/1.0; +https://divee.ai)";
const TEADS_TIMEOUT_MS = 20000;

// Project IDs allowed to fetch ads. Hardcoded for now — add more entries to
// the array to enable additional projects.
const ENABLED_PROJECT_IDS: string[] = [
  "26853c64-1104-4525-b62c-66367d925b12",
];

// IAB Content Taxonomy code shape (e.g. IAB1, IAB1-2). Anything the model
// emits that does not match is dropped before it reaches Teads — an invalid
// code is a common cause of upstream 500s.
const IAB_CODE_RE = /^IAB\d+(-\d+)?$/i;

type UrlParam = "portalUrl" | "contentUrl" | "bundleUrl";

interface ConvMessage {
  role: string;
  content: string;
}

interface AdsRequestBody {
  // projectId is required — it gates the per-project allowlist.
  projectId?: string;
  url?: string;
  // Page/article title — extra topical context for classification.
  title?: string;
  // Which URL param to send the page address as. `contentUrl` is correct for
  // web pages (lets Teads contextualise the actual article).
  urlType?: UrlParam;
  // Conversation transcript — used to derive IAB categories + keywords.
  messages?: ConvMessage[];
  // Conversation id — caches the classification so we don't re-run the LLM
  // on every fetch within the same conversation.
  conversationId?: string;
  visitor_id?: string;
  // Explicit overrides — win over classification (used by raw curl tests).
  chat?: string;
  keywords?: string[];
  iabCategories?: string[];
  lang?: string;
  // Query-param knobs — defaults match the verified-working request.
  responseTypes?: string[];
  displaySizes?: string;
  apiConsent?: string;
  consentString?: string; // TCF v2 string -> cnsntv2
  scrW?: number;
  scrH?: number;
}

interface NormalizedAd {
  position: number | null;
  type: string | null;
  url: string | null;
  thumbnail: string | null;
  source: string | null;
  headline: string | null;
  description: string | null;
  domain: string | null;
  cta: string | null;
  trackers: {
    reportServed: string | null;
    pixels: string[];
    onViewed: string[];
  };
}

// ── Classification cache ────────────────────────────────────────────────
// Per-conversation, in-isolate cache of the derived IAB/keywords. Avoids a
// paid LLM call on every fetch within a conversation. Best-effort: an isolate
// recycle just means one extra classification, never wrong behaviour.
interface CachedContext {
  iabCategories: string[];
  keywords: string[];
  ts: number;
}
const classifyCache = new Map<string, CachedContext>();
const CLASSIFY_TTL_MS = 5 * 60_000;
const CLASSIFY_CACHE_MAX = 500;

// ── Dependency-injection seam ───────────────────────────────────────────
// `adsHandler` takes an `AdsDeps` object so unit tests can stub the project
// lookup, rate limiter, classifier, and the Teads fetch — no network. Same
// pattern as chat/suggestions.
export interface AdsDeps {
  supabaseClient: typeof supabaseClient;
  getProjectById: typeof getProjectById;
  checkRateLimit: typeof checkRateLimit;
  classifyAdContext: typeof classifyAdContext;
  fetchTeads: typeof fetch;
}

export const realAdsDeps: AdsDeps = {
  supabaseClient,
  getProjectById,
  checkRateLimit,
  classifyAdContext,
  fetchTeads: (input, init) => fetch(input, init),
};

// The Teads response groups documents under `results` keyed by engine. Field
// names are not strictly contractual across engines, so normalization stays
// defensive — any missing field becomes null rather than throwing.
export function normalizeAds(raw: unknown): NormalizedAd[] {
  const ads: NormalizedAd[] = [];
  const results = (raw as Record<string, unknown>)?.results;
  if (!results || typeof results !== "object") return ads;

  for (const group of Object.values(results as Record<string, unknown>)) {
    const reportServed = (group as Record<string, unknown>)?.["reportServed"] as string ??
      null;
    const documents = (group as Record<string, unknown>)?.["documents"];
    if (!Array.isArray(documents)) continue;

    for (const doc of documents) {
      const d = doc as Record<string, unknown>;
      const tracking = (d["doc_tracking"] ?? {}) as Record<string, unknown>;
      const pixels = Array.isArray(tracking["pixels"]) ? (tracking["pixels"] as string[]) : [];
      const onViewed = Array.isArray(tracking["on-viewed"])
        ? (tracking["on-viewed"] as string[])
        : [];

      // Field names per the Teads in-chat-recs V2.0 document schema:
      // pos / adType / thumbnail_url / source_display_name / content (=headline)
      // / description / target_domain / cta.
      const posRaw = d["pos"];
      const position = typeof posRaw === "number"
        ? posRaw
        : (typeof posRaw === "string" && posRaw.trim() !== "" &&
            Number.isFinite(Number(posRaw)))
        ? Number(posRaw)
        : null;
      // Teads/Outbrain returns some fields wrapped in HTML (e.g. source as
      // `<span class="ob-us">US</span>`). Strip tags + decode basic entities
      // so the widget can render it as plain text — never inject 3rd-party
      // HTML into the page (XSS).
      const str = (v: unknown): string | null => {
        if (typeof v !== "string") return null;
        const cleaned = v
          .replace(/<[^>]*>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#0*39;|&apos;/g, "'")
          .replace(/&nbsp;/g, " ")
          .replace(/\s+/g, " ")
          .trim();
        return cleaned.length > 0 ? cleaned : null;
      };

      ads.push({
        position,
        type: str(d["adType"] ?? d["ad_type"] ?? d["type"]),
        url: str(d["url"] ?? d["click_url"]),
        thumbnail: str(d["thumbnail_url"] ?? d["thumbnail"] ?? d["image"]),
        source: str(d["source_display_name"] ?? d["source_name"] ?? d["source"]),
        headline: str(d["content"] ?? d["headline"] ?? d["title"]),
        description: str(d["description"]),
        domain: str(d["target_domain"] ?? d["domain"]),
        cta: str(d["cta"]),
        trackers: { reportServed, pixels, onViewed },
      });
    }
  }
  return ads;
}

// Keep only well-formed IAB codes — guards Teads against hallucinated input.
export function validIabCodes(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((c): c is string => typeof c === "string" && IAB_CODE_RE.test(c.trim()))
    .map((c) => c.trim());
}

export async function adsHandler(
  req: Request,
  deps: AdsDeps = realAdsDeps,
): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return errorResp("Method not allowed", 405, { error: "Method not allowed" });
  }

  const oversize = enforceContentLength(req, 262144);
  if (oversize) return oversize;

  const widgetJsId = Deno.env.get("TEADS_WIDGET_JS_ID");
  const apiKey = Deno.env.get("TEADS_API_KEY");
  if (!widgetJsId || !apiKey) {
    return errorResp(
      "Missing TEADS_WIDGET_JS_ID or TEADS_API_KEY",
      500,
      { error: "Ad service not configured" },
    );
  }

  let body: AdsRequestBody;
  try {
    body = await req.json();
  } catch {
    return errorResp("Invalid JSON body", 400, { error: "Invalid JSON body" });
  }

  // ── Per-project allowlist gate ──────────────────────────────────────────
  // A disabled (or unknown) project is not an error — return 200 with an
  // empty ad list so the widget simply renders nothing.
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  if (!projectId || !ENABLED_PROJECT_IDS.includes(projectId)) {
    return successResp({ ads: [], reason: "project_not_enabled" });
  }

  const supabase = deps.supabaseClient();

  // ── Origin enforcement ──────────────────────────────────────────────────
  // The endpoint triggers paid LLM + Teads calls, so it must only serve the
  // publisher's own pages. projectId is not a secret (it ships in the widget
  // markup), so the origin host is the real gate.
  let project: { allowed_urls?: string[] | null } | null = null;
  try {
    project = await deps.getProjectById(projectId, supabase);
  } catch (err) {
    console.error("chat-ads: project lookup failed", err);
  }
  const originUrl = getRequestOriginUrl(req);
  if (!project || !isAllowedOriginStrict(originUrl, project.allowed_urls)) {
    return errorResp("Origin not allowed", 403, { error: "Origin not allowed" });
  }

  // ── Rate limiting ───────────────────────────────────────────────────────
  // cf-connecting-ip is set by the edge and cannot be forged by the client,
  // unlike x-forwarded-for.
  const clientIp = req.headers.get("cf-connecting-ip");
  const visitorId = (typeof body.visitor_id === "string" && body.visitor_id.length > 0 &&
      body.visitor_id.length <= 128)
    ? body.visitor_id
    : null;
  const rl = await deps.checkRateLimit(supabase, "chat-ads", visitorId, projectId, clientIp);
  if (rl.limited) return tooManyRequestsResp(rl.retryAfterSeconds);

  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return errorResp("Missing 'url'", 400, { error: "Missing 'url'" });
  }
  // `portalUrl` is the only URL param the Teads in-chat-recs endpoint accepts
  // in practice — `contentUrl` returns HTTP 500. Kept overridable in case
  // that changes upstream.
  const urlType: UrlParam = (body.urlType === "contentUrl" || body.urlType === "bundleUrl")
    ? body.urlType
    : "portalUrl";
  const lang = (typeof body.lang === "string" && body.lang.length === 2)
    ? body.lang.toLowerCase()
    : "en";
  const responseTypes = Array.isArray(body.responseTypes) && body.responseTypes.length > 0
    ? body.responseTypes
    : ["BrandDisplay", "embeddings"];

  // ── Derive targeting from the conversation ──────────────────────────────
  // Explicit body fields win. Otherwise classify the transcript — cached per
  // conversation so the LLM runs at most once per CLASSIFY_TTL_MS. Failure is
  // non-fatal: Teads still serves on keywords alone.
  const messages = Array.isArray(body.messages) ? body.messages : [];
  const title = typeof body.title === "string" ? body.title : null;
  let iabCategories: string[] | null = Array.isArray(body.iabCategories)
    ? validIabCodes(body.iabCategories)
    : null;
  let keywords: string[] | null = Array.isArray(body.keywords) ? body.keywords : null;

  if ((!iabCategories || !keywords) && messages.length > 0) {
    const convId = typeof body.conversationId === "string" ? body.conversationId : "";
    const cacheKey = convId ? `${projectId}:${convId}` : "";
    const cached = cacheKey ? classifyCache.get(cacheKey) : undefined;

    if (cached && Date.now() - cached.ts < CLASSIFY_TTL_MS) {
      iabCategories = iabCategories ?? cached.iabCategories;
      keywords = keywords ?? cached.keywords;
    } else {
      try {
        const ctx = await deps.classifyAdContext(messages, lang, title);
        const iab = validIabCodes(ctx.iabCategories);
        iabCategories = iabCategories ?? iab;
        keywords = keywords ?? ctx.keywords;
        if (cacheKey) {
          classifyCache.set(cacheKey, {
            iabCategories: iab,
            keywords: ctx.keywords,
            ts: Date.now(),
          });
          if (classifyCache.size > CLASSIFY_CACHE_MAX) {
            classifyCache.delete(classifyCache.keys().next().value as string);
          }
        }
      } catch (err) {
        console.error("chat-ads: classifyAdContext failed", err);
      }
    }
  }

  // Privacy: never forward raw user message text to Outbrain. The `chat`
  // free-text is the LLM-derived keywords (already abstracted, non-PII).
  const chat = typeof body.chat === "string" ? body.chat : (keywords ?? []).join(" ");

  // ── Build the Teads request ─────────────────────────────────────────────
  const params = new URLSearchParams({
    [urlType]: url,
    key: apiKey,
    lang,
    widgetJSId: widgetJsId,
    api_consent: typeof body.apiConsent === "string" ? body.apiConsent : "1",
    display_sizes: typeof body.displaySizes === "string" ? body.displaySizes : "300x250",
    response_version: "2.0",
    response_types: responseTypes.join(","),
  });
  if (typeof body.scrW === "number") params.set("scrW", String(body.scrW));
  if (typeof body.scrH === "number") params.set("scrH", String(body.scrH));
  if (typeof body.consentString === "string" && body.consentString) {
    params.set("cnsntv2", body.consentString);
  }
  const teadsUrl = `${TEADS_ENDPOINT}?${params.toString()}`;

  const userAgent = req.headers.get("user-agent") ?? DEFAULT_UA;

  const teadsBody = {
    keywords: keywords ?? [],
    iabCategories: iabCategories ?? [],
    chat,
  };

  let raw: unknown;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TEADS_TIMEOUT_MS);
  try {
    const teadsRes = await deps.fetchTeads(teadsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": userAgent,
        // X-Forwarded-For must carry the end-user IP. Use the edge-trusted
        // cf-connecting-ip, NOT a client-supplied x-forwarded-for (spoofable
        // → ad fraud / invalid traffic).
        ...(clientIp ? { "X-Forwarded-For": clientIp } : {}),
      },
      body: JSON.stringify(teadsBody),
      signal: controller.signal,
    });

    const text = await teadsRes.text();
    if (!teadsRes.ok) {
      return errorResp(
        `Teads API error ${teadsRes.status}`,
        502,
        { error: "Upstream ad service error", status: teadsRes.status, body: text },
      );
    }

    try {
      raw = JSON.parse(text);
    } catch {
      return errorResp(
        "Teads API returned non-JSON",
        502,
        { error: "Upstream ad service returned non-JSON", body: text },
      );
    }
  } catch (err) {
    const aborted = err instanceof DOMException && err.name === "AbortError";
    return errorResp(
      `Teads API fetch failed: ${err}`,
      aborted ? 504 : 502,
      { error: aborted ? "Ad service timed out" : "Failed to reach ad service" },
    );
  } finally {
    clearTimeout(timer);
  }

  // Prefer paid inventory — documents with impression pixels are monetised
  // sponsored ads; the rest are unpaid organic recommendations.
  const all = normalizeAds(raw);
  const paid = all.filter((a) => a.trackers.pixels.length > 0);
  const ads = (paid.length > 0 ? paid : all).slice(0, 3);
  return successResp({ ads });
}

Deno.serve((req: Request) => adsHandler(req));
