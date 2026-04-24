import "jsr:@supabase/functions-js@2/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";
import { enforceContentLength } from "../_shared/responses.ts";
import { serveWithSentry } from "../_shared/sentry.ts";
import { captureWidgetException } from "../_shared/sentryWidget.ts";

// Fire-and-forget error reporting from the browser widget.
// The widget runs on third-party publisher sites where we cannot ship the
// Sentry DSN, so this function acts as a proxy: it accepts a small JSON
// payload and forwards it to Sentry server-side via the shared helper.
//
// Response is always 204 (even on bad payload) so the client never retries
// or surfaces failures to the publisher page.

interface WidgetErrorPayload {
  message?: unknown;
  stack?: unknown;
  phase?: unknown;
  project_id?: unknown;
  build_version?: unknown;
  widget_url?: unknown;
  user_agent?: unknown;
}

const MAX_STRING = 4000;

function clamp(value: unknown, max = MAX_STRING): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > max ? trimmed.slice(0, max) : trimmed;
}

export async function widgetErrorHandler(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Cap body size. A widget error payload is tiny — 8KB is generous and
  // leaves room for long stack traces while still protecting memory.
  const oversize = enforceContentLength(req, 8192);
  if (oversize) return oversize;

  try {
    let body: WidgetErrorPayload;
    try {
      body = await req.json();
    } catch {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const message = clamp(body.message) ?? "widget error (no message)";
    const stack = clamp(body.stack);
    const phase = clamp(body.phase, 120);
    const projectId = clamp(body.project_id, 120);
    const buildVersion = clamp(body.build_version, 64);
    const widgetUrl = clamp(body.widget_url, 1024);
    const userAgent = clamp(body.user_agent, 512) ??
      clamp(req.headers.get("user-agent"), 512);
    const origin = clamp(req.headers.get("origin"), 512);

    const err = new Error(message);
    if (stack) err.stack = stack;

    const tags: Record<string, string> = {};
    if (phase) tags.phase = phase;
    if (projectId) tags.project_id = projectId;
    if (buildVersion) tags.build_version = buildVersion;
    if (origin) tags.origin = origin;

    const extra: Record<string, unknown> = {};
    if (widgetUrl) extra.widget_url = widgetUrl;
    if (userAgent) extra.user_agent = userAgent;

    // Log every accepted report so we can inspect traffic 
    // in Supabase logs
    console.log(
      "[widget-error]",
      JSON.stringify({
        message,
        phase: phase ?? null,
        tags,
        widget_url: widgetUrl ?? null,
        stack_preview: stack ? stack.slice(0, 300) : null,
      }),
    );

    captureWidgetException(err, { tags, extra });
  } catch (err) {
    // Never let reporting break reporting.
    console.error("widget-error: unexpected", err);
  }

  return new Response(null, { status: 204, headers: corsHeaders });
}

// @ts-ignore: Deno globals and JSR imports are unavailable to the editor TS server
Deno.serve(serveWithSentry("widget-error", (req: Request) => widgetErrorHandler(req)));
