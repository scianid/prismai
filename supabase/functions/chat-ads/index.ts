import "jsr:@supabase/functions-js@2/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { enforceContentLength, errorResp, successResp } from "../_shared/responses.ts";
import { classifyAdContext } from "../_shared/ai.ts";

// ─── Teads In-Chat Recommendation API (V2.0) ──────────────────────────────
// Conversation-aware sponsored-content endpoint. The widget POSTs the recent
// conversation; this function derives IAB categories + keywords from it (cheap
// mini-model call), then proxies to the Teads in-chat-recs API.
//
// IMPORTANT: response_version / response_types are QUERY params, not body
// fields. The request body carries only keywords / iabCategories / chat.
const TEADS_ENDPOINT = "https://mv.outbrain.com/Multivac/api/in-chat-recs";
const DEFAULT_UA = "Mozilla/5.0 (compatible; DiveeBot/1.0; +https://divee.ai)";

type UrlParam = "portalUrl" | "contentUrl" | "bundleUrl";

interface ConvMessage {
  role: string;
  content: string;
}

interface AdsRequestBody {
  // projectId is required — it gates the per-project allowlist.
  projectId?: string;
  url?: string;
  // Which URL param to send the page address as. Teads accepts one of three;
  // `portalUrl` is the verified-working default.
  urlType?: UrlParam;
  // Conversation transcript — used to derive IAB categories + keywords + chat
  // text. Optional: explicit `keywords`/`iabCategories`/`chat` override it.
  messages?: ConvMessage[];
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

// Project IDs allowed to fetch ads. Hardcoded for now — add more entries to
// the array to enable additional projects.
const ENABLED_PROJECT_IDS: string[] = [
  "26853c64-1104-4525-b62c-66367d925b12",
];

// The Teads response groups documents under `results` keyed by engine. Field
// names are not strictly contractual across engines, so normalization stays
// defensive — any missing field becomes null rather than throwing.
function normalizeAds(raw: unknown): NormalizedAd[] {
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

Deno.serve(async (req: Request): Promise<Response> => {
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

  const url = typeof body.url === "string" ? body.url.trim() : "";
  if (!url) {
    return errorResp("Missing 'url'", 400, { error: "Missing 'url'" });
  }
  const urlType: UrlParam = (body.urlType === "contentUrl" || body.urlType === "bundleUrl")
    ? body.urlType
    : "portalUrl";
  const lang = (typeof body.lang === "string" && body.lang.length === 2)
    ? body.lang.toLowerCase()
    : "en";
  const responseTypes = Array.isArray(body.responseTypes) &&
      body.responseTypes.length > 0
    ? body.responseTypes
    : ["BrandDisplay", "embeddings"];

  // ── Derive targeting from the conversation ──────────────────────────────
  // Explicit body fields win (useful for raw curl tests); otherwise classify
  // the transcript. Classification failure is non-fatal — Teads still serves
  // on free-text `chat` alone.
  const messages = Array.isArray(body.messages) ? body.messages : [];
  let iabCategories = Array.isArray(body.iabCategories) ? body.iabCategories : null;
  let keywords = Array.isArray(body.keywords) ? body.keywords : null;
  let chat = typeof body.chat === "string" ? body.chat : null;

  if ((!iabCategories || !keywords) && messages.length > 0) {
    try {
      const ctx = await classifyAdContext(messages, lang);
      if (!iabCategories) iabCategories = ctx.iabCategories;
      if (!keywords) keywords = ctx.keywords;
    } catch (err) {
      console.error("chat-ads: classifyAdContext failed", err);
    }
  }
  if (chat === null) {
    // Free-text context = the user's own messages, newest emphasis.
    chat = messages
      .filter((m) => m.role === "user")
      .slice(-6)
      .map((m) => String(m.content).slice(0, 500))
      .join(" ");
  }

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

  // X-Forwarded-For must carry the end-user IP — forwarded from the widget
  // visitor's request.
  const forwardedFor = req.headers.get("x-forwarded-for") ??
    req.headers.get("cf-connecting-ip") ?? "";
  const userAgent = req.headers.get("user-agent") ?? DEFAULT_UA;

  // Body carries ONLY targeting signals.
  const teadsBody = {
    keywords: keywords ?? [],
    iabCategories: iabCategories ?? [],
    chat: chat ?? "",
  };

  let raw: unknown;
  try {
    const teadsRes = await fetch(teadsUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": userAgent,
        ...(forwardedFor ? { "X-Forwarded-For": forwardedFor } : {}),
      },
      body: JSON.stringify(teadsBody),
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
    return errorResp(
      `Teads API fetch failed: ${err}`,
      502,
      { error: "Failed to reach ad service" },
    );
  }

  const ads = normalizeAds(raw).slice(0, 3);
  return successResp({ ads });
});
