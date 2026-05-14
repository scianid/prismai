import "jsr:@supabase/functions-js@2/edge-runtime.d.ts";
import { getRequestOriginUrl, isAllowedOrigin } from "../_shared/origin.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { supabaseClient } from "../_shared/supabaseClient.ts";
import { errorResp, successRespWithCache, tooManyRequestsResp } from "../_shared/responses.ts";
import { getProjectById, getProjectConfigById } from "../_shared/dao/projectDao.ts";
import { checkRateLimit } from "../_shared/rateLimit.ts";
import { verifyConfigBypassToken } from "../_shared/configBypassToken.ts";
import { captureException, serveWithSentry } from "../_shared/sentry.ts";
import { resolveTranslations } from "./translations/index.ts";

// Sanitize the per-project sponsor theme before exposing it to the widget.
// Whitelists known keys, enforces type + format, drops the rest. Returning a
// sparse object is fine — the widget only applies fields it recognizes and
// falls back to divee defaults for the rest.
const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
function sanitizeColor(v: unknown): string | undefined {
  return (typeof v === "string" && v.length <= 32 && COLOR_RE.test(v)) ? v : undefined;
}
function sanitizeHttpsUrl(v: unknown): string | undefined {
  if (typeof v !== "string" || v.length > 500) return undefined;
  return /^https:\/\//.test(v) ? v : undefined;
}
function sanitizeShortText(v: unknown, max = 80): string | undefined {
  return (typeof v === "string" && v.length > 0 && v.length <= max) ? v : undefined;
}
function sanitizeTheme(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const t = raw as Record<string, unknown>;
  const out: Record<string, unknown> = {};

  if (t.brand && typeof t.brand === "object") {
    const b = t.brand as Record<string, unknown>;
    const brand: Record<string, string> = {};
    const name = sanitizeShortText(b.name);
    const logoUrl = sanitizeHttpsUrl(b.logoUrl);
    const href = sanitizeHttpsUrl(b.href);
    if (name) brand.name = name;
    if (logoUrl) brand.logoUrl = logoUrl;
    if (href) brand.href = href;
    if (Object.keys(brand).length > 0) out.brand = brand;
  }

  if (t.colors && typeof t.colors === "object") {
    const c = t.colors as Record<string, unknown>;
    const colors: Record<string, string> = {};
    for (const k of ["accent", "live", "glow", "panelBg", "cardBg", "chatAccent"]) {
      const v = sanitizeColor(c[k]);
      if (v) colors[k] = v;
    }
    if (Object.keys(colors).length > 0) out.colors = colors;
  }

  return Object.keys(out).length > 0 ? out : null;
}

// ─── Dependency injection seam ────────────────────────────────────────────
// `configHandler` takes a `ConfigDeps` object so unit tests can stub the
// Supabase DAO calls without touching the network. Production wires the
// real implementations below via `realConfigDeps`. Tests construct their
// own stubs and call `configHandler` directly. Same pattern as chat.
export interface ConfigDeps {
  supabaseClient: typeof supabaseClient;
  getProjectById: typeof getProjectById;
  getProjectConfigById: typeof getProjectConfigById;
  checkRateLimit: typeof checkRateLimit;
  verifyConfigBypassToken: typeof verifyConfigBypassToken;
}

export const realConfigDeps: ConfigDeps = {
  supabaseClient,
  getProjectById,
  getProjectConfigById,
  checkRateLimit,
  verifyConfigBypassToken,
};

export async function configHandler(
  req: Request,
  deps: ConfigDeps = realConfigDeps,
): Promise<Response> {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Get projectId from query params (GET request)
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId") ||
      url.searchParams.get("client_id");

    if (!projectId) {
      console.error(`config: missing projectId in request, url: ${req.url}`);
      return errorResp("Missing projectId", 400);
    }

    const supabase = await deps.supabaseClient();

    // Fetch project and project_config in parallel
    const [project, projectConfig] = await Promise.all([
      deps.getProjectById(projectId, supabase),
      deps.getProjectConfigById(projectId, supabase),
    ]);

    const requestUrl = getRequestOriginUrl(req);

    // SECURITY_AUDIT_TODO item 7: the bypass is now a short-lived
    // HMAC-signed token carrying an operator identifier and explicit
    // expiry — not a static shared secret. See
    // _shared/configBypassToken.ts for the rationale.
    //
    // The bypass token is accepted from either the `bypass_token` query
    // param (for quick curl use) or the `x-config-bypass-token` header
    // (for tooling that prefers headers). Both must pass the same
    // verification; we pick whichever is supplied.
    const bypassToken = url.searchParams.get("bypass_token") ??
      req.headers.get("x-config-bypass-token");

    let isBypassed = false;
    if (bypassToken) {
      const verified = await deps.verifyConfigBypassToken(bypassToken);
      if (verified) {
        isBypassed = true;
        // Attribution log. `operator` is an allowlisted ASCII identifier,
        // and the raw token is never logged — incident response can
        // still correlate by operator + timestamp.
        console.warn("config: bypass token accepted", {
          operator: verified.operator,
          expiresMs: verified.expiresMs,
          projectId,
        });
      } else {
        console.warn("config: bypass token rejected", {
          tokenPrefix: bypassToken.substring(0, 8) + "...",
          projectId,
        });
      }
    }

    if (!isBypassed && !isAllowedOrigin(requestUrl, project.allowed_urls)) {
      console.warn("config: origin not allowed", {
        attempted: requestUrl,
        allowed: project.allowed_urls,
        projectId,
      });
      return errorResp("Origin not allowed", 403);
    }

    // Rate-limit per IP and per project (SECURITY_AUDIT_TODO item 2).
    // Runs AFTER origin check so unauthorized traffic never consumes the
    // quota. visitor_id is unknown at config time (called on initial
    // widget mount), so we only check the IP-level and project-level
    // buckets here.
    const rateLimit = await deps.checkRateLimit(
      supabase,
      "config",
      null,
      projectId,
      req.headers.get("cf-connecting-ip"),
    );
    if (rateLimit.limited) {
      return tooManyRequestsResp(rateLimit.retryAfterSeconds);
    }

    // Map database fields to widget config format
    const config = {
      direction: project.direction || "ltr",
      language: project.language || "en",
      icon_url: project.icon_url || "",
      client_name: project.client_name || "",
      client_description: project.client_description || "",
      highlight_color: project.highlight_color || ["#68E5FD", "#A389E0"],
      enabled: project.enabled !== false,
      show_ad: typeof project.show_ad === "boolean" ? project.show_ad : true,
      input_text_placeholders: project.input_text_placeholders || [
        "Ask anything about this article...",
      ],
      display_mode: project.display_mode || "anchored",
      // Worldcup widgets accept all 4 corners; standard floating widgets only
      // use bottom-left / bottom-right today. Letting the broader set through
      // for worldcup keeps the /config response shape stable for both.
      display_position:
        ["bottom-left", "bottom-right", "top-left", "top-right"].includes(project.display_position)
          ? project.display_position
          : "bottom-right",
      anchored_position: ["top", "bottom"].includes(project.display_position)
        ? project.display_position
        : "bottom",
      article_class: project.article_class || null,
      article_class_fallbacks: Array.isArray(project.article_class_fallbacks)
        ? project.article_class_fallbacks.filter((s: unknown) =>
          typeof s === "string" && s.trim().length > 0
        )
        : [],
      widget_container_class: project.widget_container_class || null,
      widget_container_class_fallbacks: Array.isArray(project.widget_container_class_fallbacks)
        ? project.widget_container_class_fallbacks.filter((s: unknown) =>
          typeof s === "string" && s.trim().length > 0
        )
        : [],
      override_mobile_container_selector: project.override_mobile_container_selector || null,
      disclaimer_text: project.disclaimer_text || null,
      widget_type: project.widget_type === "worldcup" ? "worldcup" : "standard",
      widget_mode: project.widget_mode || "article",
      ui_theme: project.ui_theme === "dark" ? "dark" : "light",
      ask_concent: project.ask_concent === true,
      allowed_urls: project.allowed_urls || [],
      // Per-project experimental feature toggles. Flat { key: boolean } map.
      // The widget reads from this and falls back to its hard-coded default
      // when a key is unset — admins can flip features remotely without
      // shipping new widget code.
      experimental: (project.experimental && typeof project.experimental === "object")
        ? project.experimental
        : {},
      // Per-project sponsor theme override. null = use divee defaults.
      // Shape: { brand: { name, logoUrl, href }, colors: { accent, live,
      // glow, panelBg, cardBg, chatAccent } }. Each field is independently
      // optional; sanitizeTheme strips malformed entries.
      theme: sanitizeTheme(project.theme),
      // `language_code` is the canonical ISO 639-1 key for the
      // translation bundle. Rows where it is NULL (unknown language
      // at analyze time) resolve to the English default inside
      // resolveTranslations — that is the intended UX, not a fallback.
      // Bundle includes launcherAsk / launcherWorldCup for the sports widget.
      translations: resolveTranslations(project.language_code),
      // Merge project_config fields (e.g., ad tag ID, ad size overrides)
      ...(projectConfig && {
        ad_tag_id: projectConfig.ad_tag_id || null,
        override_mobile_ad_size: projectConfig.override_mobile_ad_size || null,
        override_desktop_ad_size: projectConfig.override_desktop_ad_size ||
          null,
        white_label: projectConfig.white_label || false,
      }),
    };

    return successRespWithCache(config);
  } catch (error) {
    console.error("Error:", error);
    captureException(error, { handler: "config" });
    return errorResp("Internal Server Error", 500);
  }
}

// @ts-ignore: Deno globals and JSR imports are unavailable to the editor TS server
Deno.serve(serveWithSentry("config", (req: Request) => configHandler(req)));
