"use client";
import { useEffect, useRef, useState } from "react";
import { ParagraphAudio } from "@/lib/whisper/audio";
import { ContinuousAudio, TranscriptMerger, RATE, type ContinuousWindow, type RecognitionResult } from "@/lib/whisper/continuous";

type Reply = RecognitionResult & { backend: string; model: string; revision: string; precision: string; processingMs: number; flagged?: boolean };
interface Run { name: string; model: string; revision: string; backend: string; precision: string; duration: number; inferenceMs: number; totalMs: number; loadMs: number; combined: string; warnings: string[]; raw: { text: string; seconds: number; flagged: boolean }[] }

// Read metadata before decoding so a compressed full lecture cannot allocate a huge PCM buffer.
async function excerptDuration(file: File): Promise<number> {
  const url = URL.createObjectURL(file);
  const probe = new Audio();
  try {
    return await new Promise<number>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Could not read audio duration. Try a short WAV excerpt.")), 15000);
      probe.preload = "metadata";
      probe.onloadedmetadata = () => { clearTimeout(timer); resolve(probe.duration); };
      probe.onerror = () => { clearTimeout(timer); reject(new Error("Cannot read this audio file.")); };
      probe.src = url;
    });
  } finally { probe.onloadedmetadata = null; probe.onerror = null; probe.removeAttribute("src"); probe.load(); URL.revokeObjectURL(url); }
}

export default function WhisperComparison() {
  const [file, setFile] = useState<File | null>(null);
  const [backend, setBackend] = useState("webgpu");
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState("");
  const [runs, setRuns] = useState<Run[]>([]);
  const worker = useRef<Worker | null>(null);
  const cancel = useRef<(() => void) | null>(null);
  const epoch = useRef(0);
  useEffect(() => () => { epoch.current++; cancel.current?.(); worker.current?.terminate(); }, []);
  const compare = async () => {
    if (!file || running) return;
    if (file.size > 30 * 1024 * 1024) { setStatus("Choose a short excerpt smaller than 30 MB."); return; }
    const generation = ++epoch.current;
    setRunning(true); setRuns([]); setStatus("Decoding the selected file locally…");
    let pcm: Float32Array | null = null;
    let ownedWindows: ContinuousWindow[] = [];
    try {
      const metadataDuration = await excerptDuration(file);
      if (!Number.isFinite(metadataDuration) || metadataDuration <= 0 || metadataDuration > 180) throw new Error("Choose a known-duration audio excerpt of up to 3 minutes.");
      if (generation !== epoch.current) return;
      const audio = new AudioContext();
      let decoded: AudioBuffer;
      try { decoded = await audio.decodeAudioData(await file.arrayBuffer()); } finally { await audio.close(); }
      if (decoded.duration > 180) throw new Error("Use an excerpt of up to 3 minutes, not a full lecture recording.");
      if (generation !== epoch.current) return;
      const resampler = new OfflineAudioContext(1, Math.ceil(decoded.duration * RATE), RATE);
      const source = resampler.createBufferSource(); source.buffer = decoded; source.connect(resampler.destination); source.start();
      const rendered = await resampler.startRendering();
      pcm = rendered.getChannelData(0).slice();
      rendered.getChannelData(0).fill(0);
      for (let c = 0; c < decoded.numberOfChannels; c++) decoded.getChannelData(c).fill(0);
      const duration = pcm.length / RATE;
      const jobs = [
        { model: "base", legacy: true, name: "Base · previous independent chunking" },
        { model: "base", legacy: false, name: "Base · 24 s windows / 3 s overlap" },
        { model: "small", legacy: false, name: "Small · 24 s windows / 3 s overlap" },
      ];
      for (const job of jobs) {
        if (generation !== epoch.current) break;
        const local = new Worker(new URL("../../workers/whisper.worker.ts", import.meta.url), { type: "module" });
        worker.current = local;
        let serial = 0;
        const pending = new Map<number, { resolve: (reply: Reply) => void; reject: (error: Error) => void; timer: ReturnType<typeof setTimeout> }>();
        const stop = () => {
          local.terminate(); pending.forEach(p => { clearTimeout(p.timer); p.reject(new Error("Comparison cancelled.")); }); pending.clear();
        };
        cancel.current = stop;
        local.onmessage = event => {
          const data = event.data;
          if (data.type === "progress") { if (generation === epoch.current) setStatus(`${job.name}: ${data.message}`); return; }
          const item = pending.get(data.id); if (!item) return;
          clearTimeout(item.timer); pending.delete(data.id);
          if (data.error) item.reject(new Error(data.error)); else item.resolve(data);
        };
        local.onerror = () => { pending.forEach(p => { clearTimeout(p.timer); p.reject(new Error("Local worker failed. Try WASM for all runs.")); }); pending.clear(); };
        const request = (payload: object, samples?: Float32Array) => new Promise<Reply>((resolve, reject) => {
          const id = ++serial;
          const timer = setTimeout(() => { pending.delete(id); reject(new Error("Local processing timed out.")); }, 600000);
          pending.set(id, { resolve, reject, timer });
          local.postMessage({ id, ...payload, audio: samples }, samples ? [samples.buffer] : []);
        });
        try {
          const loading = performance.now();
          const info = await request({ type: "load", model: job.model, backend });
          const loadMs = performance.now() - loading;
          ownedWindows = [];
          const captureContext = { slide: 1, mode: "ko" as const };
          const segmenter = job.legacy
            ? new ParagraphAudio(captureContext, w => ownedWindows.push({ ...w, start: 0, end: w.audio.length, boundaries: [{ sample: 0, context: captureContext }] }))
            : new ContinuousAudio(captureContext, w => ownedWindows.push(w));
          for (let start = 0; start < pcm.length; start += 1600) segmenter.push(pcm.slice(start, start + 1600));
          segmenter.finish(); segmenter.clear();
          const combined: string[] = []; const warnings: string[] = [];
          const merger = new TranscriptMerger(text => combined.push(text), () => {}, warning => warnings.push(warning));
          const run: Run = { name: job.name, ...info, duration, loadMs, inferenceMs: 0, totalMs: 0, combined: "", warnings, raw: [] };
          const started = performance.now();
          for (let i = 0; i < ownedWindows.length; i++) {
            if (generation !== epoch.current) throw new Error("Comparison cancelled.");
            const window = ownedWindows[i]; const seconds = window.audio.length / RATE;
            setStatus(`${job.name}: window ${i + 1}/${ownedWindows.length}`);
            const output = seconds ? await request({ type: "transcribe", mode: "ko", comparison: true, legacy: job.legacy }, window.audio) : { text: "", chunks: [], processingMs: 0, flagged: false };
            run.raw.push({ text: output.text, seconds, flagged: !!output.flagged });
            run.inferenceMs += output.processingMs;
            if (job.legacy) combined.push(output.text);
            else {
              try { merger.accept(window, output); }
              catch (error) { warnings.push(error instanceof Error ? error.message : "Alignment unavailable"); }
            }
            run.combined = combined.join("\n\n"); run.totalMs = performance.now() - started;
            setRuns(previous => [...previous.filter(r => r.name !== run.name), { ...run, raw: [...run.raw], warnings: [...warnings] }]);
          }
        } finally { ownedWindows.forEach(w => { if (w.audio.byteLength) w.audio.fill(0); }); ownedWindows = []; stop(); worker.current = null; cancel.current = null; }
      }
      if (generation === epoch.current) setStatus("Finished. Compare the raw Korean yourself; no quality scores or translation were generated.");
    } catch (error) { if (generation === epoch.current) setStatus(error instanceof Error ? error.message : "Comparison failed."); }
    finally { pcm?.fill(0); ownedWindows.forEach(w => { if (w.audio.byteLength) w.audio.fill(0); }); if (generation === epoch.current) setRunning(false); }
  };
  return <main className="workspace">
    <h1>Local Korean transcription comparison</h1>
    <p>Select an existing Korean audio excerpt (up to 3 minutes / 30 MB). It stays in memory in this tab and is never uploaded or saved by this test.</p>
    <p>Runs: Base with previous chunking, Base with overlap, then Small with overlap. All use the same selected backend and precision. Each model is released before the next run. Small is only used here.</p>
    <input type="file" accept="audio/*" disabled={running} aria-label="Korean audio excerpt" onChange={e => setFile(e.target.files?.[0] ?? null)} />
    <select aria-label="Inference backend" disabled={running} value={backend} onChange={e => setBackend(e.target.value)}><option value="webgpu">WebGPU · encoder FP32 / decoder Q4</option><option value="wasm">WASM · Q8</option></select>
    <button className="primary-button" disabled={!file || running} onClick={() => void compare()}>Compare locally</button>
    {running && <button className="text-button" onClick={() => { epoch.current++; cancel.current?.(); setRunning(false); setStatus("Cancelled; temporary audio is released as pending work exits."); }}>Cancel</button>}
    {!running && <button className="text-button" onClick={() => setRuns([])}>Clear results</button>}
    <p role="status">{status}</p>
    {runs.map(run => <section className="document-section" key={run.name}>
      <h2>{run.name}</h2>
      <p>{run.model} · revision {run.revision} · {run.backend} · {run.precision}</p>
      <p>Audio: {run.duration.toFixed(2)} s · Inference: {(run.inferenceMs / 1000).toFixed(2)} s · Processing: {(run.totalMs / 1000).toFixed(2)} s · Model loading: {(run.loadMs / 1000).toFixed(2)} s</p>
      <h3>Combined Korean (boundary deduplication only)</h3><pre style={{ whiteSpace: "pre-wrap" }} lang="ko">{run.combined}</pre>
      {run.warnings.map((warning, i) => <p key={i}>{warning}</p>)}
      <h3>Raw Korean per inference window — unedited</h3>
      {run.raw.map((item, i) => <div key={i}><h4>Window {i + 1} · {item.seconds.toFixed(2)} s {item.flagged ? "· Repetition flag (text retained)" : ""}</h4><pre style={{ whiteSpace: "pre-wrap" }} lang="ko">{item.text || "(No text)"}</pre></div>)}
    </section>)}
  </main>;
}
