export const WHISPER_MODELS = {
  base: { id: "onnx-community/whisper-base_timestamped", revision: "608c49e61301901684bc36cac8f74b95ff6b5a8e" },
  small: { id: "onnx-community/whisper-small_timestamped", revision: "65caa70f294b46e1c33ff820aae6b16d048ab818" },
} as const;
export type WhisperSize = keyof typeof WHISPER_MODELS;
