/**
 * AI endpoint rate limiter — H-2 fix.
 *
 * Uses a 1-minute tumbling window backed by the `ai_rate_limits` Postgres table.
 * The `increment_rate_limit` DB function performs an atomic INSERT … ON CONFLICT
 * DO UPDATE, so there is no read-then-write race condition.
 *
 * Rate limits (configurable via the LIMITS object below):
 *   /chat    — 20 req/min per visitor_id,  500 req/min per project_id
 *   /suggestions — 5 req/min per visitor_id, 200 req/min per project_id
 */

type SupabaseClient = any;

export type RateLimitResult =
  | { limited: false }
  | { limited: true; retryAfterSeconds: number };

/** Limits by endpoint and key type. Adjust as needed. */
const LIMITS: Record<string, Record<'visitor' | 'project', number>> = {
  chat:        { visitor: 20,  project: 500 },
  suggestions: { visitor: 5,   project: 200 },
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
  endpoint: 'chat' | 'suggestions',
  visitorId: string | null | undefined,
  projectId: string
): Promise<RateLimitResult> {
  const limits = LIMITS[endpoint];
  const windowStart = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
  const retryAfterSeconds = Math.ceil((Math.floor(Date.now() / 60_000) * 60_000 + 60_000 - Date.now()) / 1000);

  // Keys to check: always check project; check visitor only if known
  const checks: Array<{ key: string; limit: number }> = [
    { key: `${endpoint}:project:${projectId}`, limit: limits.project },
  ];
  if (visitorId) {
    checks.push({ key: `${endpoint}:visitor:${visitorId}`, limit: limits.visitor });
  }

  for (const { key, limit } of checks) {
    try {
      const { data, error } = await supabase.rpc('increment_rate_limit', {
        p_key: key,
        p_window_start: windowStart,
      });

      if (error) {
        console.error(`rateLimit: db error for key=${key}`, error);
        continue; // fail-open on DB errors
      }

      const count: number = data ?? 0;

      if (count > limit) {
        console.warn(`rateLimit: limit exceeded key=${key} count=${count} limit=${limit}`);
        return { limited: true, retryAfterSeconds };
      }
    } catch (err) {
      console.error(`rateLimit: unexpected error for key=${key}`, err);
      // fail-open
    }
  }

  return { limited: false };
}
