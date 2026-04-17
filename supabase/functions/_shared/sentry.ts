// Lightweight Sentry wrapper for Deno edge functions.
//
// Initialization is lazy + idempotent: the first call to `captureException` or
// `serveWithSentry` reads SENTRY_DSN from the environment and initializes the
// SDK. If the DSN is missing, all calls become no-ops so local/dev runs don't
// need Sentry configured. Errors from Sentry itself are swallowed — reporting
// must never break the request path.

import * as Sentry from "npm:@sentry/deno@8";

let initialized: boolean | null = null;

function init(): boolean {
  if (initialized !== null) return initialized;
  try {
    // @ts-ignore: Deno globals are unavailable to the editor TS server
    const dsn = Deno.env.get("SENTRY_DSN");
    if (!dsn) {
      initialized = false;
      return false;
    }
    Sentry.init({
      dsn,
      // @ts-ignore: Deno globals are unavailable to the editor TS server
      environment: Deno.env.get("SENTRY_ENVIRONMENT") ?? "production",
      // @ts-ignore: Deno globals are unavailable to the editor TS server
      release: Deno.env.get("SENTRY_RELEASE") ?? undefined,
      tracesSampleRate: 0,
      defaultIntegrations: false,
    });
    initialized = true;
  } catch (_e) {
    initialized = false;
  }
  return initialized;
}

export function captureException(
  err: unknown,
  context?: { handler?: string; tags?: Record<string, string>; extra?: Record<string, unknown> },
): void {
  try {
    if (!init()) return;
    Sentry.withScope((scope) => {
      if (context?.handler) scope.setTag("handler", context.handler);
      if (context?.tags) {
        for (const [k, v] of Object.entries(context.tags)) scope.setTag(k, v);
      }
      if (context?.extra) scope.setContext("extra", context.extra);
      Sentry.captureException(err);
    });
  } catch (_e) {
    // never let sentry break the handler
  }
}

// Wraps a request handler so any thrown error is reported to Sentry before the
// runtime sees it. Handlers that already try/catch internally should also call
// `captureException` directly so we don't lose context when they swallow the
// error into a 500 response.
export function serveWithSentry(
  handlerName: string,
  handler: (req: Request) => Promise<Response> | Response,
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    try {
      return await handler(req);
    } catch (err) {
      captureException(err, { handler: handlerName });
      throw err;
    }
  };
}
