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
  return host.replace(/^www\./i, '').toLowerCase();
}

export function isAllowedOrigin(rawUrl: string | null | undefined, allowedUrls: string[] | null | undefined): boolean {
  const requestHost = normalizeHost(getBaseHost(rawUrl) || '');
  const allowedHosts = Array.isArray(allowedUrls)
    ? allowedUrls.map((h) => normalizeHost(h))
    : [];
  return !!requestHost && allowedHosts.length > 0 && allowedHosts.includes(requestHost);
}
