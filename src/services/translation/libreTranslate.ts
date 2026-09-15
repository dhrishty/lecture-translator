/** LibreTranslate protocol from the installed free-translation-api skill.
 * Runs on the Next.js server. No credentials, transcript logging, or persistent cache.
 */
export function libreTranslateUrl(): URL | null {
  const configured = process.env.LIBRETRANSLATE_URL?.trim();
  if (!configured) return null;
  const url = new URL(configured.endsWith("/") ? configured : `${configured}/`);
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && local))) {
    throw new Error("Use an HTTPS LibreTranslate URL, or HTTP on localhost, without credentials or query parameters.");
  }
  return url;
}

export async function checkKoreanSupport(base: URL, signal: AbortSignal): Promise<void> {
  const response = await fetch(new URL("languages", base), { cache: "no-store", signal, redirect: "error" });
  if (!response.ok) throw new Error("Cannot check LibreTranslate language support. Check the server address and availability.");
  const languages: unknown = await response.json();
  const supported = Array.isArray(languages) && languages.some(language =>
    language?.code === "ko" && Array.isArray(language.targets) && language.targets.includes("en"));
  if (!supported) throw new Error("This LibreTranslate server does not advertise Korean → English support. Install the Korean-to-English model or choose a compatible server.");
}

export async function translateWithLibreTranslate(text: string, signal?: AbortSignal): Promise<string> {
  const base = libreTranslateUrl();
  if (!base) throw new Error("LibreTranslate needs a server address. Set LIBRETRANSLATE_URL after setting up a Korean → English server. English-only transcription is available now.");
  const timeout = AbortSignal.timeout(40000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;
  await checkKoreanSupport(base, requestSignal);
  const response = await fetch(new URL("translate", base), {
    method: "POST", cache: "no-store", redirect: "error", signal: requestSignal,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ q: text, source: "ko", target: "en", format: "text" }),
  });
  if (response.status === 401 || response.status === 403) throw new Error("This LibreTranslate server requires access or an API key. No credentials were sent. Choose a keyless server or approve credential setup.");
  if (response.status === 429) throw new Error("LibreTranslate is limiting requests. Wait a moment, then retry; your Korean text is kept.");
  if (!response.ok) throw new Error("LibreTranslate could not translate this text. Your Korean transcript is kept for retry.");
  const data: unknown = await response.json();
  if (!data || typeof data !== "object" || !("translatedText" in data) || typeof data.translatedText !== "string" || !data.translatedText.trim()) {
    throw new Error("LibreTranslate returned no usable translation. Your Korean transcript is kept for retry.");
  }
  return data.translatedText.trim();
}
