export const MAX_TITLE_LENGTH = 1000;
export const MAX_CONTENT_LENGTH = 20000;

/**
 * Strip HTML/script content, normalize Unicode, and clean control characters
 * from user-supplied text before it is stored in the database or injected
 * into an AI prompt. Primary mitigation against stored prompt injection
 * (C-1) and SECURITY_AUDIT_TODO item 6 (Unicode / SVG gaps).
 *
 * Order matters. Each step is here for a specific class of bypass:
 *
 *   1. NFKC normalization — catches compatibility characters like fullwidth
 *      `＜script＞` that would otherwise slip past a regex that only
 *      matches ASCII `<`.
 *   2. Strip Unicode `Cf` (format) and `Cc` (control) categories. These
 *      include zero-width space (U+200B), zero-width joiner (U+200D),
 *      right-to-left override (U+202E), soft hyphen (U+00AD), variation
 *      selectors, etc. — all of which can be used to smuggle instructions
 *      past human review of stored prompts without visibly altering the
 *      text. `\t\n\r` are explicitly preserved (they're in Cc but are
 *      structurally legitimate).
 *   3. Strip whole block elements — `<script>`, `<style>`, `<svg>`,
 *      `<iframe>`, `<noscript>`, `<object>`, `<embed>`. The generic tag
 *      strip that runs later removes the wrapping tags but LEAVES the
 *      contents, which is bad for prompt injection (`<svg><desc>Ignore
 *      previous instructions</desc></svg>` would otherwise survive as
 *      "Ignore previous instructions"). Lazy match with a bounded length
 *      to avoid ReDoS.
 *   4. Strip HTML comments — primary historical injection vector.
 *   5. Strip remaining tags (bounded length for ReDoS).
 *   6. Decode common HTML entities so encoded injections can't hide.
 *   7. Explicit null-byte strip (redundant with Cc but kept for clarity).
 *   8. Trim.
 */
export function sanitizeContent(text: string): string {
  if (!text) return "";
  return text
    // 1. Unicode compat normalization
    .normalize("NFKC")
    // 2. Strip format + control chars except \t\n\r
    .replace(/[\p{Cf}]/gu, "")
    .replace(/[\p{Cc}]/gu, (ch) => (ch === "\t" || ch === "\n" || ch === "\r" ? ch : ""))
    // 3. Strip block-level hostile elements (content + tags)
    .replace(/<script\b[^>]{0,200}>[\s\S]{0,50000}?<\/script\s*>/gi, "")
    .replace(/<style\b[^>]{0,200}>[\s\S]{0,50000}?<\/style\s*>/gi, "")
    .replace(/<svg\b[^>]{0,200}>[\s\S]{0,50000}?<\/svg\s*>/gi, "")
    .replace(/<iframe\b[^>]{0,200}>[\s\S]{0,50000}?<\/iframe\s*>/gi, "")
    .replace(/<noscript\b[^>]{0,200}>[\s\S]{0,50000}?<\/noscript\s*>/gi, "")
    .replace(/<object\b[^>]{0,200}>[\s\S]{0,50000}?<\/object\s*>/gi, "")
    .replace(/<embed\b[^>]{0,200}(?:\/>|>[\s\S]{0,50000}?<\/embed\s*>)/gi, "")
    // 4. Strip HTML comments
    .replace(/<!--[\s\S]*?-->/g, "")
    // 5. Strip remaining tags (ReDoS-safe: bounded length)
    .replace(/<[^>]{0,2000}>/g, "")
    // 6. Decode common HTML entities so injections can't hide behind encoding
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"').replace(/&#x27;/gi, "'").replace(/&#\d+;/gi, "")
    // 7. Null byte strip (redundant with Cc but explicit)
    .replace(/\0/g, "")
    .trim();
}
