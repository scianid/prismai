/**
 * Origin Check Tests
 *
 * Tests for getRequestOriginUrl(), isAllowedOrigin(), and extractHostFromEntry()
 * in supabase/functions/_shared/origin.ts.
 *
 * Key behaviours under test:
 *  - getRequestOriginUrl prefers Origin, falls back to Referer
 *  - CDN/infra requests (no Origin, no Referer) return null
 *  - isAllowedOrigin allows CDN requests (null rawUrl) through
 *  - isAllowedOrigin correctly matches/rejects hostnames
 *  - extractHostFromEntry handles bare hosts, full URLs, www prefixes
 *  - End-to-end: real-world publisher scenarios (mignews, ba-bamail, etc.)
 *
 * The functions are ported inline for Jest/Node compatibility (avoids Deno imports).
 */

const { describe, test, expect } = require('@jest/globals');

// ---------------------------------------------------------------------------
// Inline port of origin.ts (must mirror the source exactly)
// ---------------------------------------------------------------------------
function getBaseHost(rawUrl) {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
}

function normalizeHost(host) {
  return host.replace(/^www\./i, '').toLowerCase();
}

function getRequestOriginUrl(req) {
  return req.headers.get('origin') || req.headers.get('referer') || null;
}

function extractHostFromEntry(entry) {
  try {
    return new URL(entry).hostname.toLowerCase();
  } catch { /* not a full URL — retry with a synthetic scheme */ }
  try {
    return new URL(`https://${entry}`).hostname.toLowerCase();
  } catch {
    return entry.toLowerCase();
  }
}

function isAllowedOrigin(rawUrl, allowedUrls) {
  // CDN/infra requests — no Origin or Referer
  if (!rawUrl) return true;

  const requestHost = normalizeHost(getBaseHost(rawUrl) || '');
  const allowedHosts = Array.isArray(allowedUrls)
    ? allowedUrls.map((entry) => normalizeHost(extractHostFromEntry(entry)))
    : [];

  return !!requestHost && allowedHosts.length > 0 && allowedHosts.includes(requestHost);
}

// ---------------------------------------------------------------------------
// Tiny mock-request builder
// ---------------------------------------------------------------------------
function makeReq(headers = {}) {
  const h = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return { headers: { get: (name) => h.get(name.toLowerCase()) ?? null } };
}

// ---------------------------------------------------------------------------
// getRequestOriginUrl
// ---------------------------------------------------------------------------
describe('getRequestOriginUrl', () => {
  test('returns Origin header when present', () => {
    const req = makeReq({ origin: 'https://partner-site.com' });
    expect(getRequestOriginUrl(req)).toBe('https://partner-site.com');
  });

  test('falls back to Referer when Origin is absent', () => {
    const req = makeReq({ referer: 'https://partner-site.com/article?id=123' });
    expect(getRequestOriginUrl(req)).toBe('https://partner-site.com/article?id=123');
  });

  test('prefers Origin over Referer when both are present', () => {
    const req = makeReq({
      origin: 'https://real-origin.com',
      referer: 'https://other-site.com/page',
    });
    expect(getRequestOriginUrl(req)).toBe('https://real-origin.com');
  });

  test('returns null when neither Origin nor Referer is present (CDN request)', () => {
    const req = makeReq({});
    expect(getRequestOriginUrl(req)).toBeNull();
  });

  test('returns null when Origin is empty and no Referer', () => {
    const req = makeReq({ origin: '' });
    expect(getRequestOriginUrl(req) || null).toBeNull();
  });

  test('falls back to Referer when Origin is empty string', () => {
    const req = makeReq({ origin: '', referer: 'https://site.com/page' });
    // empty string is falsy, so falls through to referer
    expect(getRequestOriginUrl(req)).toBe('https://site.com/page');
  });

  test('handles CDN/infra request with only user-agent (no Origin, no Referer)', () => {
    const req = makeReq({ 'user-agent': 'Deno/2.1.4 (variant; SupabaseEdgeRuntime/1.73.3)' });
    expect(getRequestOriginUrl(req)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// extractHostFromEntry
// ---------------------------------------------------------------------------
describe('extractHostFromEntry', () => {
  test('extracts hostname from bare domain', () => {
    expect(extractHostFromEntry('mignews.com')).toBe('mignews.com');
  });

  test('extracts hostname from www bare domain', () => {
    expect(extractHostFromEntry('www.mignews.com')).toBe('www.mignews.com');
  });

  test('extracts hostname from full https URL', () => {
    expect(extractHostFromEntry('https://mignews.com')).toBe('mignews.com');
  });

  test('extracts hostname from full https URL with path', () => {
    expect(extractHostFromEntry('https://mignews.com/news/article')).toBe('mignews.com');
  });

  test('extracts hostname from full http URL', () => {
    expect(extractHostFromEntry('http://mignews.com')).toBe('mignews.com');
  });

  test('extracts hostname from URL with www', () => {
    expect(extractHostFromEntry('https://www.mignews.com')).toBe('www.mignews.com');
  });

  test('extracts hostname from URL with port', () => {
    expect(extractHostFromEntry('https://mignews.com:8080')).toBe('mignews.com');
  });

  test('handles URL with query params', () => {
    expect(extractHostFromEntry('https://mignews.com?foo=bar')).toBe('mignews.com');
  });

  test('lowercases hostname', () => {
    expect(extractHostFromEntry('MigNews.COM')).toBe('mignews.com');
  });

  test('lowercases hostname from full URL', () => {
    expect(extractHostFromEntry('https://MigNews.COM/Path')).toBe('mignews.com');
  });
});

// ---------------------------------------------------------------------------
// isAllowedOrigin
// ---------------------------------------------------------------------------
describe('isAllowedOrigin', () => {
  const allowedUrls = ['partner-site.com', 'another-partner.io'];

  // --- CDN / infra requests (null rawUrl) ---
  test('allows null rawUrl (CDN cache-warming request)', () => {
    expect(isAllowedOrigin(null, allowedUrls)).toBe(true);
  });

  test('allows undefined rawUrl (CDN cache-warming request)', () => {
    expect(isAllowedOrigin(undefined, allowedUrls)).toBe(true);
  });

  test('allows empty string rawUrl (treated as falsy)', () => {
    expect(isAllowedOrigin('', allowedUrls)).toBe(true);
  });

  // --- Matching origins ---
  test('allows a matching origin', () => {
    expect(isAllowedOrigin('https://partner-site.com', allowedUrls)).toBe(true);
  });

  test('allows www subdomain (normalised to bare host)', () => {
    expect(isAllowedOrigin('https://www.partner-site.com', allowedUrls)).toBe(true);
  });

  test('allows matching with http scheme', () => {
    expect(isAllowedOrigin('http://partner-site.com', allowedUrls)).toBe(true);
  });

  test('matching is case-insensitive', () => {
    expect(isAllowedOrigin('https://Partner-Site.COM', allowedUrls)).toBe(true);
  });

  // --- Rejections ---
  test('rejects an unknown origin', () => {
    expect(isAllowedOrigin('https://evil.com', allowedUrls)).toBe(false);
  });

  test('rejects a subdomain that is not www', () => {
    expect(isAllowedOrigin('https://app.partner-site.com', allowedUrls)).toBe(false);
  });

  test('rejects when allowedUrls is empty', () => {
    expect(isAllowedOrigin('https://partner-site.com', [])).toBe(false);
  });

  test('rejects when allowedUrls is null', () => {
    expect(isAllowedOrigin('https://partner-site.com', null)).toBe(false);
  });

  test('rejects when allowedUrls is undefined', () => {
    expect(isAllowedOrigin('https://partner-site.com', undefined)).toBe(false);
  });

  test('rejects an invalid URL as origin', () => {
    expect(isAllowedOrigin('not-a-url', allowedUrls)).toBe(false);
  });

  // --- allowedUrls entry formats ---
  test('handles full https URL entries in allowedUrls', () => {
    const urls = ['https://partner-site.com/path', 'https://another-partner.io'];
    expect(isAllowedOrigin('https://partner-site.com', urls)).toBe(true);
  });

  test('handles full http URL entries in allowedUrls', () => {
    const urls = ['http://partner-site.com'];
    expect(isAllowedOrigin('https://partner-site.com', urls)).toBe(true);
  });

  test('handles www in allowedUrls entries (normalised away)', () => {
    const urls = ['www.partner-site.com'];
    expect(isAllowedOrigin('https://partner-site.com', urls)).toBe(true);
  });

  test('handles www in both origin and allowedUrls', () => {
    const urls = ['www.partner-site.com'];
    expect(isAllowedOrigin('https://www.partner-site.com', urls)).toBe(true);
  });

  test('handles mixed entry formats in allowedUrls', () => {
    const urls = ['bare-host.com', 'https://full-url.io/path', 'www.with-www.org'];
    expect(isAllowedOrigin('https://bare-host.com', urls)).toBe(true);
    expect(isAllowedOrigin('https://full-url.io', urls)).toBe(true);
    expect(isAllowedOrigin('https://with-www.org', urls)).toBe(true);
    expect(isAllowedOrigin('https://not-in-list.com', urls)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// End-to-end: real-world publisher scenarios
// ---------------------------------------------------------------------------
describe('end-to-end: real-world scenarios', () => {
  test('mignews — browser request with Origin', () => {
    const allowed = ['mignews.com', 'mignews.co.il', 'mignews.org', 'mignews.net'];
    const req = makeReq({ origin: 'https://www.mignews.com' });
    const url = getRequestOriginUrl(req);
    expect(isAllowedOrigin(url, allowed)).toBe(true);
  });

  test('mignews — browser request with Referer only (CDN stripped Origin)', () => {
    const allowed = ['mignews.com', 'mignews.co.il', 'mignews.org', 'mignews.net'];
    const req = makeReq({ referer: 'https://www.mignews.com/news/politics/article-123' });
    const url = getRequestOriginUrl(req);
    expect(isAllowedOrigin(url, allowed)).toBe(true);
  });

  test('mignews — CDN cache-warming (no Origin, no Referer)', () => {
    const allowed = ['mignews.com', 'mignews.co.il', 'mignews.org', 'mignews.net'];
    const req = makeReq({ 'user-agent': 'Deno/2.1.4 (variant; SupabaseEdgeRuntime/1.73.3)' });
    const url = getRequestOriginUrl(req);
    expect(url).toBeNull();
    expect(isAllowedOrigin(url, allowed)).toBe(true);
  });

  test('mignews — unauthorized site tries to use mignews projectId', () => {
    const allowed = ['mignews.com', 'mignews.co.il', 'mignews.org', 'mignews.net'];
    const req = makeReq({ origin: 'https://evil-site.com' });
    const url = getRequestOriginUrl(req);
    expect(isAllowedOrigin(url, allowed)).toBe(false);
  });

  test('ba-bamail — browser request with Origin', () => {
    const allowed = ['ba-bamail.com'];
    const req = makeReq({ origin: 'https://www.ba-bamail.com' });
    const url = getRequestOriginUrl(req);
    expect(isAllowedOrigin(url, allowed)).toBe(true);
  });

  test('adevarul — browser request with Referer', () => {
    const allowed = ['adevarul.ro'];
    const req = makeReq({ referer: 'https://adevarul.ro/articol/some-article' });
    const url = getRequestOriginUrl(req);
    expect(isAllowedOrigin(url, allowed)).toBe(true);
  });

  test('adevarul — unauthorized site', () => {
    const allowed = ['adevarul.ro'];
    const req = makeReq({ origin: 'https://fake-adevarul.com' });
    const url = getRequestOriginUrl(req);
    expect(isAllowedOrigin(url, allowed)).toBe(false);
  });

  test('publisher with full URL entries in allowed_urls', () => {
    const allowed = ['https://www.mignews.com', 'https://mignews.co.il/news'];
    const req = makeReq({ origin: 'https://mignews.com' });
    const url = getRequestOriginUrl(req);
    expect(isAllowedOrigin(url, allowed)).toBe(true);
  });

  test('publisher with duplicate allowed_urls entries', () => {
    const allowed = ['ba-bamail.com', 'ba-bamail.com'];
    const req = makeReq({ origin: 'https://ba-bamail.com' });
    const url = getRequestOriginUrl(req);
    expect(isAllowedOrigin(url, allowed)).toBe(true);
  });
});
