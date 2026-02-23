export const MAX_TITLE_LENGTH = 1000;
export const MAX_CONTENT_LENGTH = 20000;

/**
 * Strip HTML tags, HTML entities, and null bytes from user-supplied text before
 * it is stored in the database or injected into an AI prompt.
 * This is the primary mitigation against stored prompt injection (C-1).
 */
export function sanitizeContent(text: string): string {
  if (!text) return '';
  return text
    // Remove HTML/XML tags (including comments, which are the primary injection vector)
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]{0,2000}>/g, '')
    // Decode common HTML entities so injections can't hide behind encoding
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"').replace(/&#x27;/gi, "'").replace(/&#\d+;/gi, '')
    // Remove null bytes
    .replace(/\0/g, '')
    .trim();
}
