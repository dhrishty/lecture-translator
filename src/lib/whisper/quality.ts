/** Conservative runaway-loop detection. Ordinary repeated words remain untouched. */
export function hasRepetitionLoop(text: string): boolean {
  const normalized = text.normalize("NFKC").replace(/[\p{P}\p{S}]/gu, " ").trim();
  const words = normalized.split(/\s+/u).filter(Boolean);
  for (let width = 1; width <= 16; width++) {
    for (let start = 0; start + width * 4 <= words.length; start++) {
      let count = 1;
      while (start + (count + 1) * width <= words.length &&
        words.slice(start, start + width).every((word, index) => word === words[start + count * width + index])) count++;
      if (count >= 4 && count * width >= 12) return true;
    }
  }
  // Korean transcripts sometimes omit spaces entirely.
  for (const word of words) {
    for (let width = 1; width <= 16; width++) {
      for (let start = 0; start + width * 6 <= word.length; start++) {
        const unit = word.slice(start, start + width);
        let count = 1;
        while (word.slice(start + count * width, start + (count + 1) * width) === unit) count++;
        if (count >= 6 && count * width >= 24) return true;
      }
    }
  }
  return false;
}
