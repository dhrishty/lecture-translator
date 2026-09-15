import type { TranslationProvider } from "./types";

/** Keyless endpoint requested by the user. This is not the supported Cloud API. */
export const browserGoogleProvider: TranslationProvider = {
  async translateText(text, signal) {
    if (!text.trim()) throw new Error("No transcript to translate.");
    const url = new URL("https://translate.googleapis.com/translate_a/single");
    url.search = new URLSearchParams({ client: "gtx", sl: "ko", tl: "en", dt: "t", q: text }).toString();
    let response: Response;
    try {
      response = await fetch(url, {
      method: "GET",
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      referrerPolicy: "no-referrer",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20000)]) : AbortSignal.timeout(20000),
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new Error("Cannot reach Google Translate. Check your connection; Google may be blocking or limiting requests. Your Korean text is kept.");
    }
    if (!response.ok) throw new Error(response.status === 429
      ? "Google is limiting translation requests. Wait a moment, then retry."
      : "Google translation is unavailable. Your Korean text is kept; try again shortly.");
    const data: unknown = await response.json();
    if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error("Google returned an unexpected response. Please retry.");
    const translated = data[0].map((part: unknown) => Array.isArray(part) && typeof part[0] === "string" ? part[0] : "").join("").trim();
    if (!translated) throw new Error("Google returned no translation. Please retry.");
    return translated;
  },
};
