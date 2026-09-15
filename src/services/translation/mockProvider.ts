import type { TranslationProvider } from "./types";

/** Dev-only mock: prefixes text to indicate translation occurred. */
export const mockTranslationProvider: TranslationProvider = {
  async translateText(koreanText: string): Promise<string> {
    await new Promise((r) => setTimeout(r, 300 + Math.random() * 400));
    return `[Demo — untranslated Korean] ${koreanText}`;
  },
};
