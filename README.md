# Lecture Translator

A temporary Korean → English, Korean-only, or English-only lecture workspace with local Whisper transcription. Upload slides, listen, edit notes, and copy the lecture before leaving.

## Run

Use Node.js 22 or newer.

```sh
npm install
npm run dev
```

Open http://localhost:3000. In restricted environments where Turbopack cannot launch its CSS subprocess, use `npm run dev -- --webpack`. Production: `npm run build -- --webpack`, then `npm start`.

Local PDF.js font maps and decoders, including Korean font support, are prepared automatically before dev/build. These are library assets, not user PDFs.

## Translation: LibreTranslate

The app now uses the installed [free-translation-api skill](.agents/skills/besoeasy-open-skills-free-translation-api/SKILL.md), version 1.0.1. It sends finalized Korean text through `/api/translate` to one configured LibreTranslate server. It checks `/languages` for Korean → English support before posting `{q, source: "ko", target: "en", format: "text"}` to `/translate`.

**Installing the skill does not install a translation server.** The public hosts in its examples were inaccessible during verification (403, 502, DNS failure); another official mirror timed out. LibreTranslate's [official API documentation](https://docs.libretranslate.com/guides/api_usage/) states that libretranslate.com requires a key, despite the skill claiming otherwise. Local LibreTranslate has now been installed and verified with a real Korean → English request. The app is configured to use http://127.0.0.1:5000.

The app has no demo fallback and does not silently switch back to Google. It keeps Korean text and displays an actionable error when the service is unavailable. English-only transcription requires no translation server.

After choosing or setting up a compatible keyless server, add its URL to `.env.local` and restart Next.js:

```dotenv
LIBRETRANSLATE_URL=http://127.0.0.1:5000
```

A remote server must use HTTPS. The URL is server configuration, never an arbitrary URL supplied by clients. This integration sends no API keys. Marketplace registration credentials are separate from translation and never used by the app.

### Local server

Setup has been approved and completed on this Mac. To restart the translation server in a separate terminal, run `sh scripts/start-libretranslate.sh`. The setup command is only needed on a new installation:

```sh
sh scripts/setup-libretranslate.sh
sh scripts/start-libretranslate.sh
```

The setup script creates a project-local Python virtual environment and installs LibreTranslate. The start script binds only to `127.0.0.1:5000`, loads English/Korean models, and disables file translation and the separate web UI. First startup downloads the models. Python dependencies/model files consume disk space; these are software assets, not stored lecture content. The installed packages and Korean/English models have been verified on this Mac. Model assets live in `.local-translation`; software lives in `.venv-libretranslate`. See [official installation instructions](https://docs.libretranslate.com/guides/installation/).

## Lecture workflow

- Choose **Start without slides** for a notes-only lecture, or upload a PDF, up to 100 MB. Password-protected PDFs are unsupported.
- Use the language icon to toggle **Korean → English translation** or **English-only transcription**.
- Start listening and allow microphone access. Language changes restart recognition with the correct language after flushing the previous mode; late finalized speech retains its original language.
- Local microphone capture uses an AudioWorklet and 16 kHz mono PCM. Whisper Base runs in a dedicated worker with WebGPU (fp32 encoder/q4 decoder), falling back to quantized WASM (q8) during initialization. No Chrome Web Speech API remains.
- Paragraphs close after **3 seconds of energy-detected silence**. Recognition windows are at most about 24 seconds; short pauses after 15 seconds are preferred as window boundaries. Long speech is assembled as text before translation. Pause, Finish, slide changes and mode changes close the current paragraph. Each result carries its capture slide and mode.
- Capture pauses when pending inference reaches 48 seconds or 48 jobs, allowing the queue to drain. A hard limit of 100 seconds/64 jobs prevents unbounded audio accumulation if callbacks are delayed. Only bounded PCM and model tensors exist in RAM; no full lecture recording exists. Continuous 60–90-minute performance depends on hardware.
- Navigate with arrows or keyboard Left/Right. Notes retain their slide, and typing in editors does not navigate slides.
- Edit manual notes and completed transcriptions with the same lightweight block editor: `/heading 1`, `/heading 2`, `/heading 3`, `/bullet`, or the format toolbar. Type `- ` for a bullet; Enter continues the list, and Enter on an empty bullet returns to normal text. `# `, `## `, and `### ` also create headings. Basic undo/redo is available while editing.
- Notes have no white focus border.
- On the last slide (or at any time without slides), **Finish Lecture** stops recognition, collects finalized speech, and opens an editable review page with **Slide 1 / Slide 2 / Slide 3** headings, manual notes, and transcribed notes. No PDF slides appear there. Pending translations continue updating their original segments.
- **Copy Lecture** copies nonempty slides in order as Markdown, preserving edited headings/lists. **Copy Current Slide** is also available. Paste into Notion without an integration or account.
- Copy flushes buffered finalized speech immediately. Pending/failed translations include Korean; copy again once translation finishes for the English. Interim speech is never committed or exported.
- **End Lecture** shows a confirmation. Copy keeps the session open. End Without Copying destroys it. Review is temporary too.

## Privacy and practical limits

PDFs, manual notes, transcripts, translations, and the review page live only in browser memory. No accounts, database, analytics, localStorage, IndexedDB, history, or recovery. PDFs and manual notes never enter translation requests. The app does not record raw audio or log transcript payloads. Translation HTTP requests/responses use `no-store`; no transcript cache is maintained.

Microphone audio is never uploaded, recorded to a file, or placed in browser storage. Audio buffers are cleared/released after inference and the worker is terminated on exit. Public model/runtime files may be cached by Transformers.js; they contain no lecture data. Only finalized Korean paragraphs in translation mode go through the existing LibreTranslate endpoint. Transcription-only modes send no text for translation. Browser/OS memory reclamation is outside the app's control.

Use HTTPS or localhost with microphone permission and AudioWorklet/WebAssembly support. A recent desktop Chrome/Edge with WebGPU and a laptop with 8 GB+ RAM is recommended. Base model weights are approximately 207 MB for WebGPU or 77 MB for WASM, plus tokenizer/runtime files; falling back after a GPU failure can download both variants. WASM may not run in real time. Keep the tab open and device awake. Noise, hard audio-window boundaries and Korean technical vocabulary can affect accuracy; Whisper can produce incorrect text. Silence filtering reduces unnecessary inference but is not a trained voice-activity detector. No LLM, summary or other generative feature is included.

Refresh/close triggers the browser's native leave warning where supported. The browser controls the message and may omit it. Page departure clears session memory, including back-cache recovery. Always copy before leaving.

## Architecture

```text
src/components/LectureWorkspace.tsx       Upload, lecture, and review flow
src/components/LectureReview.tsx          Whole-lecture editing without PDF slides
src/components/NotesEditor.tsx            Shared heading/list block editor
src/components/ModeToggle.tsx             English-only / Korean translation control
src/components/PDFViewer.tsx              Memoized PDF canvas and cleanup
src/hooks/useLectureSession.ts           In-memory state and segment-ID updates
src/hooks/useSpeechRecognition.ts        Bilingual recognition and safe stopping
src/lib/transcriptBuffer.ts               Slide/language-aware chunking
src/lib/noteBlocks.ts                     Markdown block parsing and serialization
src/services/translation/libreTranslate.ts LibreTranslate protocol, support checks, errors
src/app/api/translate/route.ts            No-cache server proxy and service status
src/services/clipboardExportService.ts   Export preserving edits and Korean fallback
```

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build -- --webpack
```

Tests cover slide/language chunk boundaries, buffer disposal, block formatting, edited export, request validation, missing server setup, Korean support checks, minimal translation payloads, auth/throttling failures, and invalid responses. Provider HTTP is mocked in unit tests; that does not certify live availability.

Before class, verify your Korean PDF, microphone permission, all three modes, rapid slide changes, Finish Lecture, editing, and Notion paste in Chrome. Browser layout, WebGPU execution, Korean classroom accuracy and sustained real-time microphone behavior still require device testing; no browser was connected during implementation. Automated tests simulate 90 minutes of PCM and verify bounded buffers, silence, cancellation and slide association.

## GitHub and Vercel

The repository is intended to remain private. `.vercelignore` excludes local environments, credentials, model downloads, and build outputs from uploads. Vercel runs the Webpack production build configured in `vercel.json`.

The local translation URL in `.env.local` must not be copied into Vercel: localhost there refers to the cloud function, not your Mac. The site supports PDFs, notes, English transcription, editing, and copying without a backend, but Korean translation needs a reachable LibreTranslate server. A separate [container definition](deploy/libretranslate/README.md) is ready for a host that supports persistent services. Configure the resulting HTTPS URL as `LIBRETRANSLATE_URL` in Vercel, then redeploy.

Published application: https://lecture-translator-three.vercel.app

Private source repository: https://github.com/dhrishty/lecture-translator

`render.yaml` prepares a free-tier LibreTranslate backend. A Render account connection and Blueprint deployment are still required. The public Vercel app reports translation setup as incomplete until a reachable backend URL is configured; local translation continues working on the Mac.
