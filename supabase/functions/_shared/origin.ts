export function getBaseHost(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function normalizeHost(host: string): string {
  return host.replace(/^www\./i, "").toLowerCase();
}

// Prefer the browser-injected Origin header, but fall back to Referer when
// Origin is absent. Some browsers omit Origin on simple GET requests, cached
// fetches, AMP contexts, or when privacy extensions strip it. For read-only
// endpoints (config, suggestions, articles) rejecting these visitors causes a
// production outage while providing no meaningful security benefit — Referer
// is sufficient for hostname-based allowlisting on GET endpoints. Mutating
// endpoints (chat, analytics) still only receive GET/POST with CORS, where
// Origin is reliably present.
export function getRequestOriginUrl(req: Request): string | null {
  return req.headers.get("origin") || req.headers.get("referer") || null;
}

// Extract a bare hostname from a project.allowed_urls entry. Tolerates both
// full URLs (`https://foo.com`, `https://foo.com/path`) and bare hostnames
// (`foo.com`, `www.foo.com`) because the widget admin UI stores whatever the
// user types; a single "https://" entry used to silently lock that domain
// out of the widget on every visitor request.
function extractHostFromEntry(entry: string): string {
  try {
    return new URL(entry).hostname.toLowerCase();
  } catch { /* not a full URL — retry with a synthetic scheme */ }
  try {
    return new URL(`https://${entry}`).hostname.toLowerCase();
  } catch {
    return entry.toLowerCase();
  }
}

export function isAllowedOrigin(
  rawUrl: string | null | undefined,
  allowedUrls: string[] | null | undefined,
): boolean {
  const requestHost = normalizeHost(getBaseHost(rawUrl) || "");
  const allowedHosts = Array.isArray(allowedUrls)
    ? allowedUrls.map((entry) => normalizeHost(extractHostFromEntry(entry)))
    : [];

  return !!requestHost && allowedHosts.length > 0 &&
    allowedHosts.includes(requestHost);
}
