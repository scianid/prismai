const DEFAULT_MAX_CHUNK_CHARS = 1800; // ~450 tokens at ~4 chars/token; safe for 8k-context models

/**
 * Split text into chunks suitable for embedding and retrieval.
 *
 * Strategy:
 *  1. Split by double-newlines (paragraphs) first.
 *  2. If a paragraph exceeds maxChunkChars, split it further by sentences.
 *  3. Accumulate sentences into a chunk until the next sentence would exceed the limit.
 *
 * Returns an array of non-empty strings.
 */
export function chunkText(
  text: string,
  maxChunkChars: number = DEFAULT_MAX_CHUNK_CHARS,
): string[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: string[] = [];

  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxChunkChars) {
      appendToChunks(chunks, paragraph, maxChunkChars);
    } else {
      // Split long paragraphs by sentence boundaries
      const sentences = paragraph.match(/[^.!?]+[.!?]+["']?\s*/g) ??
        [paragraph];
      for (const sentence of sentences) {
        appendToChunks(chunks, sentence.trim(), maxChunkChars);
      }
    }
  }

  return chunks;
}

/**
 * Merge text into the last open chunk if it fits; otherwise start a new chunk.
 */
function appendToChunks(
  chunks: string[],
  text: string,
  maxChunkChars: number,
): void {
  if (!text) return;

  if (chunks.length === 0) {
    chunks.push(text);
    return;
  }

  const last = chunks[chunks.length - 1];
  if (last.length + 1 + text.length <= maxChunkChars) {
    chunks[chunks.length - 1] = last + "\n" + text;
  } else {
    chunks.push(text);
  }
}
