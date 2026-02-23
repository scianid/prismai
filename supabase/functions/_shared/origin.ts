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

// H-4 fix: only trust the browser-injected Origin header.
// Referer is client-controlled and forgeable — never use it for security decisions.
// Any cross-origin request from a real browser always includes Origin;
// server-side/script requests without Origin are correctly rejected by isAllowedOrigin.
export function getRequestOriginUrl(req: Request): string | null {
    return req.headers.get('origin');
}

export function isAllowedOrigin(rawUrl: string | null | undefined, allowedUrls: string[] | null | undefined): boolean {
    const requestHost = normalizeHost(getBaseHost(rawUrl) || '');
    const allowedHosts = Array.isArray(allowedUrls)
        ? allowedUrls.map((h) => normalizeHost(h))
        : [];

    console.log({ allowedHosts }, { requestHost }, { rawUrl });

    return !!requestHost && allowedHosts.length > 0 && allowedHosts.includes(requestHost);
}
