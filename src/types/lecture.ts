export type RecognitionMode = "ko" | "ko-only" | "en";

export type SourceLanguage = "ko" | "en";

export type TranslationStatus = "pending" | "translating" | "done" | "failed";

export interface TranscriptSegment {
  id: string;
  sequenceNumber: number;
  slideNumber: number;
  originalText: string;
  sourceLanguage: SourceLanguage;
  editedText?: string;
  transcribeOnly?: boolean;
  translationError?: string;
  translatedEnglish: string;
  timestamp: number;
  translationStatus: TranslationStatus;
}

export interface SlideData {
  slideNumber: number;
  manualNotes: string;
  transcriptSegments: TranscriptSegment[];
}

export type TranslationState = "idle" | "listening" | "paused" | "error";

export interface LectureSession {
  title: string;
  pdfFile: File | null;
  pdfUrl: string | null;
  currentSlide: number;
  totalSlides: number;
  slides: SlideData[];
  translationState: TranslationState;
}

export function createEmptySlides(totalSlides: number): SlideData[] {
  return Array.from({ length: totalSlides }, (_, i) => ({
    slideNumber: i + 1,
    manualNotes: "",
    transcriptSegments: [],
  }));
}

export function createInitialSession(): LectureSession {
  return {
    title: "",
    pdfFile: null,
    pdfUrl: null,
    currentSlide: 1,
    totalSlides: 0,
    slides: [],
    translationState: "idle",
  };
}
