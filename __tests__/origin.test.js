/**
 * Origin Check Tests
 *
 * Tests for getRequestOriginUrl() and isAllowedOrigin() in
 * supabase/functions/_shared/origin.ts.
 *
 * Key behaviours under test:
 *  - getRequestOriginUrl prefers Origin, falls back to Referer
 *  - A request with no Origin and no Referer returns null → 403 path
 *  - A request with a valid Origin passes the allowed-origin check
 *  - isAllowedOrigin correctly matches/rejects hostnames
 *
 * The functions are ported inline for Jest/Node compatibility (avoids Deno imports).
 */

const { describe, test, expect } = require('@jest/globals');

// ---------------------------------------------------------------------------
// Inline port of origin.ts
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
// Tests
// ---------------------------------------------------------------------------

describe('getRequestOriginUrl', () => {
  test('returns the Origin header when present', () => {
    const req = makeReq({ origin: 'https://partner-site.com' });
    expect(getRequestOriginUrl(req)).toBe('https://partner-site.com');
  });

  test('falls back to Referer when Origin is absent', () => {
    const req = makeReq({ referer: 'https://partner-site.com/article' });
    expect(getRequestOriginUrl(req)).toBe('https://partner-site.com/article');
  });

  test('prefers Origin over Referer when both are present', () => {
    const req = makeReq({
      origin: 'https://real-origin.com',
      referer: 'https://other-site.com/page',
    });
    expect(getRequestOriginUrl(req)).toBe('https://real-origin.com');
  });

  test('returns null when neither Origin nor Referer is present', () => {
    const req = makeReq({});
    expect(getRequestOriginUrl(req)).toBeNull();
  });

  test('returns null for empty string Origin and no Referer', () => {
    const req = makeReq({ origin: '' });
    expect(getRequestOriginUrl(req) || null).toBeNull();
  });
});

describe('isAllowedOrigin', () => {
  const allowedUrls = ['partner-site.com', 'another-partner.io'];

  test('allows a matching origin', () => {
    expect(isAllowedOrigin('https://partner-site.com', allowedUrls)).toBe(true);
  });

  test('allows www subdomain (normalised to bare host)', () => {
    expect(isAllowedOrigin('https://www.partner-site.com', allowedUrls)).toBe(true);
  });

  test('rejects an unknown origin', () => {
    expect(isAllowedOrigin('https://evil.com', allowedUrls)).toBe(false);
  });

  test('rejects null (no Origin or Referer → blocked)', () => {
    expect(isAllowedOrigin(null, allowedUrls)).toBe(false);
  });

  test('rejects undefined origin', () => {
    expect(isAllowedOrigin(undefined, allowedUrls)).toBe(false);
  });

  test('rejects when allowedUrls is empty', () => {
    expect(isAllowedOrigin('https://partner-site.com', [])).toBe(false);
  });

  test('rejects when allowedUrls is null', () => {
    expect(isAllowedOrigin('https://partner-site.com', null)).toBe(false);
  });

  test('Referer fallback with allowed host passes', () => {
    const req = makeReq({ referer: 'https://partner-site.com/article' });
    const originUrl = getRequestOriginUrl(req);
    expect(isAllowedOrigin(originUrl, allowedUrls)).toBe(true);
  });

  test('Referer fallback with disallowed host is rejected', () => {
    const req = makeReq({ referer: 'https://evil.com/page' });
    const originUrl = getRequestOriginUrl(req);
    expect(isAllowedOrigin(originUrl, allowedUrls)).toBe(false);
  });

  test('legitimate browser request with Origin passes', () => {
    const req = makeReq({ origin: 'https://partner-site.com' });
    const originUrl = getRequestOriginUrl(req);
    expect(isAllowedOrigin(originUrl, allowedUrls)).toBe(true);
  });

  test('handles full URL entries in allowedUrls', () => {
    const urlAllowed = ['https://partner-site.com/path', 'https://another-partner.io'];
    expect(isAllowedOrigin('https://partner-site.com', urlAllowed)).toBe(true);
  });
});
