export interface TranslationProvider {
  translateText(koreanText: string, signal?: AbortSignal): Promise<string>;
}
