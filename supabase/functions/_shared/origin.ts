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

// H-4 fix: only trust the browser-injected Origin header.
// Referer is client-controlled and forgeable - never use it for security decisions.
// Any cross-origin request from a real browser always includes Origin;
// server-side/script requests without Origin are correctly rejected by isAllowedOrigin.
export function getRequestOriginUrl(req: Request): string | null {
  return req.headers.get("origin");
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
