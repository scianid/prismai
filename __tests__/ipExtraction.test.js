/**
 * IP Extraction Tests — H-1 fix
 *
 * Verifies that the analytics IP extraction trusts ONLY `cf-connecting-ip`,
 * which Cloudflare injects and clients cannot spoof. Supabase Edge Functions
 * always run on Cloudflare Workers, so this is the authoritative IP header
 * regardless of any upstream CDN in front of the origin site.
 *
 * All other headers (x-forwarded-for, x-real-ip, x-client-ip, true-client-ip,
 * fastly-client-ip) are client-controllable and must be ignored.
 *
 * The extraction logic is ported inline to run under Jest/Node
 * (avoids Deno imports) and must stay in sync with analytics/index.ts.
 */

const { describe, test, expect } = require('@jest/globals');

// ---------------------------------------------------------------------------
// Inline port of the H-1-fixed IP extraction (mirrors analytics/index.ts)
// ---------------------------------------------------------------------------
function extractClientIp(req) {
  // H-1 fix: trust only cf-connecting-ip, injected by Cloudflare (Supabase's
  // underlying infrastructure). Clients cannot set or spoof this header.
  return req.headers.get('cf-connecting-ip') ?? undefined;
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

describe('extractClientIp (H-1 — Cloudflare/Supabase)', () => {
  test('returns cf-connecting-ip when present', () => {
    const req = makeReq({ 'cf-connecting-ip': '178.175.141.219' });
    expect(extractClientIp(req)).toBe('178.175.141.219');
  });

  test('returns undefined when no headers are present', () => {
    const req = makeReq({});
    expect(extractClientIp(req)).toBeUndefined();
  });

  // Regression guards — none of these spoofable headers should be trusted
  test('ignores X-Forwarded-For (can be client-supplied before Cloudflare)', () => {
    const req = makeReq({ 'x-forwarded-for': '9.9.9.9' });
    expect(extractClientIp(req)).toBeUndefined();
  });

  test('ignores X-Real-IP (spoofable by client)', () => {
    const req = makeReq({ 'x-real-ip': '9.9.9.9' });
    expect(extractClientIp(req)).toBeUndefined();
  });

  test('ignores X-Client-IP (spoofable by client)', () => {
    const req = makeReq({ 'x-client-ip': '9.9.9.9' });
    expect(extractClientIp(req)).toBeUndefined();
  });

  test('ignores True-Client-IP (spoofable by client)', () => {
    const req = makeReq({ 'true-client-ip': '9.9.9.9' });
    expect(extractClientIp(req)).toBeUndefined();
  });

  test('ignores Fastly-Client-IP (not the infrastructure in use)', () => {
    const req = makeReq({ 'fastly-client-ip': '9.9.9.9' });
    expect(extractClientIp(req)).toBeUndefined();
  });

  test('uses cf-connecting-ip even when attacker also sets X-Forwarded-For', () => {
    const req = makeReq({
      'cf-connecting-ip': '178.175.141.219',
      'x-forwarded-for': '9.9.9.9, 8.8.8.8',
    });
    expect(extractClientIp(req)).toBe('178.175.141.219');
  });

  test('attacker sends only spoofable headers — IP is undefined (spoofing blocked)', () => {
    const req = makeReq({
      'x-forwarded-for': '1.1.1.1',
      'x-real-ip': '2.2.2.2',
      'true-client-ip': '3.3.3.3',
    });
    expect(extractClientIp(req)).toBeUndefined();
  });
});
