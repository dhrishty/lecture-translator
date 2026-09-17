import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import ts from "typescript";
const require = createRequire(import.meta.url);
async function moduleURL(path, replacements = {}) {
  let source = await readFile(new URL(path, import.meta.url), "utf8");
  for (const [from, to] of Object.entries(replacements)) source = source.replaceAll(from, to);
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString("base64")}`;
}
const buffer = await import(await moduleURL("../src/lib/transcriptBuffer.ts"));
const exporter = await import(await moduleURL("../src/services/clipboardExportService.ts"));
const libreURL = await moduleURL("../src/services/translation/libreTranslate.ts");
const route = await import(await moduleURL("../src/app/api/translate/route.ts", {
  '"next/server"': JSON.stringify(pathToFileURL(require.resolve("next/server.js")).href),
  '"@/services/translation/libreTranslate"': JSON.stringify(libreURL),
}));

test("chunks stay on the capture slide when navigation happens", () => {
  const b = buffer.createTranscriptBuffer(); const chunks = [];
  const flush = (text, slide) => chunks.push({ text, slide });
  buffer.addFinalizedPhrase(b, "첫 번째", 1, flush);
  buffer.addFinalizedPhrase(b, "문장입니다", 1, flush);
  buffer.addFinalizedPhrase(b, "다음 슬라이드", 2, flush);
  buffer.flushBuffer(b, flush);
  assert.deepEqual(chunks, [{ text: "첫 번째 문장입니다", slide: 1 }, { text: "다음 슬라이드", slide: 2 }]);
  assert.equal(b.flushTimer, null);
});
test("paragraphs wait for three seconds of recognition silence, including interim activity", context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const b = buffer.createTranscriptBuffer(); const chunks = [];
  const flush = text => chunks.push(text);
  buffer.addFinalizedPhrase(b, "First sentence.", 1, flush);
  context.mock.timers.tick(2900);
  assert.equal(chunks.length, 0);
  buffer.noteSpeechActivity(b, flush);
  context.mock.timers.tick(2000);
  buffer.addFinalizedPhrase(b, "Second sentence.", 1, flush);
  context.mock.timers.tick(2999);
  assert.equal(chunks.length, 0);
  context.mock.timers.tick(1);
  assert.deepEqual(chunks, ["First sentence. Second sentence."]);
});
test("continuous speech no longer splits paragraphs at length or ten seconds", context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const b = buffer.createTranscriptBuffer(); const chunks = [];
  for (let i = 0; i < 12; i++) {
    buffer.addFinalizedPhrase(b, "가".repeat(400), 3, text => chunks.push(text));
    context.mock.timers.tick(2000);
  }
  assert.equal(chunks.length, 0);
  context.mock.timers.tick(1000);
  assert.equal(chunks.length, 1);
});
test("reset destroys buffered text and cancels its timer", () => {
  const b = buffer.createTranscriptBuffer(); let count = 0;
  buffer.addFinalizedPhrase(b, "삭제", 1, () => count++);
  buffer.resetBuffer(b); buffer.flushBuffer(b, () => count++);
  assert.equal(count, 0); assert.equal(b.flushTimer, null); assert.deepEqual(b.phrases, []);
});
test("export skips empty slides, keeps notes and failed Korean in slide order", () => {
  const text = exporter.formatLectureForExport("Media", [
    { slideNumber: 1, manualNotes: "My own notes", transcriptSegments: [] },
    { slideNumber: 2, manualNotes: "", transcriptSegments: [] },
    { slideNumber: 3, manualNotes: "", transcriptSegments: [
      { sourceLanguage: "ko", originalText: "첫 번째", translatedEnglish: "First", translationStatus: "done" },
      { sourceLanguage: "ko", originalText: "실패한 문장", translatedEnglish: "", translationStatus: "failed" },
    ] },
  ]);
  assert.match(text, /# Media/); assert.match(text, /My own notes/); assert.match(text, /First/);
  assert.match(text, /실패한 문장/); assert.doesNotMatch(text, /Slide 02/);
  assert.ok(text.indexOf("Slide 01") < text.indexOf("Slide 03"));
  assert.equal((text.match(/### Notes/g) ?? []).length, 1);
});
const post = body => route.POST(new Request("http://localhost/api/translate", { method: "POST", body: JSON.stringify(body) }));
test("translation endpoint rejects malformed and oversized input", async () => {
  for (const body of [null, {}, { text: 4 }, { text: " " }]) assert.equal((await post(body)).status, 400);
  assert.equal((await post({ text: "a".repeat(5001) })).status, 413);
  assert.equal((await route.POST(new Request("http://localhost/api/translate", { method: "POST", body: "{" }))).status, 400);
});
test("translation endpoint rejects a different browser origin", async () => {
  const response = await route.POST(new Request("http://localhost/api/translate", {
    method: "POST", headers: { Origin: "https://another.example" }, body: JSON.stringify({ text: "한국어" }),
  }));
  assert.equal(response.status, 403);
});
const blocks = await import(await moduleURL("../src/lib/noteBlocks.ts"));
test("language switches flush Korean and English as separate chunks", () => {
  const b = buffer.createTranscriptBuffer(); const chunks = [];
  const flush = (text, slide, language) => chunks.push({ text, slide, language });
  buffer.addFinalizedPhrase(b, "한국어", 1, flush, "ko");
  buffer.addFinalizedPhrase(b, "English lecture", 1, flush, "en");
  buffer.addFinalizedPhrase(b, "Another slide", 2, flush, "en");
  buffer.flushBuffer(b, flush);
  assert.deepEqual(chunks, [
    { text: "한국어", slide: 1, language: "ko" },
    { text: "English lecture", slide: 1, language: "en" },
    { text: "Another slide", slide: 2, language: "en" },
  ]);
});
test("headings and bullets round-trip without losing blank blocks or Unicode", () => {
  const text = "# Heading\n\n## Topic\n- Point\n- 한국어\n### Detail\nOrdinary text";
  assert.equal(blocks.serializeNoteBlocks(blocks.parseNoteBlocks(text)), text);
  assert.deepEqual(blocks.parseNoteBlocks("- "), [{ kind: "bullet", text: "" }]);
  assert.equal(blocks.slashCommand("/heading 1"), "h1");
  assert.equal(blocks.slashCommand("/heading 2"), "h2");
  assert.equal(blocks.slashCommand("/heading 3"), "h3");
  assert.equal(blocks.slashCommand("/bullet"), "bullet");
  assert.equal(blocks.slashCommand("/unknown"), null);
});
test("export keeps edited block formatting and does not label English as Korean", () => {
  const text = exporter.formatLectureForExport("English lecture", [{ slideNumber: 1, manualNotes: "# My heading\n- My point", transcriptSegments: [
    { sourceLanguage: "en", originalText: "Original wording", translatedEnglish: "Original wording", editedText: "## Edited heading\n- Corrected wording", translationStatus: "done" },
  ] }]);
  assert.match(text, /# My heading\n- My point/);
  assert.match(text, /## Edited heading\n- Corrected wording/);
  assert.doesNotMatch(text, /Original Korean|Original wording/);
});

test("unconfigured LibreTranslate never returns mock text or silently uses credentials", async () => {
  const saved = process.env.LIBRETRANSLATE_URL;
  const savedFetch = globalThis.fetch;
  try {
    delete process.env.LIBRETRANSLATE_URL;
    globalThis.fetch = async () => { throw new Error("Must not contact a service before it is configured"); };
    const response = await post({ text: "한국어" });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /needs a server address/);
    assert.equal((await (await route.GET()).json()).ready, false);
  } finally {
    globalThis.fetch = savedFetch;
    if (saved === undefined) delete process.env.LIBRETRANSLATE_URL; else process.env.LIBRETRANSLATE_URL = saved;
  }
});
test("LibreTranslate checks Korean support and sends only transcript and fixed language options", async () => {
  const saved = process.env.LIBRETRANSLATE_URL;
  const savedFetch = globalThis.fetch;
  const calls = [];
  try {
    process.env.LIBRETRANSLATE_URL = "http://127.0.0.1:5000";
    globalThis.fetch = async (url, options) => {
      calls.push(url.pathname);
      assert.equal(options.cache, "no-store");
      if (url.pathname === "/languages") return Response.json([{ code: "ko", targets: ["en"] }]);
      assert.deepEqual(JSON.parse(options.body), { q: "안녕하세요", source: "ko", target: "en", format: "text" });
      assert.deepEqual(options.headers, { "Content-Type": "application/json" });
      return Response.json({ translatedText: "Hello" });
    };
    const response = await post({ text: "안녕하세요", notes: "private manual notes", pdf: "private PDF" });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    assert.equal((await response.json()).translation, "Hello");
    assert.deepEqual(calls, ["/languages", "/translate"]);
  } finally {
    globalThis.fetch = savedFetch;
    if (saved === undefined) delete process.env.LIBRETRANSLATE_URL; else process.env.LIBRETRANSLATE_URL = saved;
  }
});
test("unsupported Korean is caught before any transcript is sent", async () => {
  const saved = process.env.LIBRETRANSLATE_URL;
  const savedFetch = globalThis.fetch;
  try {
    process.env.LIBRETRANSLATE_URL = "http://127.0.0.1:5000";
    globalThis.fetch = async url => {
      assert.equal(url.pathname, "/languages");
      return Response.json([{ code: "en", targets: ["es"] }]);
    };
    const response = await post({ text: "한국어" });
    assert.equal(response.status, 503);
    assert.match((await response.json()).error, /does not advertise Korean/);
  } finally {
    globalThis.fetch = savedFetch;
    if (saved === undefined) delete process.env.LIBRETRANSLATE_URL; else process.env.LIBRETRANSLATE_URL = saved;
  }
});
test("LibreTranslate preserves actionable authentication, throttle, and malformed-response failures", async () => {
  const saved = process.env.LIBRETRANSLATE_URL;
  const savedFetch = globalThis.fetch;
  try {
    process.env.LIBRETRANSLATE_URL = "http://127.0.0.1:5000";
    for (const [status, expected] of [[403, /No credentials were sent/], [429, /limiting requests/], [500, /could not translate/], [200, /no usable translation/]]) {
      globalThis.fetch = async url => url.pathname === "/languages"
        ? Response.json([{ code: "ko", targets: ["en"] }])
        : Response.json({}, { status });
      const response = await post({ text: "한국어" });
      assert.equal(response.status, 503);
      assert.match((await response.json()).error, expected);
    }
  } finally {
    globalThis.fetch = savedFetch;
    if (saved === undefined) delete process.env.LIBRETRANSLATE_URL; else process.env.LIBRETRANSLATE_URL = saved;
  }
});

test("slide-free export includes both note sections without invented slide headers", () => {
  const text = exporter.formatLectureForExport("Lecture notes", [{ slideNumber: 1, manualNotes: "My notes", transcriptSegments: [
    { sourceLanguage: "en", originalText: "Spoken paragraph", translatedEnglish: "Spoken paragraph", translationStatus: "done" },
  ] }], false);
  assert.match(text, /My notes/); assert.match(text, /Spoken paragraph/); assert.doesNotMatch(text, /Slide 01/);
});
const transport = await import(await moduleURL("../src/lib/translationChunks.ts"));
test("long paragraphs are split for transport without dropping words", () => {
  const paragraph = Array.from({ length: 1600 }, () => "한국어 문장입니다.").join(" ");
  const chunks = transport.splitTranslationText(paragraph);
  assert.ok(chunks.length > 1); assert.ok(chunks.every(chunk => chunk.length <= 3000));
  assert.equal(chunks.join(" "), paragraph);
});

test("Korean-only paragraphs keep their capture mode across switches", () => {
  const b = buffer.createTranscriptBuffer(); const chunks = [];
  const flush = (text, slide, mode) => chunks.push({ text, mode });
  buffer.addFinalizedPhrase(b, "번역", 1, flush, "ko");
  buffer.addFinalizedPhrase(b, "한글만", 1, flush, "ko-only");
  buffer.flushBuffer(b, flush);
  assert.deepEqual(chunks, [{ text: "번역", mode: "ko" }, { text: "한글만", mode: "ko-only" }]);
});
test("export pairs Korean paragraphs with English and does not duplicate Korean-only notes", () => {
  const text = exporter.formatLectureForExport("Lecture", [{ slideNumber: 1, manualNotes: "", transcriptSegments: [
    { sourceLanguage: "ko", originalText: "첫째", translatedEnglish: "First", translationStatus: "done" },
    { sourceLanguage: "ko", originalText: "둘째", translatedEnglish: "Second", translationStatus: "done" },
    { sourceLanguage: "ko", originalText: "한글만", translatedEnglish: "한글만", transcribeOnly: true, translationStatus: "done" },
  ] }]);
  assert.match(text, /첫째\n\nFirst\n\n둘째\n\nSecond/);
  assert.equal(text.split("한글만").length, 2);
});

// Exercise actual recognition handlers with a minimal hook/browser harness.
test("recognition survives quiet sessions, retries network failures, and pause cancels retries", async context => {
  context.mock.timers.enable({ apis: ["setTimeout"] });
  const reactStub = 'data:text/javascript,' + encodeURIComponent('export const useCallback = f => f; export const useRef = current => ({current}); export const useState = v => [v, () => {}]; export const useEffect = f => { f(); };');
  const speechModule = await import(await moduleURL("../src/hooks/useSpeechRecognition.ts", { '"react"': JSON.stringify(reactStub) }));
  const saved = globalThis.window;
  let instance; let starts = 0; let stopped = 0; const results = [];
  class Recognition {
    constructor() {
      // The fake browser exposes its active recognition instance to the test.
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      instance = this;
    }
    start() { starts++; this.onstart(); }
    stop() { this.onend(); }
    abort() {}
  }
  globalThis.window = { SpeechRecognition: Recognition, addEventListener() {}, removeEventListener() {} };
  try {
    const speech = speechModule.useSpeechRecognition({ onFinalResult: (...args) => results.push(args), onStopped: () => stopped++, onActivity() {} });
    speech.start();
    for (let i = 0; i < 8; i++) { instance.onerror({ error: "no-speech" }); instance.onend(); context.mock.timers.tick(500); }
    assert.equal(starts, 9); assert.equal(stopped, 0);
    instance.onerror({ error: "network" }); instance.onend(); context.mock.timers.tick(1000);
    assert.equal(starts, 10); assert.equal(stopped, 0);
    speech.changeLanguage("ko-only"); context.mock.timers.tick(1000);
    assert.equal(instance.lang, "ko-KR");
    const result = Object.assign([{ transcript: "한글" }], { isFinal: true });
    instance.onresult({ resultIndex: 0, results: [result] });
    assert.deepEqual(results, [["한글", "ko-only"]]);
    instance.onerror({ error: "network" }); instance.onend();
    const before = starts;
    await speech.pause(); context.mock.timers.tick(20000);
    assert.equal(starts, before);
  } finally { globalThis.window = saved; }
});
