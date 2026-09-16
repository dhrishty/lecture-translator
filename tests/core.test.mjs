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

const localAudio = await import(await moduleURL("../src/lib/whisper/audio.ts"));
const voicedFrame = () => new Float32Array(1600).fill(0.03);
const quietFrame = () => new Float32Array(1600);
test("local audio seals paragraphs at three seconds of silence and ignores empty rooms", () => {
  const emitted = [];
  const audio = new localAudio.ParagraphAudio({ slide: 1, mode: "ko" }, window => emitted.push(window));
  for (let i = 0; i < 100; i++) audio.push(quietFrame());
  assert.equal(emitted.length, 0);
  audio.push(voicedFrame());
  for (let i = 0; i < 29; i++) audio.push(quietFrame());
  assert.equal(emitted.length, 0);
  audio.push(quietFrame());
  assert.equal(emitted.length, 1); assert.equal(emitted[0].final, true);
  emitted[0].audio.fill(0);
});
test("90 minutes of simulated continuous capture uses bounded windows, not a recording", () => {
  let total = 0; let windows = 0; let paragraphs = 0;
  const audio = new localAudio.ParagraphAudio({ slide: 1, mode: "ko" }, window => {
    assert.ok(window.audio.length <= localAudio.MAX_WINDOW_SAMPLES);
    total += window.audio.length; windows++; if (window.final) paragraphs++;
    window.audio.fill(0);
  });
  for (let i = 0; i < 90 * 60 * 10; i++) audio.push(voicedFrame());
  audio.finish();
  assert.equal(total, 90 * 60 * 16000);
  assert.ok(windows > 200); assert.equal(paragraphs, 1);
});
test("late local results keep their capture slide/mode and translation waits for the paragraph", async () => {
  const paragraphs = []; let release;
  const gate = new Promise(resolve => { release = resolve; });
  const queue = new localAudio.TranscriptionQueue(async () => { await gate; return "문장"; },
    (text, captured) => paragraphs.push({ text, ...captured }), () => {}, assert.fail);
  const first = voicedFrame();
  queue.enqueue({ audio: first, final: false, context: { slide: 1, mode: "ko" } });
  queue.enqueue({ audio: voicedFrame(), final: true, context: { slide: 1, mode: "ko" } });
  queue.enqueue({ audio: voicedFrame(), final: true, context: { slide: 2, mode: "ko-only" } });
  assert.equal(paragraphs.length, 0);
  release(); await queue.drain();
  assert.deepEqual(paragraphs, [{ text: "문장 문장", slide: 1, mode: "ko" }, { text: "문장", slide: 2, mode: "ko-only" }]);
  assert.ok(first.every(sample => sample === 0)); assert.equal(queue.pendingSamples, 0);
});
test("ending a session discards pending PCM and rejects late text", async () => {
  let release; let delivered = 0;
  const gate = new Promise(resolve => { release = resolve; });
  const queue = new localAudio.TranscriptionQueue(async () => { await gate; return "Late"; }, () => delivered++, () => {}, assert.fail);
  const pending = voicedFrame();
  queue.enqueue({ audio: voicedFrame(), final: true, context: { slide: 1, mode: "ko" } });
  queue.enqueue({ audio: pending, final: true, context: { slide: 1, mode: "ko" } });
  queue.clear(); release(); await Promise.resolve(); await Promise.resolve();
  assert.ok(pending.every(sample => sample === 0)); assert.equal(delivered, 0); assert.equal(queue.pendingSamples, 0);
});
test("a stalled device cannot create an unbounded audio queue", () => {
  let errors = 0;
  const queue = new localAudio.TranscriptionQueue(() => new Promise(() => {}), () => {}, () => {}, () => errors++);
  for (let i = 0; i < 8; i++) queue.enqueue({ audio: new Float32Array(24 * 16000), final: true, context: { slide: 1, mode: "ko" } });
  assert.equal(errors, 1); assert.equal(queue.pendingSamples, 0);
});

test("microphone worklet resamples stereo to 16 kHz mono and flushes its final tail", async () => {
  const { runInNewContext } = await import("node:vm");
  const source = await readFile(new URL("../public/microphone-worklet.js", import.meta.url), "utf8");
  for (const sampleRate of [44100, 48000]) {
    let Processor; const messages = [];
    class Base { constructor() { this.port = { postMessage: message => messages.push(message) }; } }
    runInNewContext(source, { AudioWorkletProcessor: Base, sampleRate, Float32Array, registerProcessor: (_name, type) => { Processor = type; } });
    const processor = new Processor();
    let remaining = sampleRate;
    while (remaining) {
      const length = Math.min(128, remaining); remaining -= length;
      processor.process([[new Float32Array(length).fill(0.2), new Float32Array(length).fill(0.4)]]);
    }
    processor.port.onmessage({ data: "stop" });
    assert.equal(messages.at(-1), "stopped");
    const audio = messages.filter(item => item instanceof Float32Array);
    assert.equal(audio.reduce((sum, frame) => sum + frame.length, 0), 16000);
    assert.ok(audio.every(frame => frame.every(value => Math.abs(value - 0.3) < 0.0001)));
    assert.equal(processor.process([]), false);
  }
});

test("worklet stops instead of buffering indefinitely when the UI cannot acknowledge audio", async () => {
  const { runInNewContext } = await import("node:vm");
  const source = await readFile(new URL("../public/microphone-worklet.js", import.meta.url), "utf8");
  let Processor; let frames = 0; let overflow = false;
  class Base { constructor() { this.port = { postMessage: message => { if (message === "overflow") overflow = true; else frames++; } }; } }
  runInNewContext(source, { AudioWorkletProcessor: Base, sampleRate: 16000, Float32Array, registerProcessor: (_name, type) => { Processor = type; } });
  const processor = new Processor();
  for (let i = 0; i < 1000; i++) processor.process([[new Float32Array(1600)]]);
  assert.equal(frames, 64); assert.equal(overflow, true);
});

const quality = await import(await moduleURL("../src/lib/whisper/quality.ts"));
test("runaway Korean loops are rejected without blocking ordinary repetition", () => {
  assert.equal(quality.hasRepetitionLoop("이런 이래는 " + "제거하는 줄이 ".repeat(30) + "이 부분은"), true);
  assert.equal(quality.hasRepetitionLoop("또 ".repeat(100)), true);
  assert.equal(quality.hasRepetitionLoop("또".repeat(40)), true);
  assert.equal(quality.hasRepetitionLoop("이 부분은 중요합니다. 또 다른 예를 봅시다. 이 부분은 시험에 나옵니다."), false);
  assert.equal(quality.hasRepetitionLoop("No, no, no. Please listen. Again, again."), false);
});
test("silence after a long-window boundary seals text without another Whisper call", async () => {
  let calls = 0; const paragraphs = [];
  const queue = new localAudio.TranscriptionQueue(async () => { calls++; return "강의 내용"; }, text => paragraphs.push(text), () => {}, assert.fail);
  const audio = new localAudio.ParagraphAudio({ slide: 1, mode: "ko" }, window => queue.enqueue(window));
  for (let i = 0; i < 240; i++) audio.push(voicedFrame());
  await queue.drain();
  assert.equal(calls, 1); assert.equal(paragraphs.length, 0);
  for (let i = 0; i < 30; i++) audio.push(quietFrame());
  await queue.drain();
  assert.equal(calls, 1); assert.deepEqual(paragraphs, ["강의 내용"]);
});
test("paragraph silence is trimmed from inference but preserves a short word-ending tail", () => {
  const windows = [];
  const audio = new localAudio.ParagraphAudio({ slide: 1, mode: "ko" }, window => windows.push(window));
  for (let i = 0; i < 10; i++) audio.push(voicedFrame());
  for (let i = 0; i < 30; i++) audio.push(quietFrame());
  assert.equal(windows.length, 1);
  assert.equal(windows[0].audio.length, 1.2 * 16000);
  assert.equal(windows[0].final, true);
});

test("worker clears rejected audio and returns no loop text to the translation queue", async () => {
  const savedSelf = globalThis.self;
  const messages = [];
  globalThis.self = { postMessage: message => messages.push(message) };
  const mockRuntime = 'data:text/javascript,' + encodeURIComponent('export const env = {backends:{onnx:{wasm:{}}}}; export const pipeline = async () => async () => ({text: "제거하는 줄이 ".repeat(30)});');
  try {
    await import(await moduleURL("../src/workers/whisper.worker.ts", {
      '\"@huggingface/transformers\"': JSON.stringify(mockRuntime),
      '\"@/lib/whisper/models\"': JSON.stringify(await moduleURL("../src/lib/whisper/models.ts")),
      '\"@/lib/whisper/quality\"': JSON.stringify(await moduleURL("../src/lib/whisper/quality.ts")),
    }));
    await globalThis.self.onmessage({ data: { id: 1, type: "load" } });
    const pcm = voicedFrame();
    await globalThis.self.onmessage({ data: { id: 2, type: "transcribe", audio: pcm, mode: "ko" } });
    const result = messages.find(message => message.id === 2);
    assert.equal(result.text, ""); assert.match(result.warning, /unreliable/);
    assert.ok(pcm.every(sample => sample === 0));
  } finally { globalThis.self = savedSelf; }
});

const continuous = await import(await moduleURL("../src/lib/whisper/continuous.ts"));
const captureContext = { slide: 1, mode: "ko" };
const timedJob = (start, end, final = false, boundaries = [{ sample: 0, context: captureContext }]) => ({
  audio: new Float32Array(0), start: start * 16000, end: end * 16000, final, boundaries, context: boundaries.at(-1).context,
});
const wordsResult = (entries) => ({ text: entries.map(e => e[0]).join(" "), chunks: entries.map(([text, start, end]) => ({ text, timestamp: [start, end] })) });
test("continuous windows share exactly three seconds and retain quiet speech and short pauses", () => {
  const jobs = [];
  const capture = new continuous.ContinuousAudio(captureContext, job => jobs.push(job));
  for (let i = 0; i < 450; i++) capture.push(new Float32Array(1600).fill(i >= 150 && i < 152 ? 0 : 0.001));
  assert.equal(jobs.length, 2);
  assert.deepEqual(jobs.map(j => [j.start / 16000, j.end / 16000]), [[0, 24], [21, 45]]);
  assert.deepEqual(jobs[0].audio.slice(-48000), jobs[1].audio.slice(0, 48000));
  capture.finish(); assert.equal(jobs.at(-1).final, true);
  assert.equal(jobs.at(-1).audio.length, 0); // No new samples: seal the provisional tail only.
  jobs.forEach(j => j.audio.fill(0));
});
test("slide click adds a timed ownership marker without cutting the audio window", () => {
  const jobs = [];
  const capture = new continuous.ContinuousAudio(captureContext, job => jobs.push(job));
  for (let i = 0; i < 100; i++) capture.push(voicedFrame());
  capture.switchContext({ slide: 2, mode: "ko" });
  assert.equal(jobs.length, 0);
  for (let i = 0; i < 140; i++) capture.push(voicedFrame());
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].boundaries[1].sample, 160000);
  assert.equal(jobs[0].audio.length, 384000);
  capture.clear(); jobs[0].audio.fill(0);
});
test("Korean overlap example appears once, with real repetition outside overlap preserved", () => {
  const output = [];
  const merger = new continuous.TranscriptMerger(text => output.push(text), () => {}, assert.fail);
  merger.accept(timedJob(0, 24), wordsResult([
    ["표현의 자유와 명예 보호 사이의", 2, 10], ["균형을", 21, 22], ["고려해야", 22, 23], ["합니다", 23, 24],
  ]));
  assert.equal(output.length, 0);
  merger.accept(timedJob(21, 45, true), wordsResult([
    ["균형을", 0, 1], ["고려해야", 1, 2], ["합니다", 2, 3], ["그리고 법원은 이 사건에서", 3, 8], ["균형을 고려해야 합니다", 15, 20],
  ]));
  assert.deepEqual(output, ["표현의 자유와 명예 보호 사이의 균형을 고려해야 합니다 그리고 법원은 이 사건에서 균형을 고려해야 합니다"]);
});
test("overlap matching tolerates Korean spacing/punctuation but not a common single word", () => {
  assert.deepEqual(continuous.overlapMatch(["균형을", "고려해야", "합니다."], ["균형을", "고려해야합니다", "그리고"]), { left: 0, right: 2, length: 10 });
  assert.equal(continuous.overlapMatch(["이것은", "중요합니다"], ["중요합니다", "그리고"]), null);
});
test("matched overlap words keep original slide ownership and are emitted only once", () => {
  const output = [];
  const boundaries = [{ sample: 0, context: captureContext }, { sample: 22.5 * 16000, context: { slide: 2, mode: "ko" } }];
  const merger = new continuous.TranscriptMerger((text, context) => output.push({ text, slide: context.slide }), () => {}, assert.fail);
  merger.accept(timedJob(0, 24, false, boundaries), wordsResult([["앞부분", 1, 2], ["균형을", 21, 21.9], ["고려해야", 22, 22.8], ["합니다", 23, 23.9]]));
  merger.accept(timedJob(21, 45, true, boundaries), wordsResult([["균형을", 0, 1], ["고려해야", 1.4, 2], ["합니다", 2, 3], ["새슬라이드", 4, 5]]));
  assert.deepEqual(output, [{ text: "앞부분 균형을 고려해야", slide: 1 }, { text: "합니다 새슬라이드", slide: 2 }]);
});
test("missing word timestamps fail explicitly rather than assigning a crossing chunk to one slide", () => {
  const merger = new continuous.TranscriptMerger(assert.fail, () => {});
  assert.throws(() => merger.accept(timedJob(0, 24), { text: "한국어" }), /Word timestamps unavailable/);
});
test("a 90-minute rolling capture keeps fixed windows and retains no full recording", () => {
  let count = 0; let lastStart = -21 * 16000;
  const capture = new continuous.ContinuousAudio(captureContext, job => {
    if (!job.final) {
      assert.equal(job.audio.length, 24 * 16000);
      assert.equal(job.start - lastStart, 21 * 16000);
      lastStart = job.start; count++;
    }
    job.audio.fill(0);
  });
  for (let i = 0; i < 90 * 60 * 10; i++) capture.push(voicedFrame());
  capture.finish(); capture.clear();
  assert.equal(count, Math.floor((90 * 60 - 3) / 21));
});
test("clearing continuous queue releases waiting audio and ignores an in-flight result", async () => {
  let resolve; let emitted = 0;
  const queue = new continuous.ContinuousQueue(() => new Promise(r => { resolve = r; }), () => emitted++, () => {}, assert.fail);
  const first = { ...timedJob(0, 24), audio: voicedFrame() };
  const pending = { ...timedJob(21, 45, true), audio: voicedFrame() };
  queue.enqueue(first); queue.enqueue(pending); queue.clear();
  resolve(wordsResult([["늦은결과", 0, 0.05]]));
  await queue.drain();
  assert.equal(emitted, 0); assert.equal(queue.pendingSamples, 0);
  assert.ok(first.audio.every(v => v === 0)); assert.ok(pending.audio.every(v => v === 0));
});
test("a word crossing the stable-window edge is retained whole until the next window", () => {
  const output = []; const warnings = [];
  const merger = new continuous.TranscriptMerger(text => output.push(text), () => {}, message => warnings.push(message));
  merger.accept(timedJob(0, 24), wordsResult([["문장", 1, 2], ["균형을", 20.5, 21.3], ["고려해야", 21.3, 22.2], ["합니다", 22.2, 23]]));
  merger.accept(timedJob(21, 45, true), wordsResult([["형을", 0, 0.3], ["고려해야", 0.3, 1.2], ["합니다", 1.2, 2], ["다음문장", 4, 5]]));
  assert.deepEqual(output, ["문장 균형을 고려해야 합니다 다음문장"]);
});
test("mode changes close language context while slide changes preserve it", () => {
  const jobs = [];
  const capture = new continuous.ContinuousAudio(captureContext, job => jobs.push(job));
  capture.push(voicedFrame()); capture.switchContext({ slide: 1, mode: "en" });
  assert.equal(jobs.length, 1); assert.equal(jobs[0].context.mode, "ko"); assert.equal(jobs[0].final, true);
  capture.push(voicedFrame()); capture.finish();
  assert.equal(jobs[1].context.mode, "en"); assert.equal(jobs[1].start, 1600);
  jobs.forEach(job => job.audio.fill(0)); capture.clear();
});
test("a later inference failure preserves already aligned stable text", async () => {
  let calls = 0; const emitted = []; const errors = [];
  const queue = new continuous.ContinuousQueue(async () => {
    if (++calls === 2) throw new Error("Device lost");
    return wordsResult([["확정된 문장", 1, 2], ["미확정", 23, 24]]);
  }, text => emitted.push(text), () => {}, message => errors.push(message));
  queue.enqueue({ ...timedJob(0, 24), audio: voicedFrame() });
  await queue.drain();
  queue.enqueue({ ...timedJob(21, 45), audio: voicedFrame() });
  await queue.drain();
  assert.deepEqual(emitted, ["확정된 문장"]); assert.deepEqual(errors, ["Device lost"]);
});
