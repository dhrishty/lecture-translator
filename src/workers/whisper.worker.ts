import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

import { hasRepetitionLoop } from "@/lib/whisper/quality";

// Cache downloaded public model assets only. No audio/text persistence.
env.allowLocalModels = false;
env.useBrowserCache = true;
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;
}
let recognizer: AutomaticSpeechRecognitionPipeline | null = null;
let backend = "wasm";
self.onmessage = async (event: MessageEvent) => {
  const { id, type, audio, mode } = event.data;
  try {
    if (type === "load") {
      const progress_callback = (progress: { status: string; progress?: number; file?: string }) => {
        self.postMessage({ type: "progress", message: progress.status === "progress" ? `Downloading ${progress.file ?? "model"}: ${Math.round(progress.progress ?? 0)}%` : "Preparing local Whisper…" });
      };
      if (!recognizer) {
        try {
          if (!("gpu" in navigator)) throw new Error("WebGPU unavailable");
          recognizer = await pipeline("automatic-speech-recognition", "onnx-community/whisper-base", {
            device: "webgpu", dtype: { encoder_model: "fp32", decoder_model_merged: "q4" }, progress_callback,
          });
          backend = "webgpu";
        } catch {
          self.postMessage({ type: "progress", message: "GPU unavailable. Loading local CPU fallback (may be slower)…" });
          recognizer = await pipeline("automatic-speech-recognition", "onnx-community/whisper-base", {
            device: "wasm", dtype: "q8", progress_callback,
          });
          backend = "wasm";
        }
      }
      self.postMessage({ id, backend });
    } else if (type === "transcribe") {
      if (!recognizer) throw new Error("Model not loaded");
      try {
        const output = await recognizer(audio, {
          language: mode === "en" ? "english" : "korean", task: "transcribe",
          return_timestamps: false,
          // Bound decoding by audio duration as well as Whisper's context limit.
          max_new_tokens: Math.min(440, Math.max(48, Math.ceil(audio.length / 16000 * 18) + 32)),
          repetition_penalty: 1.1,
        });
        const text = Array.isArray(output) ? output.map(item => item.text).join(" ") : output.text;
        if (hasRepetitionLoop(text)) {
          self.postMessage({ id, text: "", warning: "Whisper repeated itself, so an unreliable audio section was skipped. Check your notes for a gap. Move the microphone closer to the speaker if possible." });
        } else self.postMessage({ id, text });
      } finally { audio.fill(0); }
    }
  } catch {
    self.postMessage({ id, error: "Local Whisper could not process this request. Check model download access, available memory, and browser support." });
  }
};
