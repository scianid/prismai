/**
 * Log-safe identifier hashing for PII anonymization in logs.
 *
 * SECURITY_AUDIT_TODO.md item 4 / SOC2 CC7.2: visitor_id is a persistent
 * identifier that can be linked to an end user via the widget cookie, so
 * keeping it in plaintext inside log retention (30+ days on most cloud
 * providers) is a PII liability. This helper produces a stable, short,
 * non-reversible tag that still lets an incident responder correlate log
 * lines for the same visitor — they just need the original visitor_id +
 * projectId to recompute the tag.
 *
 * Design choices:
 *   - SHA-256 via Web Crypto. Strong and built-in; no dependency.
 *   - Salted with the (public) projectId so the same visitor in two
 *     different projects produces different tags. This means a compromised
 *     log file alone can't let an attacker find "all logs for visitor X
 *     across every project."
 *   - Truncated to 12 hex chars (48 bits). Enough collision resistance for
 *     correlation within a project's log stream and short enough to be
 *     readable inline. Not a crypto-grade primitive — it is NOT an
 *     authenticator.
 *
 * Usage:
 *   console.log("chat: msg", { visitorHash: await hashForLog(visitorId, projectId) });
 *
 * The helper is async because Web Crypto's `subtle.digest` is async.
 * The call sites we rewrote for this fix were already in async context.
 */
export async function hashForLog(
  visitorId: string | null | undefined,
  projectId: string,
): Promise<string> {
  if (!visitorId) return "anon";
  const input = `${projectId}:${visitorId}`;
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 12);
}
