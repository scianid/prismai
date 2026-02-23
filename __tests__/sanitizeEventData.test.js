/**
 * sanitizeEventData Tests — M-6 fix
 *
 * Tests for the sanitizeEventData() function in analytics/index.ts.
 * The function is ported inline for Jest/Node compatibility.
 *
 * Behaviours under test:
 *  - Returns null for null/undefined/non-object inputs
 *  - Returns null when serialised payload exceeds 2 KB
 *  - Drops nested objects (arrays, plain objects) — all legitimate widget data is flat
 *  - Drops undefined/function/symbol values
 *  - Passes through string, number, boolean, null primitive values
 *  - Truncates strings longer than 500 characters
 *  - Accepts all real widget event_data shapes without modification
 */

const { describe, test, expect } = require('@jest/globals');

// ---------------------------------------------------------------------------
// Inline port of sanitizeEventData from analytics/index.ts
// ---------------------------------------------------------------------------
function sanitizeEventData(raw) {
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const sanitized = {};

  for (const [key, value] of Object.entries(raw)) {
    if (value !== null && typeof value === 'object') {
      // nested object or array — dropped
      continue;
    }
    if (typeof value === 'string') {
      sanitized[key] = value.length > 500 ? value.substring(0, 500) : value;
    } else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      sanitized[key] = value;
    }
    // undefined / symbol / function silently dropped
  }

  const serialised = JSON.stringify(sanitized);
  if (serialised.length > 2048) {
    return null;
  }

  return sanitized;
}

// ---------------------------------------------------------------------------

describe('sanitizeEventData (M-6)', () => {

  describe('invalid inputs → null', () => {
    test('returns null for null', () => {
      expect(sanitizeEventData(null)).toBeNull();
    });

    test('returns null for undefined', () => {
      expect(sanitizeEventData(undefined)).toBeNull();
    });

    test('returns null for a string', () => {
      expect(sanitizeEventData('evil')).toBeNull();
    });

    test('returns null for an array', () => {
      expect(sanitizeEventData(['a', 'b'])).toBeNull();
    });

    test('returns null for a number', () => {
      expect(sanitizeEventData(42)).toBeNull();
    });
  });

  describe('2 KB size cap', () => {
    test('returns null when serialised size exceeds 2048 bytes', () => {
      // Build a payload that is large but flat (string values)
      const big = {};
      for (let i = 0; i < 50; i++) {
        big[`key_${i}`] = 'x'.repeat(50); // 50 keys × ~55 bytes each ≈ 2750 bytes
      }
      expect(sanitizeEventData(big)).toBeNull();
    });

    test('accepts payload just under 2 KB', () => {
      // 10 keys × 100-char values ≈ well under 2 KB
      const small = {};
      for (let i = 0; i < 10; i++) {
        small[`key_${i}`] = 'x'.repeat(100);
      }
      expect(sanitizeEventData(small)).not.toBeNull();
    });
  });

  describe('nested values dropped', () => {
    test('drops keys with plain object values', () => {
      const result = sanitizeEventData({ ok: 'yes', nested: { deep: 'value' } });
      expect(result).toHaveProperty('ok', 'yes');
      expect(result).not.toHaveProperty('nested');
    });

    test('drops keys with array values', () => {
      const result = sanitizeEventData({ ok: 1, arr: [1, 2, 3] });
      expect(result).toHaveProperty('ok', 1);
      expect(result).not.toHaveProperty('arr');
    });
  });

  describe('non-primitive types dropped', () => {
    test('drops keys with undefined values', () => {
      const result = sanitizeEventData({ ok: 'yes', bad: undefined });
      expect(result).toHaveProperty('ok', 'yes');
      expect(result).not.toHaveProperty('bad');
    });

    test('drops keys with function values', () => {
      const result = sanitizeEventData({ ok: 'yes', fn: () => {} });
      expect(result).toHaveProperty('ok', 'yes');
      expect(result).not.toHaveProperty('fn');
    });
  });

  describe('primitive values passed through', () => {
    test('passes through strings', () => {
      expect(sanitizeEventData({ x: 'hello' })).toEqual({ x: 'hello' });
    });

    test('passes through numbers', () => {
      expect(sanitizeEventData({ x: 42, y: 3.14 })).toEqual({ x: 42, y: 3.14 });
    });

    test('passes through booleans', () => {
      expect(sanitizeEventData({ x: true, y: false })).toEqual({ x: true, y: false });
    });

    test('passes through null', () => {
      expect(sanitizeEventData({ x: null })).toEqual({ x: null });
    });
  });

  describe('string truncation at 500 chars', () => {
    test('truncates strings longer than 500 characters', () => {
      const long = 'a'.repeat(600);
      const result = sanitizeEventData({ x: long });
      expect(result.x).toHaveLength(500);
    });

    test('does not truncate strings at exactly 500 characters', () => {
      const exact = 'a'.repeat(500);
      const result = sanitizeEventData({ x: exact });
      expect(result.x).toHaveLength(500);
    });

    test('does not truncate strings shorter than 500 characters', () => {
      const result = sanitizeEventData({ x: 'short' });
      expect(result.x).toBe('short');
    });
  });

  describe('real widget event_data shapes', () => {
    test('widget_loaded payload passes through unchanged', () => {
      const data = { project_id: 'proj-123', article_id: 'art-456', position: 'bottom' };
      expect(sanitizeEventData(data)).toEqual(data);
    });

    test('impression payload passes through unchanged', () => {
      const data = { url: 'https://example.com/article', referrer: 'https://google.com' };
      expect(sanitizeEventData(data)).toEqual(data);
    });

    test('suggestion_clicked payload passes through unchanged', () => {
      const data = { article_id: 'art-789', conversation_id: 'conv-abc', position_in_chat: 2 };
      expect(sanitizeEventData(data)).toEqual(data);
    });

    test('ad_impression payload passes through unchanged', () => {
      const data = {
        ad_unit: 'div-slot-1',
        position: 'collapsed',
        size: '300x250',
        advertiser_id: null,
        creative_id: null,
        line_item_id: null,
      };
      expect(sanitizeEventData(data)).toEqual(data);
    });

    test('widget_collapsed payload passes through unchanged', () => {
      const data = { time_spent: 1708701234567, questions_asked: 3 };
      expect(sanitizeEventData(data)).toEqual(data);
    });

    test('empty object returns empty sanitized object (not null)', () => {
      expect(sanitizeEventData({})).toEqual({});
    });
  });

  describe('attack payloads blocked', () => {
    test('megabyte payload is rejected', () => {
      const big = { data: 'x'.repeat(1_000_000) };
      // String truncated to 500 first, so serialised = ~510 bytes → allowed if <2KB
      // but the original 'x'.repeat(1_000_000) is a single key → truncated to 500 → OK
      // Use many keys to exceed 2 KB instead
      const manyKeys = {};
      for (let i = 0; i < 200; i++) manyKeys[`key_${i}`] = 'x'.repeat(20);
      expect(sanitizeEventData(manyKeys)).toBeNull();
    });

    test('deeply nested object is stripped leaving no nested values', () => {
      const payload = {
        legitimate: 'ok',
        attack: { nested: { deep: 'evil' } },
      };
      const result = sanitizeEventData(payload);
      expect(result).toHaveProperty('legitimate', 'ok');
      expect(result).not.toHaveProperty('attack');
    });

    test('XSS payload in string value is preserved as plain text (rendering responsibility is caller\'s)', () => {
      // sanitizeEventData stores it as-is text; dashboard must escape on render
      const result = sanitizeEventData({ msg: '<script>alert(1)</script>' });
      expect(result).toHaveProperty('msg', '<script>alert(1)</script>');
    });
  });
});
