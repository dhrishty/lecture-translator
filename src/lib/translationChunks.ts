// Transport limits must not determine paragraph boundaries in the document.
export function splitTranslationText(text: string, limit = 3000): string[] {
  const chunks: string[] = [];
  let remaining = text.trim();
  while (remaining.length > limit) {
    const boundary = remaining.lastIndexOf(" ", limit);
    const end = boundary > limit / 2 ? boundary : limit;
    chunks.push(remaining.slice(0, end));
    remaining = remaining.slice(end).trimStart();
  }
  if (remaining) chunks.push(remaining);
  return chunks;
}
