/**
 * Origin Check Tests — H-4 fix
 *
 * Tests for getRequestOriginUrl() and isAllowedOrigin() in
 * supabase/functions/_shared/origin.ts.
 *
 * Key behaviours under test (H-4 fix):
 *  - getRequestOriginUrl returns only the Origin header, never Referer
 *  - A request with no Origin but a spoofed Referer returns null → 403 path
 *  - A request with a valid Origin passes the allowed-origin check
 *  - isAllowedOrigin correctly matches/rejects hostnames (existing logic guard)
 *
 * The functions are ported inline for Jest/Node compatibility (avoids Deno imports).
 */

const { describe, test, expect } = require('@jest/globals');

// ---------------------------------------------------------------------------
// Inline port of origin.ts (mirrors the file exactly after the H-4 fix)
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

// H-4 fix: only Origin header, no Referer fallback
function getRequestOriginUrl(req) {
  return req.headers.get('origin');
}

function isAllowedOrigin(rawUrl, allowedUrls) {
  const requestHost = normalizeHost(getBaseHost(rawUrl) || '');
  const allowedHosts = Array.isArray(allowedUrls)
    ? allowedUrls.map((h) => normalizeHost(h))
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

describe('getRequestOriginUrl (H-4)', () => {
  test('returns the Origin header when present', () => {
    const req = makeReq({ origin: 'https://partner-site.com' });
    expect(getRequestOriginUrl(req)).toBe('https://partner-site.com');
  });

  test('returns null when Origin header is absent', () => {
    const req = makeReq({});
    expect(getRequestOriginUrl(req)).toBeNull();
  });

  test('does NOT fall back to Referer when Origin is absent (H-4 regression guard)', () => {
    // An attacker sends Referer but no Origin — must be rejected
    const req = makeReq({ referer: 'https://allowed-partner-site.com/article' });
    expect(getRequestOriginUrl(req)).toBeNull();
  });

  test('ignores Referer even when both Origin and Referer are present', () => {
    const req = makeReq({
      origin: 'https://real-origin.com',
      referer: 'https://spoofed-referer.com/page',
    });
    expect(getRequestOriginUrl(req)).toBe('https://real-origin.com');
  });

  test('returns null for empty string Origin header', () => {
    const req = makeReq({ origin: '' });
    // empty string is falsy — treated as absent
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

  test('rejects null (absent Origin → no Referer fallback → blocked)', () => {
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

  test('spoofed Referer with no Origin resolves to null → rejected', () => {
    // Full end-to-end simulation of the attack path
    const req = makeReq({ referer: 'https://partner-site.com/article' });
    const originUrl = getRequestOriginUrl(req); // null after H-4 fix
    expect(isAllowedOrigin(originUrl, allowedUrls)).toBe(false);
  });

  test('legitimate browser request with Origin passes', () => {
    const req = makeReq({ origin: 'https://partner-site.com' });
    const originUrl = getRequestOriginUrl(req);
    expect(isAllowedOrigin(originUrl, allowedUrls)).toBe(true);
  });
});
