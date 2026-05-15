// I6 mitigation: strip PII-bearing query params from URL strings before
// they reach analytics_impressions in the secondary project.
//
// Threat: publishers may link to articles with `?email=...`, `?token=...`,
// or OAuth-implicit-flow fragments (`#access_token=...`). The widget reads
// `window.location.href` for several event fields; without scrubbing,
// those credentials/PII land in our analytics table verbatim.
//
// The scrub runs at every place we ship URL data outbound:
//   - `analytics/index.ts` (the widget→secondary proxy)
//   - `_shared/analytics.ts` `logEvent` / `logEventBatch` (server-side
//     event shippers used by `chat`, `suggestions`, etc.)
//
// Matching is case-insensitive. Both absolute and root-relative URLs are
// supported; non-URL strings are returned unchanged.

export const DEFAULT_BLOCKED_PARAMS: ReadonlySet<string> = new Set([
  // Email / identity
  "email",
  "e_mail",
  "email_address",
  // Bearer / session credentials
  "token",
  "access_token",
  "id_token",
  "refresh_token",
  "jwt",
  "auth",
  "authorization",
  "session",
  "session_id",
  "sessionid",
  "sid",
  // Secrets / API keys
  "password",
  "passwd",
  "pwd",
  "secret",
  "api_key",
  "apikey",
  // One-time / hash-style values that often carry tokens
  "otp",
  "hash",
]);

const SCRUB_BASE = "https://__scrub_base__.invalid";

// L-7: JWTs ride in path segments (`/reset/eyJ...`) and nested
// `redirect_uri=` values, not just blocked query params — and a path-only
// URL never reaches the param logic below. The `eyJ` prefix is base64url of
// `{"`, the start of every JWT header, so this anchor is near-zero false
// positive against real slugs. Matched anywhere in the string.
const JWT_RE = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;

/** Strip blocked query params, OAuth-style fragments, and JWT-shaped tokens
 *  from a URL string. Returns the input unchanged when there's nothing to
 *  strip or it doesn't parse as a URL. */
export function scrubUrl(
  s: string,
  blocked: ReadonlySet<string> = DEFAULT_BLOCKED_PARAMS,
): string {
  if (typeof s !== "string") return s;

  // Redact JWT-shaped tokens anywhere in the string first — this also
  // covers path segments, which the query-param logic below never reaches.
  let working = s.replace(JWT_RE, "[redacted]");
  let mutated = working !== s;

  if (working.indexOf("?") < 0 && working.indexOf("#") < 0) {
    return mutated ? working : s;
  }

  let url: URL;
  let isRelative = false;
  try {
    url = new URL(working);
  } catch {
    try {
      url = new URL(working, SCRUB_BASE);
      isRelative = true;
    } catch {
      return mutated ? working : s;
    }
  }

  const keysToDelete: string[] = [];
  for (const key of url.searchParams.keys()) {
    if (blocked.has(key.toLowerCase())) keysToDelete.push(key);
  }
  for (const key of keysToDelete) {
    url.searchParams.delete(key);
    mutated = true;
  }

  // OAuth implicit-flow tokens land in the fragment (`#access_token=...`).
  // Drop any `key=value`-shaped fragment outright — it can't be tracked
  // server-side anyway (browsers don't send fragments in the referer).
  if (url.hash && url.hash.includes("=")) {
    url.hash = "";
    mutated = true;
  }

  if (!mutated) return s;

  if (isRelative) {
    return url.pathname + url.search + url.hash;
  }
  return url.toString();
}

/** Recursively walk a JSON value and scrub URL-shaped strings in place
 *  (returning a new value; input is not mutated). */
export function scrubValue(
  v: unknown,
  blocked: ReadonlySet<string> = DEFAULT_BLOCKED_PARAMS,
): unknown {
  if (typeof v === "string") return scrubUrl(v, blocked);
  if (Array.isArray(v)) return v.map((x) => scrubValue(x, blocked));
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = scrubValue(val, blocked);
    }
    return out;
  }
  return v;
}
