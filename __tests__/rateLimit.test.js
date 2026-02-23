/**
 * Rate Limiting Tests — H-2 fix
 *
 * Tests for the checkRateLimit() helper in supabase/functions/_shared/rateLimit.ts.
 * The helper is ported/adapted here for Jest (Deno-free) testing by mocking the
 * Supabase client's rpc() method.
 *
 * Behaviour under test:
 *  - Returns { limited: false } when both project and visitor counts are under the limit
 *  - Returns { limited: true, retryAfterSeconds } when the project limit is exceeded
 *  - Returns { limited: true, retryAfterSeconds } when the visitor limit is exceeded
 *  - Skips the visitor key check when visitorId is null/undefined
 *  - Always checks the project key, even when visitor is present
 *  - Fails open (returns { limited: false }) on DB errors
 *  - Fails open on unexpected thrown errors
 *  - retryAfterSeconds is a positive integer (≤ 60)
 *  - Chat and suggestions use different per-visitor limits (20 vs 5)
 */

const { describe, test, expect, beforeEach } = require('@jest/globals');

// ---------------------------------------------------------------------------
// Inline port of checkRateLimit logic (mirrors rateLimit.ts exactly)
// This avoids Deno-specific imports while keeping the logic under test.
// ---------------------------------------------------------------------------
const LIMITS = {
  chat:        { visitor: 20,  project: 500 },
  suggestions: { visitor: 5,   project: 200 },
};

async function checkRateLimit(supabase, endpoint, visitorId, projectId) {
  const limits = LIMITS[endpoint];
  const windowStart = new Date(Math.floor(Date.now() / 60_000) * 60_000).toISOString();
  const retryAfterSeconds = Math.ceil(
    (Math.floor(Date.now() / 60_000) * 60_000 + 60_000 - Date.now()) / 1000
  );

  const checks = [
    { key: `${endpoint}:project:${projectId}`, limit: limits.project },
  ];
  if (visitorId) {
    checks.push({ key: `${endpoint}:visitor:${visitorId}`, limit: limits.visitor });
  }

  for (const { key, limit } of checks) {
    try {
      const { data, error } = await supabase.rpc('increment_rate_limit', {
        p_key: key,
        p_window_start: windowStart,
      });

      if (error) {
        console.error(`rateLimit: db error for key=${key}`, error);
        continue; // fail-open
      }

      const count = data ?? 0;
      if (count > limit) {
        return { limited: true, retryAfterSeconds };
      }
    } catch (err) {
      console.error(`rateLimit: unexpected error for key=${key}`, err);
      // fail-open
    }
  }

  return { limited: false };
}

// ---------------------------------------------------------------------------
// Helper: build a mock Supabase client whose rpc() resolves to a fixed count
// ---------------------------------------------------------------------------
function mockSupabase(countOrMap) {
  return {
    rpc: jest.fn().mockImplementation((_fn, { p_key }) => {
      const count =
        typeof countOrMap === 'object' && countOrMap !== null
          ? (countOrMap[p_key] ?? 0)
          : countOrMap;
      return Promise.resolve({ data: count, error: null });
    }),
  };
}

function mockSupabaseError() {
  return {
    rpc: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
  };
}

function mockSupabaseThrows() {
  return {
    rpc: jest.fn().mockRejectedValue(new Error('Network failure')),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('checkRateLimit (H-2)', () => {
  const projectId = 'proj-abc';
  const visitorId = 'visitor-xyz';

  // Suppress console output from internal logging during tests
  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  describe('happy path — under limit', () => {
    test('returns { limited: false } when both project and visitor counts are under limit', async () => {
      const supabase = mockSupabase(1); // count = 1, well under any limit
      const result = await checkRateLimit(supabase, 'chat', visitorId, projectId);
      expect(result).toEqual({ limited: false });
    });

    test('returns { limited: false } when count equals the limit (not strictly over)', async () => {
      // limit for suggestions visitor = 5; count = 5 → allowed (count > limit is false)
      const supabase = mockSupabase(5);
      const result = await checkRateLimit(supabase, 'suggestions', visitorId, projectId);
      expect(result).toEqual({ limited: false });
    });
  });

  // -------------------------------------------------------------------------
  describe('project-level limit exceeded', () => {
    test('returns limited=true when project count exceeds chat project limit (500)', async () => {
      const supabase = mockSupabase({
        [`chat:project:${projectId}`]: 501,
        [`chat:visitor:${visitorId}`]: 1,
      });
      const result = await checkRateLimit(supabase, 'chat', visitorId, projectId);
      expect(result.limited).toBe(true);
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
    });

    test('returns limited=true when project count exceeds suggestions project limit (200)', async () => {
      const supabase = mockSupabase({
        [`suggestions:project:${projectId}`]: 201,
        [`suggestions:visitor:${visitorId}`]: 1,
      });
      const result = await checkRateLimit(supabase, 'suggestions', visitorId, projectId);
      expect(result.limited).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe('visitor-level limit exceeded', () => {
    test('returns limited=true when visitor count exceeds chat visitor limit (20)', async () => {
      const supabase = mockSupabase({
        [`chat:project:${projectId}`]: 1,
        [`chat:visitor:${visitorId}`]: 21,
      });
      const result = await checkRateLimit(supabase, 'chat', visitorId, projectId);
      expect(result.limited).toBe(true);
    });

    test('returns limited=true when visitor count exceeds suggestions visitor limit (5)', async () => {
      const supabase = mockSupabase({
        [`suggestions:project:${projectId}`]: 1,
        [`suggestions:visitor:${visitorId}`]: 6,
      });
      const result = await checkRateLimit(supabase, 'suggestions', visitorId, projectId);
      expect(result.limited).toBe(true);
    });

    test('chat visitor limit (20) differs from suggestions visitor limit (5)', async () => {
      // count = 6: should be fine for chat, but limited for suggestions
      const makeSupabase = (endpoint) =>
        mockSupabase({
          [`${endpoint}:project:${projectId}`]: 1,
          [`${endpoint}:visitor:${visitorId}`]: 6,
        });

      const chatResult = await checkRateLimit(makeSupabase('chat'), 'chat', visitorId, projectId);
      expect(chatResult.limited).toBe(false);

      const suggestionsResult = await checkRateLimit(makeSupabase('suggestions'), 'suggestions', visitorId, projectId);
      expect(suggestionsResult.limited).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe('visitor key skipped when visitorId is absent', () => {
    test('does not call rpc for visitor key when visitorId is null', async () => {
      const supabase = mockSupabase(1);
      await checkRateLimit(supabase, 'chat', null, projectId);
      const calledKeys = supabase.rpc.mock.calls.map(([, args]) => args.p_key);
      expect(calledKeys).toHaveLength(1);
      expect(calledKeys[0]).toMatch(/^chat:project:/);
      expect(calledKeys.some((k) => k.includes(':visitor:'))).toBe(false);
    });

    test('does not call rpc for visitor key when visitorId is undefined', async () => {
      const supabase = mockSupabase(1);
      await checkRateLimit(supabase, 'suggestions', undefined, projectId);
      const calledKeys = supabase.rpc.mock.calls.map(([, args]) => args.p_key);
      expect(calledKeys).toHaveLength(1);
      expect(calledKeys[0]).toMatch(/^suggestions:project:/);
    });

    test('returns { limited: false } for anonymous request under project limit', async () => {
      const supabase = mockSupabase(1);
      const result = await checkRateLimit(supabase, 'chat', null, projectId);
      expect(result).toEqual({ limited: false });
    });

    test('returns limited=true for anonymous request over project limit', async () => {
      const supabase = mockSupabase(501);
      const result = await checkRateLimit(supabase, 'chat', null, projectId);
      expect(result.limited).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe('project key always checked', () => {
    test('always calls rpc for project key when visitor is present', async () => {
      const supabase = mockSupabase(1);
      await checkRateLimit(supabase, 'chat', visitorId, projectId);
      const calledKeys = supabase.rpc.mock.calls.map(([, args]) => args.p_key);
      expect(calledKeys.some((k) => k.includes(':project:'))).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  describe('fail-open on errors', () => {
    test('returns { limited: false } when rpc returns a DB error', async () => {
      const supabase = mockSupabaseError();
      const result = await checkRateLimit(supabase, 'chat', visitorId, projectId);
      expect(result).toEqual({ limited: false });
    });

    test('returns { limited: false } when rpc throws an unexpected error', async () => {
      const supabase = mockSupabaseThrows();
      const result = await checkRateLimit(supabase, 'chat', visitorId, projectId);
      expect(result).toEqual({ limited: false });
    });
  });

  // -------------------------------------------------------------------------
  describe('retryAfterSeconds', () => {
    test('retryAfterSeconds is a positive integer', async () => {
      const supabase = mockSupabase(501);
      const result = await checkRateLimit(supabase, 'chat', null, projectId);
      expect(result.limited).toBe(true);
      expect(Number.isInteger(result.retryAfterSeconds)).toBe(true);
      expect(result.retryAfterSeconds).toBeGreaterThan(0);
    });

    test('retryAfterSeconds is at most 60', async () => {
      const supabase = mockSupabase(501);
      const result = await checkRateLimit(supabase, 'chat', null, projectId);
      expect(result.retryAfterSeconds).toBeLessThanOrEqual(60);
    });
  });

  // -------------------------------------------------------------------------
  describe('RPC key format', () => {
    test('project key format is {endpoint}:project:{projectId}', async () => {
      const supabase = mockSupabase(1);
      await checkRateLimit(supabase, 'chat', null, projectId);
      const key = supabase.rpc.mock.calls[0][1].p_key;
      expect(key).toBe(`chat:project:${projectId}`);
    });

    test('visitor key format is {endpoint}:visitor:{visitorId}', async () => {
      const supabase = mockSupabase(1);
      await checkRateLimit(supabase, 'suggestions', visitorId, projectId);
      const keys = supabase.rpc.mock.calls.map(([, args]) => args.p_key);
      expect(keys).toContain(`suggestions:visitor:${visitorId}`);
    });

    test('p_window_start is a valid ISO timestamp aligned to a 1-minute boundary', async () => {
      const supabase = mockSupabase(1);
      await checkRateLimit(supabase, 'chat', null, projectId);
      const windowStart = supabase.rpc.mock.calls[0][1].p_window_start;
      const d = new Date(windowStart);
      expect(d.getSeconds()).toBe(0);
      expect(d.getMilliseconds()).toBe(0);
      expect(d.toISOString()).toBe(windowStart);
    });
  });
});
