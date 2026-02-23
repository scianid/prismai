/**
 * Visitor ownership tokens — fix for C-2 (Unauthenticated Conversation Access).
 *
 * Flow:
 *   1. The /chat endpoint issues a short-lived HMAC-SHA256 token that binds a
 *      visitor_id to a project_id, returning it as the X-Visitor-Token header.
 *   2. The widget stores this token (memory + localStorage for persistence).
 *   3. Every /conversations request must supply the token; the endpoint verifies
 *      the signature, checks expiry, and cross-checks that the token's visitor_id
 *      matches the conversation being accessed.
 *
 * Token format (pipe-separated, safe because UUIDs only contain hex + hyphens):
 *   {visitorId}|{projectId}|{expiresMs}|{hmac-sha256-hex}
 *
 * Environment variable: VISITOR_TOKEN_SECRET (required — set via `supabase secrets set`)
 */

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function getSecret(): string {
  // @ts-ignore — Deno.env is available in the Edge Runtime
  return Deno.env.get('VISITOR_TOKEN_SECRET') ?? '';
}

async function hmacHex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Constant-time comparison to prevent timing side-channels. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * Issue a signed token that proves ownership of `visitorId` within `projectId`.
 * Throws if VISITOR_TOKEN_SECRET is not set.
 */
export async function issueVisitorToken(visitorId: string, projectId: string): Promise<string> {
  const secret = getSecret();
  if (!secret) throw new Error('VISITOR_TOKEN_SECRET is not configured');
  const expires = Date.now() + TOKEN_TTL_MS;
  const message = `${visitorId}|${projectId}|${expires}`;
  const hex = await hmacHex(message, secret);
  return `${message}|${hex}`;
}

/**
 * Verify a visitor token.
 * Returns `{ visitorId, projectId }` on success, or `null` if the token is
 * missing, malformed, expired, or has an invalid signature.
 */
export async function verifyVisitorToken(
  token: string | null | undefined
): Promise<{ visitorId: string; projectId: string } | null> {
  if (!token) return null;
  const secret = getSecret();
  if (!secret) return null;

  // Parse: exactly 3 pipe chars expected
  const parts = token.split('|');
  if (parts.length !== 4) return null;
  const [visitorId, projectId, expiresStr, receivedHex] = parts;
  if (!visitorId || !projectId || !expiresStr || !receivedHex) return null;

  const expires = parseInt(expiresStr, 10);
  if (isNaN(expires) || Date.now() > expires) return null;

  const message = `${visitorId}|${projectId}|${expires}`;
  const expectedHex = await hmacHex(message, secret);
  if (!safeEqual(expectedHex, receivedHex)) return null;

  return { visitorId, projectId };
}
