import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import { hasRepetitionLoop } from "@/lib/whisper/quality";
import { WHISPER_MODELS, type WhisperSize } from "@/lib/whisper/models";
env.allowLocalModels = false;
env.useBrowserCache = true;
if (env.backends.onnx.wasm) { env.backends.onnx.wasm.numThreads = 1; env.backends.onnx.wasm.proxy = false; }
let recognizer: AutomaticSpeechRecognitionPipeline | null = null;
let backend = "wasm";
let size: WhisperSize = "base";
let busy = false;
self.onmessage = async (event: MessageEvent) => {
  const { id, type, audio, mode, comparison = false, legacy = false } = event.data;
  if (busy) { if (audio) audio.fill(0); self.postMessage({ id, error: "Whisper is already processing a request." }); return; }
  busy = true;
  try {
    if (type === "load") {
      const selected: WhisperSize = event.data.model === "small" ? "small" : "base";
      const requestedBackend = event.data.backend ?? "auto";
      if (recognizer && (selected !== size || (requestedBackend !== "auto" && requestedBackend !== backend))) {
        await recognizer.dispose(); recognizer = null;
      }
      size = selected;
      const model = WHISPER_MODELS[size];
      const progress_callback = (progress: { status: string; progress?: number; file?: string }) => {
        self.postMessage({ type: "progress", message: progress.status === "progress" ? `Downloading ${progress.file ?? "model"}: ${Math.round(progress.progress ?? 0)}%` : "Preparing local Whisper…" });
      };
      if (!recognizer) {
        try {
          if (requestedBackend === "wasm" || !("gpu" in navigator)) throw new Error("Use WASM");
          recognizer = await pipeline("automatic-speech-recognition", model.id, {
            revision: model.revision, device: "webgpu", dtype: { encoder_model: "fp32", decoder_model_merged: "q4" }, progress_callback,
          }); backend = "webgpu";
        } catch {
          if (requestedBackend === "webgpu") throw new Error("WebGPU initialization failed. Select WASM for both comparison runs.");
          self.postMessage({ type: "progress", message: "Loading local CPU fallback (may be slower)…" });
          recognizer = await pipeline("automatic-speech-recognition", model.id, {
            revision: model.revision, device: "wasm", dtype: "q8", progress_callback,
          }); backend = "wasm";
        }
      }
      self.postMessage({ id, backend, model: model.id, revision: model.revision, precision: backend === "webgpu" ? "encoder fp32 / decoder q4" : "q8" });
    } else if (type === "transcribe") {
      if (!recognizer) throw new Error("Model not loaded");
      const started = performance.now();
      const output = await recognizer(audio, {
        language: mode === "en" ? "english" : "korean", task: "transcribe",
        return_timestamps: legacy ? false : "word",
        max_new_tokens: Math.min(440, Math.max(48, Math.ceil(audio.length / 16000 * 18) + 32)),
        repetition_penalty: 1.1,
      });
      const data = Array.isArray(output) ? output[0] : output;
      const rejected = hasRepetitionLoop(data.text);
      self.postMessage({ id, text: rejected && !comparison ? "" : data.text, chunks: data.chunks,
        rejected: rejected && !comparison, flagged: rejected,
        processingMs: performance.now() - started,
        warning: rejected ? "Whisper repeated itself. Review this audio section for a gap or unreliable wording." : undefined });
    }
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : "Local Whisper failed." });
  } finally { if (audio?.byteLength) audio.fill(0); busy = false; }
};
