/**
 * CORS Configuration Tests — H-3 fix
 *
 * Guards the CORS headers object against regressions that would re-introduce
 * the vulnerabilities identified in H-3:
 *  - 'authorization' must NOT be in Access-Control-Allow-Headers (widget never
 *    sends bearer tokens; AI provider calls are server-side only)
 *  - 'PUT' must NOT be in Access-Control-Allow-Methods (no endpoint uses it)
 *  - 'x-visitor-token' must NOT be in Access-Control-Allow-Headers (the
 *    /conversations endpoint and its visitor-token scheme were removed)
 *  - 'content-type' MUST remain (all POST bodies are application/json)
 *  - 'x-visitor-token' must NOT be in Expose-Headers (same reason as above)
 *  - 'X-Conversation-Id' MUST be in Expose-Headers (widget reads it from /chat)
 *
 * The CORS object is read directly from the source file so that any accidental
 * edit to cors.ts is caught immediately, without needing to deploy.
 */

const { describe, test, expect } = require('@jest/globals');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Read and parse cors.ts as a plain-text source file.
// We extract the header strings via regex rather than eval/import to stay
// in the Jest/Node environment and avoid Deno-specific syntax.
// ---------------------------------------------------------------------------
const corsPath = path.resolve(
  __dirname,
  '../supabase/functions/_shared/cors.ts'
);
const corsSource = fs.readFileSync(corsPath, 'utf8');

/**
 * Extract the value of a string property from the corsHeaders object literal.
 * Returns the raw string value (lowercased for case-insensitive matching).
 */
function extractHeaderValue(propertyName) {
  const re = new RegExp(`["']${propertyName}["']\\s*:\\s*\\n?\\s*["']([^"']+)["']`);
  const match = corsSource.match(re);
  if (!match) throw new Error(`Property '${propertyName}' not found in cors.ts`);
  return match[1].toLowerCase();
}

const allowHeaders  = extractHeaderValue('Access-Control-Allow-Headers');
const allowMethods  = extractHeaderValue('Access-Control-Allow-Methods');
const exposeHeaders = extractHeaderValue('Access-Control-Expose-Headers');

const headerList  = allowHeaders.split(',').map((h) => h.trim());
const methodList  = allowMethods.split(',').map((m) => m.trim());
const exposeList  = exposeHeaders.split(',').map((h) => h.trim());

// ---------------------------------------------------------------------------

describe('CORS configuration (H-3)', () => {

  describe('Access-Control-Allow-Headers', () => {
    test('does NOT include "authorization" (widget never sends bearer tokens)', () => {
      expect(headerList).not.toContain('authorization');
    });

    test('does NOT include "x-visitor-token" (/conversations endpoint was removed)', () => {
      expect(headerList).not.toContain('x-visitor-token');
    });

    test('includes "content-type" (all cross-origin POST bodies are JSON)', () => {
      expect(headerList).toContain('content-type');
    });
  });

  describe('Access-Control-Allow-Methods', () => {
    test('does NOT include "PUT" (no endpoint uses PUT cross-origin)', () => {
      expect(methodList).not.toContain('put');
    });

    test('includes "POST" (primary method for all AI endpoints)', () => {
      expect(methodList).toContain('post');
    });

    test('includes "GET" (cached config / suggestions endpoints)', () => {
      expect(methodList).toContain('get');
    });

    test('includes "OPTIONS" (CORS preflight)', () => {
      expect(methodList).toContain('options');
    });
  });

  describe('Access-Control-Expose-Headers', () => {
    test('does NOT expose "x-visitor-token" (/conversations endpoint was removed)', () => {
      expect(exposeList).not.toContain('x-visitor-token');
    });

    test('exposes "x-conversation-id" so widget can track conversation state', () => {
      expect(exposeList).toContain('x-conversation-id');
    });
  });
});
