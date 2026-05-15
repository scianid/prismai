// AES-256-GCM encryption for the /allowed-urls payload.
//
// The /allowed-urls endpoint is public and CDN-cached so its response can be
// handed to anyone — that is what lets it absorb the secondary analytics
// service's high traffic. Encrypting the payload keeps the project's
// allowlist confidential to that service (which holds the shared key) even
// though the HTTP response itself is world-readable and shared across a CDN
// cache. The response is byte-identical for every caller, so caching stays
// trivial (no Vary, no per-caller cache key).
//
// Key: ALLOWLIST_ENC_KEY env var — base64 of 32 random bytes (AES-256).
//   Generate with:  openssl rand -base64 32
// Wire format of the returned string: base64( iv[12] || ciphertext+tag ).

let keyPromise: Promise<CryptoKey> | null = null;

function getKey(): Promise<CryptoKey> {
  if (keyPromise) return keyPromise;
  keyPromise = (async () => {
    // @ts-ignore: Deno global is unavailable to the editor TS server
    const raw = Deno.env.get("ALLOWLIST_ENC_KEY");
    if (!raw) throw new Error("ALLOWLIST_ENC_KEY is not configured");
    const keyBytes = base64ToBytes(raw);
    if (keyBytes.length !== 32) {
      throw new Error("ALLOWLIST_ENC_KEY must decode to 32 bytes (AES-256)");
    }
    return await crypto.subtle.importKey(
      "raw",
      keyBytes as BufferSource,
      { name: "AES-GCM" },
      false,
      ["encrypt", "decrypt"],
    );
  })();
  return keyPromise;
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

/** Encrypt an allowed-urls list. A fresh random IV is used per call, so two
 *  encryptions of the same list differ — fine for a cached endpoint: the CDN
 *  simply stores whichever ciphertext the cache-miss produced. */
export async function encryptAllowlist(allowedUrls: string[]): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(allowedUrls));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      plaintext as BufferSource,
    ),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return bytesToBase64(out);
}

/** Inverse of encryptAllowlist — for the consuming service (kept here so both
 *  sides can share one implementation). Throws on a tampered/invalid payload
 *  (AES-GCM authentication failure). */
export async function decryptAllowlist(payload: string): Promise<string[]> {
  const key = await getKey();
  const bytes = base64ToBytes(payload);
  const iv = bytes.slice(0, 12);
  const ct = bytes.slice(12);
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    ct as BufferSource,
  );
  const parsed = JSON.parse(new TextDecoder().decode(pt));
  return Array.isArray(parsed) ? parsed.filter((u): u is string => typeof u === "string") : [];
}
