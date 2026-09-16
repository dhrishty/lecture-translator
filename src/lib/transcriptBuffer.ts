const FLUSH_PAUSE_MS = 3000;

export interface BufferedPhrase {
  text: string;
  slideNumber: number;
  timestamp: number;
}

export interface TranscriptBuffer {
  phrases: BufferedPhrase[];
  slideNumber: number;
  sourceLanguage: "ko" | "ko-only" | "en";
  flushTimer: ReturnType<typeof setTimeout> | null;
}

export function createTranscriptBuffer(): TranscriptBuffer {
  return { phrases: [], slideNumber: 0, sourceLanguage: "ko", flushTimer: null };
}

export function clearFlushTimer(buffer: TranscriptBuffer): void {
  if (buffer.flushTimer) {
    clearTimeout(buffer.flushTimer);
    buffer.flushTimer = null;
  }
}

export function resetBuffer(buffer: TranscriptBuffer): void {
  clearFlushTimer(buffer);
  buffer.phrases = [];
  buffer.slideNumber = 0;
}

export function addFinalizedPhrase(
  buffer: TranscriptBuffer,
  text: string,
  slideNumber: number,
  onFlush: (text: string, slideNumber: number, sourceLanguage: "ko" | "ko-only" | "en") => void,
  sourceLanguage: "ko" | "ko-only" | "en" = "ko",
): void {
  const trimmed = text.trim();
  if (!trimmed) return;

  if (buffer.phrases.length > 0 && (buffer.slideNumber !== slideNumber || buffer.sourceLanguage !== sourceLanguage)) {
    flushBuffer(buffer, onFlush);
  }

  if (buffer.phrases.length === 0) {
    buffer.slideNumber = slideNumber;
    buffer.sourceLanguage = sourceLanguage;
  }

  buffer.phrases.push({
    text: trimmed,
    slideNumber,
    timestamp: Date.now(),
  });

  noteSpeechActivity(buffer, onFlush);
}

// Interim results count as continued speech, not as a finished paragraph.
export function noteSpeechActivity(
  buffer: TranscriptBuffer,
  onFlush: (text: string, slideNumber: number, sourceLanguage: "ko" | "ko-only" | "en") => void,
): void {
  clearFlushTimer(buffer);
  if (!buffer.phrases.length) return;
  buffer.flushTimer = setTimeout(() => flushBuffer(buffer, onFlush), FLUSH_PAUSE_MS);
}

export function flushBuffer(
  buffer: TranscriptBuffer,
  onFlush: (text: string, slideNumber: number, sourceLanguage: "ko" | "ko-only" | "en") => void,
): void {
  clearFlushTimer(buffer);
  if (buffer.phrases.length === 0) return;

  const slideNumber = buffer.slideNumber;
  const koreanText = buffer.phrases.map((p) => p.text).join(" ");
  buffer.phrases = [];
  buffer.slideNumber = 0;

  onFlush(koreanText, slideNumber, buffer.sourceLanguage);
}
