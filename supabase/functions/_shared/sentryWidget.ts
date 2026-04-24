// Sentry reporter for errors that originate in the browser widget running on
// publisher sites. Uses its own DSN (`SENTRY_WIDGET_DSN`) so publisher-side
// noise stays isolated from backend alerts.
//
// Mirrors the init + swallow-errors discipline of `./sentry.ts`, but owns a
// separate Sentry client via a dedicated scope + `BrowserClient` so calling
// `Sentry.init()` for the backend DSN elsewhere in the same isolate doesn't
// clobber this one.
//
// Initialization is lazy + idempotent; if the DSN is missing, all calls
// become no-ops so local/dev runs don't need Sentry configured.

import * as Sentry from "npm:@sentry/deno@8";

let widgetClient: Sentry.BrowserClient | null = null;
let initialized: boolean | null = null;

function init(): boolean {
  if (initialized !== null) return initialized;
  try {
    // @ts-ignore: Deno globals are unavailable to the editor TS server
    const dsn = Deno.env.get("SENTRY_WIDGET_DSN");
    if (!dsn) {
      initialized = false;
      return false;
    }
    widgetClient = new Sentry.BrowserClient({
      dsn,
      // @ts-ignore: Deno globals are unavailable to the editor TS server
      environment: Deno.env.get("SENTRY_WIDGET_ENVIRONMENT") ??
        // @ts-ignore: Deno globals are unavailable to the editor TS server
        Deno.env.get("SENTRY_ENVIRONMENT") ?? "production",
      // @ts-ignore: Deno globals are unavailable to the editor TS server
      release: Deno.env.get("SENTRY_WIDGET_RELEASE") ?? undefined,
      tracesSampleRate: 0,
      integrations: [],
      transport: Sentry.makeFetchTransport,
      stackParser: Sentry.defaultStackParser,
    });
    widgetClient.init();
    initialized = true;
  } catch (_e) {
    initialized = false;
  }
  return initialized;
}

export function captureWidgetException(
  err: unknown,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, unknown>;
  },
): void {
  try {
    if (!init() || !widgetClient) return;
    const scope = new Sentry.Scope();
    scope.setClient(widgetClient);
    if (context?.tags) {
      for (const [k, v] of Object.entries(context.tags)) scope.setTag(k, v);
    }
    if (context?.extra) scope.setContext("extra", context.extra);
    scope.captureException(err);
  } catch (_e) {
    // never let sentry break the handler
  }
}
