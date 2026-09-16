"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { RecognitionMode } from "@/types/lecture";
import type { CaptureContext } from "@/lib/whisper/audio";
import { ContinuousAudio, ContinuousQueue, type RecognitionResult } from "@/lib/whisper/continuous";
export type SpeechStatus = "idle" | "loading" | "listening" | "processing" | "paused" | "unsupported" | "error";

export function useSpeechRecognition({ onParagraph, slideNumber }: {
  onParagraph: (text: string, slide: number, mode: RecognitionMode) => void; slideNumber: number;
}) {
  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [interimText, setInterimText] = useState("");
  const [errorMessage, setError] = useState<string | null>(null);
  const [modelMessage, setModelMessage] = useState("Whisper Base · Local transcription · Initial download about 80–210 MB plus runtime");
  const [isSupported, setSupported] = useState(true);
  const callback = useRef(onParagraph);
  useEffect(() => { callback.current = onParagraph; }, [onParagraph]);
  const context = useRef<CaptureContext>({ slide: slideNumber, mode: "ko" });
  const worker = useRef<Worker | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const audioContext = useRef<AudioContext | null>(null);
  const capture = useRef<AudioWorkletNode | null>(null);
  const segmenter = useRef<ContinuousAudio | null>(null);
  const queue = useRef<ContinuousQueue | null>(null);
  const wanted = useRef(false);
  const epoch = useRef(0);
  const nextId = useRef(0);
  const pending = useRef(new Map<number, { resolve: (value: RecognitionResult & { backend?: string }) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }>());
  const pausing = useRef<Promise<void> | null>(null);
  const lastFrame = useRef(0);
  const watchdog = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopAck = useRef<(() => void) | null>(null);

  const releaseMicrophone = useCallback(() => {
    if (watchdog.current) clearInterval(watchdog.current);
    watchdog.current = null;
    if (capture.current) { capture.current.port.onmessage = null; capture.current.port.close(); capture.current.disconnect(); }
    capture.current = null;
    stream.current?.getTracks().forEach(track => { track.onended = null; track.stop(); });
    stream.current = null;
    const audio = audioContext.current; audioContext.current = null;
    if (audio) { audio.onstatechange = null; void audio.close().catch(() => {}); }
    stopAck.current?.(); stopAck.current = null;
  }, []);
  const destroyWorker = useCallback(() => {
    worker.current?.terminate(); worker.current = null;
    for (const request of pending.current.values()) { clearTimeout(request.timer); request.reject(new Error("Local transcription cancelled")); }
    pending.current.clear();
  }, []);
  const dispose = useCallback(() => {
    epoch.current++; wanted.current = false;
    releaseMicrophone(); segmenter.current?.clear(); segmenter.current = null;
    queue.current?.clear(); queue.current = null; destroyWorker();
  }, [releaseMicrophone, destroyWorker]);

  const pause = useCallback((): Promise<void> => {
    if (pausing.current) return pausing.current;
    wanted.current = false;
    const runEpoch = epoch.current;
    const finishing = (async () => {
      // Stop downloading immediately if the microphone has not started.
      if (!capture.current && !queue.current) { epoch.current++; releaseMicrophone(); destroyWorker(); setStatus("paused"); return; }
      setStatus("processing");
      if (capture.current) await new Promise<void>(resolve => {
        const timer = setTimeout(resolve, 1000);
        stopAck.current = () => { clearTimeout(timer); resolve(); };
        capture.current!.port.postMessage("stop");
      });
      releaseMicrophone(); segmenter.current?.finish();
      await queue.current?.drain();
      if (runEpoch === epoch.current) { setInterimText(""); setStatus("paused"); }
    })();
    pausing.current = finishing;
    void finishing.finally(() => { pausing.current = null; });
    return finishing;
  }, [releaseMicrophone, destroyWorker]);

  const start = useCallback(async () => {
    if (wanted.current || pausing.current) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.AudioWorkletNode || !window.Worker) { setSupported(false); setStatus("unsupported"); return; }
    queue.current?.clear(); queue.current = null; segmenter.current?.clear(); segmenter.current = null;
    wanted.current = true; setError(null); setStatus("loading");
    const runEpoch = ++epoch.current;
    const current = () => epoch.current === runEpoch;
    const fail = (message: string) => {
      if (!current()) return;
      wanted.current = false; releaseMicrophone(); segmenter.current?.clear(); queue.current?.clear(); destroyWorker();
      setInterimText(""); setError(message); setStatus("error");
    };
    try {
      // Create/resume AudioContext during the user gesture, before model downloads.
      audioContext.current = new AudioContext();
      await audioContext.current.resume();
      if (!current() || !wanted.current) return;
      if (!worker.current) worker.current = new Worker(new URL("../workers/whisper.worker.ts", import.meta.url), { type: "module" });
      const request = (type: string, audio?: Float32Array, mode?: RecognitionMode) => new Promise<RecognitionResult & { backend?: string }>((resolve, reject) => {
        const id = ++nextId.current;
        const timer = setTimeout(() => { pending.current.delete(id); reject(new Error("Whisper took too long. Try a faster device or reload the model.")); }, type === "load" ? 600000 : 180000);
        pending.current.set(id, { resolve, reject, timer });
        worker.current!.postMessage({ id, type, audio, mode }, audio ? [audio.buffer] : []);
      });
      worker.current.onmessage = event => {
        const data = event.data;
        if (data.type === "progress") { if (current()) setModelMessage(data.message); return; }
        const item = pending.current.get(data.id);
        if (!item) return;
        clearTimeout(item.timer); pending.current.delete(data.id);
        if (data.warning && current()) setError(data.warning);
        if (data.error) item.reject(new Error(data.error)); else item.resolve(data);
      };
      worker.current.onerror = () => fail("Local Whisper stopped unexpectedly. Check available memory and retry.");
      const loaded = await request("load");
      if (!current() || !wanted.current) return;
      setModelMessage(`Whisper Base · ${loaded.backend === "webgpu" ? "WebGPU" : "CPU / WASM (slower)"} · Audio stays on this device`);
      const media = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true }, video: false });
      if (!current() || !wanted.current) { media.getTracks().forEach(track => track.stop()); return; }
      stream.current = media;
      const audio = audioContext.current!;
      await audio.audioWorklet.addModule("/microphone-worklet.js");
      if (!current() || !wanted.current) return;
      queue.current = new ContinuousQueue(async (pcm, mode) => await request("transcribe", pcm, mode),
        (text, captured) => { if (current()) callback.current(text, captured.slide, captured.mode); },
        (text, captured) => { if (current() && captured.slide === context.current.slide) setInterimText(text); }, fail, message => { if (current()) setError(message); });
      segmenter.current = new ContinuousAudio({ ...context.current }, window => {
        queue.current!.enqueue(window);
        if (queue.current!.overloaded && wanted.current) {
          setError("This device is falling behind. Microphone paused while pending audio finishes; resume when ready.");
          void pause();
        }
      });
      const node = new AudioWorkletNode(audio, "local-microphone");
      capture.current = node;
      node.port.onmessage = event => {
        if (event.data === "stopped") { stopAck.current?.(); return; }
        if (event.data === "overflow") { fail("The page stopped keeping up with microphone capture. Unprocessed audio was discarded. Keep the tab active and retry."); return; }
        node.port.postMessage("ack");
        lastFrame.current = Date.now();
        if (current()) segmenter.current?.push(event.data as Float32Array);
      };
      node.onprocessorerror = () => fail("Microphone processing stopped. Retry to reconnect your microphone.");
      const source = audio.createMediaStreamSource(media);
      const silent = audio.createGain(); silent.gain.value = 0;
      source.connect(node); node.connect(silent); silent.connect(audio.destination);
      const interruption = () => {
        if (wanted.current) { setError("Microphone capture was interrupted. Keep this tab open and the device awake, then resume."); void pause(); }
      };
      media.getTracks().forEach(track => { track.onended = interruption; });
      audio.onstatechange = () => { if (audio.state !== "running") interruption(); };
      lastFrame.current = Date.now();
      watchdog.current = setInterval(() => { if (Date.now() - lastFrame.current > 5000) interruption(); }, 2000);
      setStatus("listening");
    } catch (error) {
      if (current()) fail(error instanceof Error ? error.message : "Cannot start local transcription. Check microphone permission and model download access.");
    }
  }, [pause, releaseMicrophone, destroyWorker]);

  const changeLanguage = useCallback((mode: RecognitionMode) => {
    context.current = { ...context.current, mode };
    segmenter.current?.switchContext({ ...context.current }); setInterimText("");
  }, []);
  const changeSlide = useCallback((slide: number) => {
    if (slide === context.current.slide) return;
    context.current = { ...context.current, slide };
    segmenter.current?.switchContext({ ...context.current }); setInterimText("");
  }, []);
  useEffect(() => { changeSlide(slideNumber); }, [slideNumber, changeSlide]);
  useEffect(() => {
    window.addEventListener("pagehide", dispose);
    return () => { window.removeEventListener("pagehide", dispose); dispose(); };
  }, [dispose]);
  return { status, interimText, errorMessage, modelMessage, isSupported, start, pause, changeLanguage, changeSlide, resume: start };
}
