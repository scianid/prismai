// Sentry reporter for errors that originate in the browser widget running on
// publisher sites. Uses its own DSN (`SENTRY_WIDGET_DSN`) so publisher-side
// noise stays isolated from backend alerts.
//
// Implementation note: `@sentry/deno` only exports a server client, and we
// can't run two `Sentry.init()` calls in the same isolate without one
// clobbering the other. Instead of juggling multiple SDK clients, we POST
// directly to Sentry's envelope endpoint — the format is stable and
// documented (https://develop.sentry.dev/sdk/envelopes/). Zero SDK
// dependency for this path means zero surface for DSN cross-contamination.
//
// All errors here are swallowed — reporting must never break the handler.

interface ParsedDsn {
  protocol: string;
  host: string;
  projectId: string;
  publicKey: string;
}

interface WidgetSentryConfig {
  dsn: ParsedDsn;
  environment: string;
  release?: string;
}

let cachedConfig: WidgetSentryConfig | null | undefined = undefined;

function parseDsn(dsn: string): ParsedDsn | null {
  try {
    const url = new URL(dsn);
    const projectId = url.pathname.replace(/^\//, "");
    if (!projectId || !url.username) return null;
    return {
      protocol: url.protocol.replace(/:$/, ""),
      host: url.host,
      projectId,
      publicKey: url.username,
    };
  } catch {
    return null;
  }
}

function loadConfig(): WidgetSentryConfig | null {
  if (cachedConfig !== undefined) return cachedConfig;
  try {
    // @ts-ignore: Deno globals are unavailable to the editor TS server
    const dsnRaw = Deno.env.get("SENTRY_WIDGET_DSN");
    const dsn = dsnRaw ? parseDsn(dsnRaw) : null;
    if (!dsn) {
      cachedConfig = null;
      return null;
    }
    cachedConfig = {
      dsn,
      // @ts-ignore: Deno globals are unavailable to the editor TS server
      environment: Deno.env.get("SENTRY_WIDGET_ENVIRONMENT") ??
        // @ts-ignore: Deno globals are unavailable to the editor TS server
        Deno.env.get("SENTRY_ENVIRONMENT") ?? "production",
      // @ts-ignore: Deno globals are unavailable to the editor TS server
      release: Deno.env.get("SENTRY_WIDGET_RELEASE") ?? undefined,
    };
    return cachedConfig;
  } catch {
    cachedConfig = null;
    return null;
  }
}

// 32-hex-char event id, as required by the Sentry envelope format.
function eventId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

interface Frame {
  function?: string;
  filename?: string;
  lineno?: number;
  colno?: number;
}

// Best-effort stack parser for V8 and Firefox/Safari formats. Unparseable
// lines are dropped. Sentry expects frames oldest-first, so we reverse.
function parseStack(stack: string): Frame[] {
  const frames: Frame[] = [];
  const lines = stack.split("\n").map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    // V8: "at fn (file:line:col)"
    let m = line.match(/^at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)$/);
    if (m) {
      frames.push({ function: m[1], filename: m[2], lineno: +m[3], colno: +m[4] });
      continue;
    }
    // V8 anonymous: "at file:line:col"
    m = line.match(/^at\s+(.+?):(\d+):(\d+)$/);
    if (m) {
      frames.push({ filename: m[1], lineno: +m[2], colno: +m[3] });
      continue;
    }
    // Firefox/Safari: "fn@file:line:col"
    m = line.match(/^(.+?)@(.+?):(\d+):(\d+)$/);
    if (m) {
      frames.push({
        function: m[1] || undefined,
        filename: m[2],
        lineno: +m[3],
        colno: +m[4],
      });
      continue;
    }
  }
  return frames.reverse();
}

export function captureWidgetException(
  err: unknown,
  context?: { tags?: Record<string, string>; extra?: Record<string, unknown> },
): void {
  try {
    const config = loadConfig();
    if (!config) return;

    const e = err instanceof Error ? err : new Error(String(err));
    const id = eventId();
    const now = new Date();

    const frames = e.stack ? parseStack(e.stack) : [];
    const event: Record<string, unknown> = {
      event_id: id,
      timestamp: now.getTime() / 1000,
      platform: "javascript",
      level: "error",
      logger: "widget",
      environment: config.environment,
      message: e.message,
      exception: {
        values: [{
          type: e.name || "Error",
          value: e.message,
          stacktrace: frames.length > 0 ? { frames } : undefined,
        }],
      },
      tags: context?.tags ?? {},
      extra: context?.extra ?? {},
      sdk: { name: "divee.widget-error", version: "1.0.0" },
    };
    if (config.release) event.release = config.release;

    const envelope = [
      JSON.stringify({ event_id: id, sent_at: now.toISOString() }),
      JSON.stringify({ type: "event", content_type: "application/json" }),
      JSON.stringify(event),
    ].join("\n");

    const authHeader = [
      "Sentry sentry_version=7",
      `sentry_key=${config.dsn.publicKey}`,
      "sentry_client=divee-widget-error/1.0.0",
    ].join(", ");

    const envelopeUrl =
      `${config.dsn.protocol}://${config.dsn.host}/api/${config.dsn.projectId}/envelope/`;

    fetch(envelopeUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-sentry-envelope",
        "X-Sentry-Auth": authHeader,
      },
      body: envelope,
    }).catch(() => {/* never break reporting */});
  } catch {
    // never let sentry break the handler
  }
}
