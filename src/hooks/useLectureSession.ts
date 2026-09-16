"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import { pdfOptions } from "@/lib/pdfOptions";
import { createEmptySlides, createInitialSession, type TranscriptSegment, type RecognitionMode } from "@/types/lecture";
import { translationProvider } from "@/services/translation";
import { addFinalizedPhrase, createTranscriptBuffer, flushBuffer, resetBuffer, noteSpeechActivity } from "@/lib/transcriptBuffer";

pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();

export function useLectureSession() {
  const [session, setSession] = useState(createInitialSession);
  const [bufferedText, setBufferedText] = useState("");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const state = useRef(createInitialSession());
  const buffer = useRef(createTranscriptBuffer());
  const sequence = useRef(0);
  const requests = useRef(new Map<string, AbortController>());
  const generation = useRef(0);
  const loading = useRef(false);
  const update = useCallback((fn: (s: typeof state.current) => typeof state.current) => {
    state.current = fn(state.current);
    setSession(state.current);
  }, []);

  const translateSegment = useCallback(async (segment: TranscriptSegment) => {
    if (segment.transcribeOnly || segment.sourceLanguage === "en" || requests.current.has(segment.id)) return;
    const controller = new AbortController();
    requests.current.set(segment.id, controller);
    const epoch = generation.current;
    const patch = (changes: Partial<TranscriptSegment>) => {
      if (epoch !== generation.current) return;
      update(s => ({ ...s, slides: s.slides.map(slide => slide.slideNumber !== segment.slideNumber ? slide : {
        ...slide, transcriptSegments: slide.transcriptSegments.map(item => item.id === segment.id ? { ...item, ...changes } : item),
      }) }));
    };
    patch({ translationStatus: "translating", translationError: undefined });
    try {
      const translatedEnglish = await translationProvider.translateText(segment.originalText, controller.signal);
      patch({ translatedEnglish, translationStatus: "done" });
    } catch (error) {
      patch({ translationStatus: "failed", translationError: error instanceof Error ? error.message : "Translation unavailable" });
    } finally {
      requests.current.delete(segment.id);
    }
  }, [update]);

  const commitChunk = useCallback((originalText: string, slideNumber: number, mode: RecognitionMode) => {
    if (!state.current.totalSlides) return;
    setBufferedText("");
    const sourceLanguage = mode === "en" ? "en" : "ko";
    const transcribeOnly = mode !== "ko";
    const segment: TranscriptSegment = {
      id: crypto.randomUUID(), sequenceNumber: ++sequence.current, slideNumber,
      originalText, sourceLanguage, transcribeOnly, translatedEnglish: transcribeOnly ? originalText : "", timestamp: Date.now(), translationStatus: transcribeOnly ? "done" : "pending",
    };
    update(s => ({ ...s, slides: s.slides.map(slide => slide.slideNumber === slideNumber ? {
      ...slide, transcriptSegments: [...slide.transcriptSegments, segment],
    } : slide) }));
    if (!transcribeOnly) void translateSegment(segment);
  }, [translateSegment, update]);
  const flushTranscriptBuffer = useCallback(() => flushBuffer(buffer.current, commitChunk), [commitChunk]);
  const handleFinalSpeech = useCallback((text: string, mode: RecognitionMode) => {
    if (state.current.totalSlides) {
      addFinalizedPhrase(buffer.current, text, state.current.currentSlide, commitChunk, mode);
      setBufferedText(buffer.current.phrases.map(phrase => phrase.text).join(" "));
    }
  }, [commitChunk]);

  const handleSpeechActivity = useCallback(() => noteSpeechActivity(buffer.current, commitChunk), [commitChunk]);
  const startWithoutSlides = useCallback(() => {
    if (loading.current || state.current.totalSlides) return;
    setUploadError(null);
    update(() => ({ ...createInitialSession(), title: "Lecture notes", totalSlides: 1, slides: createEmptySlides(1) }));
  }, [update]);

  const uploadPdf = useCallback(async (file: File) => {
    if (loading.current) return;
    setUploadError(null);
    if (!file.name.toLowerCase().endsWith(".pdf") || (file.type && file.type !== "application/pdf")) {
      setUploadError("Please upload a PDF file."); return;
    }
    if (file.size > 100 * 1024 * 1024) { setUploadError("Please use a PDF smaller than 100 MB."); return; }
    loading.current = true;
    setIsLoadingPdf(true);
    const epoch = generation.current;
    let task: pdfjs.PDFDocumentLoadingTask | undefined;
    try {
      task = pdfjs.getDocument({ ...pdfOptions, data: await file.arrayBuffer() });
      const pdf = await task.promise;
      if (!pdf.numPages) throw new Error("Empty PDF");
      if (epoch !== generation.current) return;
      update(() => ({ ...createInitialSession(), title: file.name.replace(/\.pdf$/i, ""), pdfFile: file,
        pdfUrl: URL.createObjectURL(file), totalSlides: pdf.numPages, slides: createEmptySlides(pdf.numPages) }));
    } catch {
      setUploadError("Cannot open this PDF. It may be damaged or password protected.");
    } finally {
      await task?.destroy();
      loading.current = false;
      setIsLoadingPdf(false);
    }
  }, [update]);

  const goToSlide = useCallback((number: number) => {
    const next = Math.max(1, Math.min(number, state.current.totalSlides));
    if (next === state.current.currentSlide) return;
    flushTranscriptBuffer();
    update(s => ({ ...s, currentSlide: next }));
  }, [flushTranscriptBuffer, update]);
  const updateManualNotes = useCallback((number: number, manualNotes: string) => {
    update(s => ({ ...s, slides: s.slides.map(slide => slide.slideNumber === number ? { ...slide, manualNotes } : slide) }));
  }, [update]);
  const updateTranscriptNotes = useCallback((slideNumber: number, id: string, editedText: string) => {
    update(s => ({ ...s, slides: s.slides.map(slide => slide.slideNumber !== slideNumber ? slide : {
      ...slide, transcriptSegments: slide.transcriptSegments.map(segment => segment.id === id ? { ...segment, editedText } : segment),
    }) }));
  }, [update]);
  const retryTranslation = useCallback((id: string) => {
    const segment = state.current.slides.flatMap(s => s.transcriptSegments).find(s => s.id === id);
    if (segment?.translationStatus === "failed") void translateSegment(segment);
  }, [translateSegment]);
  const clear = useCallback(() => {
    generation.current++;
    resetBuffer(buffer.current);
    requests.current.forEach(c => c.abort());
    requests.current.clear();
    if (state.current.pdfUrl) URL.revokeObjectURL(state.current.pdfUrl);
    state.current = createInitialSession();
    sequence.current = 0;
  }, []);
  useEffect(() => clear, [clear]);
  const endLecture = useCallback(() => { clear(); setSession(state.current); setUploadError(null); setBufferedText(""); }, [clear]);
  useEffect(() => {
    window.addEventListener("pagehide", endLecture);
    return () => window.removeEventListener("pagehide", endLecture);
  }, [endLecture]);
  const getSnapshot = useCallback(() => { flushTranscriptBuffer(); return state.current; }, [flushTranscriptBuffer]);

  return { handleWhisperParagraph: commitChunk, session, bufferedText, uploadError, isLoadingPdf, uploadPdf, startWithoutSlides, handleSpeechActivity, goToSlide, updateManualNotes, updateTranscriptNotes, handleFinalSpeech,
    flushTranscriptBuffer, retryTranslation, endLecture, getSnapshot, hasActiveLecture: session.totalSlides > 0 };
}
