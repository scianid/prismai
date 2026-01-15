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

export function getRequestOriginUrl(req: Request): string | null {
    const origin = req.headers.get('origin');
    if (origin) return origin;
    const referer = req.headers.get('referer');
    if (referer) return referer;
    return null;
}

export function isAllowedOrigin(rawUrl: string | null | undefined, allowedUrls: string[] | null | undefined): boolean {
    const requestHost = normalizeHost(getBaseHost(rawUrl) || '');
    const allowedHosts = Array.isArray(allowedUrls)
        ? allowedUrls.map((h) => normalizeHost(h))
        : [];

    console.log({ allowedHosts }, { requestHost }, { rawUrl });

    return !!requestHost && allowedHosts.length > 0 && allowedHosts.includes(requestHost);
}
