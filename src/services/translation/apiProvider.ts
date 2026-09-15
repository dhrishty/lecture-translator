import { splitTranslationText } from "@/lib/translationChunks";
import type { TranslationProvider } from "./types";

/** Client-side provider that calls the Next.js translation proxy. */
export const apiTranslationProvider: TranslationProvider = {
  async translateText(koreanText: string, signal?: AbortSignal): Promise<string> {
    const translations: string[] = [];
    for (const text of splitTranslationText(koreanText)) {
    const response = await fetch("/api/translate", {
      method: "POST",
      cache: "no-store",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(45000)]) : AbortSignal.timeout(45000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(
        (body as { error?: string }).error ?? "Translation request failed",
      );
    }

    const data = (await response.json()) as { translation: string };
    translations.push(data.translation);
    }
    return translations.join(" ");
  },
};
