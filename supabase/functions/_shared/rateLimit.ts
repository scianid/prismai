import { hashForLog } from "./logSafe.ts";

/**
 * Edge function rate limiter.
 *
 * Uses a 1-minute tumbling window backed by the `ai_rate_limits` Postgres table.
 * The `increment_rate_limit` DB function performs an atomic INSERT … ON CONFLICT
 * DO UPDATE, so there is no read-then-write race condition.
 *
 * Limits are per-endpoint, per-key-type. See the `LIMITS` map below for
 * current values. SECURITY_AUDIT_TODO.md item 2 tracks the rationale for
 * the expansion beyond the original /chat + /suggestions coverage.
 */

type SupabaseClient = any;

export type RateLimitResult =
  | { limited: false }
  | { limited: true; retryAfterSeconds: number };

export type RateLimitEndpoint =
  | "chat"
  | "suggestions"
  | "config"
  | "articles"
  | "analytics"
  | "games";

/**
 * Limits by endpoint and key type. Visitor and IP limits apply only when
 * the corresponding identifier is known; a limit of 0 for any key means
 * "no check for this endpoint". The project limit is ALWAYS checked — it
 * is the ceiling that protects an individual publisher against bulk
 * enumeration.
 *
 * The IP layer protects the project ceiling from being eaten by a single
 * attacker who rotates fake visitor_ids within the project budget. IP
 * budgets are roughly half of the project ceiling: high enough that
 * shared-NAT traffic from a real office doesn't trip, low enough that a
 * single IP cannot dominate the project window. Revisit after observing
 * production traffic patterns.
 *
 * Budgets set per SECURITY_AUDIT_TODO.md:
 *   /chat        — 20 visitor / 250 ip / 500 project  (AI path is expensive)
 *   /suggestions — 5 visitor  / 100 ip / 200 project  (AI path is expensive)
 *   /config      — visitor unused / 150 ip / 300 project (1 call per page load)
 *   /articles    — visitor unused / 150 ip / 300 project (discovery, not hot)
 *   /analytics   — 60 visitor / 500 ip / 1000 project (hottest, but cheap)
 *   /games       — visitor unused / 300 ip / 2000 project (live polling; CDN
 *                  absorbs duplicates so most edge hits come from cache misses
 *                  and unique IPs, but a single NAT can host many viewers)
 */
const LIMITS: Record<
  RateLimitEndpoint,
  Record<"visitor" | "ip" | "project", number>
> = {
  chat: { visitor: 20, ip: 250, project: 500 },
  suggestions: { visitor: 5, ip: 100, project: 200 },
  config: { visitor: 0, ip: 150, project: 300 },
  articles: { visitor: 0, ip: 150, project: 300 },
  analytics: { visitor: 60, ip: 500, project: 1000 },
  games: { visitor: 0, ip: 300, project: 2000 },
};

/**
 * Check and increment both the visitor-level and project-level rate limit
 * counters for the given endpoint in a single 1-minute window.
 *
 * Returns `{ limited: true, retryAfterSeconds }` if either limit is exceeded,
 * or `{ limited: false }` to allow the request through.
 *
 * Errors from the DB are logged and silently ignored (fail-open) to avoid
 * blocking legitimate traffic due to a transient DB issue.
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  endpoint: RateLimitEndpoint,
  visitorId: string | null | undefined,
  projectId: string,
  clientIp: string | null | undefined,
): Promise<RateLimitResult> {
  const limits = LIMITS[endpoint];
  const windowStart = new Date(Math.floor(Date.now() / 60_000) * 60_000)
    .toISOString();
  const retryAfterSeconds = Math.ceil(
    (Math.floor(Date.now() / 60_000) * 60_000 + 60_000 - Date.now()) / 1000,
  );

  // Keys to check: always check project; check visitor and IP only when
  // the identifier is known AND the endpoint defines a nonzero limit for
  // that key type. A limit of 0 in LIMITS means "no check".
  //
  // SECURITY_AUDIT_TODO item 4: the DB `key` must embed the raw identifier
  // (visitorId / IP) so each bucket is stable across calls, but logs must
  // never leak the raw value. We pre-compute a `logKey` alongside each
  // check where the sensitive portion is replaced with a hashForLog tag.
  const checks: Array<{ key: string; logKey: string; limit: number }> = [
    {
      key: `${endpoint}:project:${projectId}`,
      logKey: `${endpoint}:project:${projectId}`,
      limit: limits.project,
    },
  ];
  if (visitorId && limits.visitor > 0) {
    const visitorHash = await hashForLog(visitorId, projectId);
    checks.push({
      key: `${endpoint}:visitor:${visitorId}`,
      logKey: `${endpoint}:visitor:${visitorHash}`,
      limit: limits.visitor,
    });
  }
  if (clientIp && limits.ip > 0) {
    const ipHash = await hashForLog(clientIp, projectId);
    checks.push({
      key: `${endpoint}:ip:${clientIp}`,
      logKey: `${endpoint}:ip:${ipHash}`,
      limit: limits.ip,
    });
  }

  for (const { key, logKey, limit } of checks) {
    try {
      const { data, error } = await supabase.rpc("increment_rate_limit", {
        p_key: key,
        p_window_start: windowStart,
      });

      if (error) {
        console.error(`rateLimit: db error for key=${logKey}`, error);
        continue; // fail-open on DB errors
      }

      const count: number = data ?? 0;

      if (count > limit) {
        console.warn(
          `rateLimit: limit exceeded key=${logKey} count=${count} limit=${limit}`,
        );
        return { limited: true, retryAfterSeconds };
      }
    } catch (err) {
      console.error(`rateLimit: unexpected error for key=${logKey}`, err);
      // fail-open
    }
  }

  return { limited: false };
}
