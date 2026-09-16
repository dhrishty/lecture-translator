"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLectureSession } from "@/hooks/useLectureSession";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import { UploadScreen } from "./UploadScreen";
import { PDFViewer } from "./PDFViewer";
import { SlideNavigation } from "./SlideNavigation";
import { ManualNotes } from "./ManualNotes";
import { TranslationControls } from "./TranslationControls";
import { LiveTranslation } from "./LiveTranslation";
import { ModeToggle } from "./ModeToggle";
import { LectureReview } from "./LectureReview";
import type { RecognitionMode } from "@/types/lecture";
import { EndLectureDialog } from "./EndLectureDialog";
import { copyToClipboard, formatCurrentSlideForExport, formatLectureForExport } from "@/services/clipboardExportService";

type Controller = ReturnType<typeof useLectureSession>;
function ActiveLecture({ lecture, provider }: { lecture: Controller; provider: string }) {
  const { session } = lecture;
  const speech = useSpeechRecognition({ onParagraph: lecture.handleWhisperParagraph, slideNumber: session.currentSlide });
  const { changeSlide } = speech;
  const navigateSlide = useCallback((number: number) => {
    const next = Math.max(1, Math.min(number, session.totalSlides));
    changeSlide(next);
    lecture.goToSlide(next);
  }, [lecture, session.totalSlides, changeSlide]);
  const [language, setLanguage] = useState<RecognitionMode>("ko");
  const [reviewing, setReviewing] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [ending, setEnding] = useState(false);
  const [message, setMessage] = useState("");
  const timeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timeout.current) clearTimeout(timeout.current); }, []);
  useEffect(() => {
    const navigate = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (!session.pdfUrl || ending || reviewing || finishing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || target.closest("input, textarea, select, [contenteditable], dialog")) return;
      if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        event.preventDefault(); navigateSlide(session.currentSlide + (event.key === "ArrowLeft" ? -1 : 1));
      }
    };
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [ending, reviewing, finishing, navigateSlide, session.currentSlide, session.pdfUrl]);
  const copy = async (current = false) => {
    const snapshot = lecture.getSnapshot();
    const pending = snapshot.slides.some(s => s.transcriptSegments.some(t => t.translationStatus !== "done"));
    try {
      await copyToClipboard(current ? formatCurrentSlideForExport(snapshot.title, snapshot.slides[snapshot.currentSlide - 1]) : formatLectureForExport(snapshot.title, snapshot.slides, !!snapshot.pdfUrl));
      setMessage(pending ? "Copied to clipboard. Unfinished translations include Korean text; copy again when ready." : "Copied to clipboard");
    } catch { setMessage("Clipboard access failed. Allow clipboard access in your browser and try again."); }
    if (timeout.current) clearTimeout(timeout.current);
    timeout.current = setTimeout(() => setMessage(""), 6000);
  };
  const finish = async () => {
    setFinishing(true);
    await speech.pause();
    lecture.flushTranscriptBuffer();
    setFinishing(false);
    setReviewing(true);
    window.scrollTo({ top: 0 });
  };
  const dialog = ending && <EndLectureDialog onCopy={() => void copy()} onEnd={lecture.endLecture} onClose={() => setEnding(false)} message={message} />;
  if (reviewing) return <><LectureReview session={session} onManualEdit={lecture.updateManualNotes}
    onTranscriptEdit={lecture.updateTranscriptNotes} onRetry={lecture.retryTranslation}
    onBack={() => { setReviewing(false); window.scrollTo({ top: 0 }); }} onCopy={() => void copy()}
    onEnd={() => setEnding(true)} message={message} />{dialog}</>;
  const slide = session.slides[session.currentSlide - 1];
  const translationState = speech.status === "unsupported" ? "error" : speech.status;
  return <>
    <header className="workspace-header"><span className="wordmark">Lecture / <span>Workspace</span></span><button className="text-button" onClick={() => { void speech.pause(); setEnding(true); }}>End Lecture</button></header>
    <main className="workspace">
      <div className="lecture-heading"><p className="eyebrow">A LITTLE SPACE TO FOLLOW ALONG</p><h1>{session.title}</h1><p className="muted">Nothing is saved. Copy your notes before leaving.</p></div>
      {session.pdfUrl && <PDFViewer pdfUrl={session.pdfUrl} pageNumber={session.currentSlide} />}
      <div className="lecture-controls">{session.pdfUrl && <SlideNavigation currentSlide={session.currentSlide} totalSlides={session.totalSlides} onPrevious={() => navigateSlide(session.currentSlide - 1)} onNext={() => navigateSlide(session.currentSlide + 1)} />}
        <ModeToggle language={language} disabled={finishing || speech.status === "processing"} onChange={next => { speech.changeLanguage(next); setLanguage(next); }} />
        <TranslationControls language={language} translationState={translationState} onStart={speech.start} onPause={() => void speech.pause()} onResume={speech.resume} speechError={speech.errorMessage} isSupported={speech.isSupported} />
      </div>
      {session.currentSlide === session.totalSlides && <div className="finish-action"><button className="primary-button" disabled={finishing} onClick={() => void finish()}>{finishing ? "Finishing transcription…" : "Finish Lecture →"}</button><p className="muted">Review all your notes, slide by slide.</p></div>}
      <p className="provider-note" role="status">{speech.modelMessage}</p>
      <p className="provider-note">{language === "ko" ? provider : `${language === "ko-only" ? "Korean" : "English"} transcription · No translation requests`}</p>
      <ManualNotes key={`manual-${slide.slideNumber}`} value={slide.manualNotes} onChange={value => lecture.updateManualNotes(slide.slideNumber, value)} />
      <LiveTranslation segments={slide.transcriptSegments} language={language} interimText={[lecture.bufferedText, speech.interimText].filter(Boolean).join(" ")} onRetry={lecture.retryTranslation} onEdit={(id, text) => lecture.updateTranscriptNotes(slide.slideNumber, id, text)} />
      <footer className="copy-footer"><div><button className="primary-button" onClick={() => void copy()}>Copy Lecture</button>{session.pdfUrl && <button className="text-button" onClick={() => void copy(true)}>Copy Current Slide</button>}</div><p className="muted">Ready for Notion. Yours to keep only when you copy.</p><p role="status">{message}</p></footer>
    </main>
    {dialog}
  </>;
}
export default function LectureWorkspace() {
  const lecture = useLectureSession();
  const [provider, setProvider] = useState("Checking LibreTranslate…");
  useEffect(() => {
    const controller = new AbortController();
    const check = () => {
      fetch("/api/translate", { cache: "no-store", signal: controller.signal })
        .then(response => response.json())
        .then(data => setProvider(typeof data.message === "string" ? data.message : "LibreTranslate unavailable"))
        .catch(() => { if (!controller.signal.aborted) setProvider("LibreTranslate unavailable · English-only transcription is available"); });
    };
    check();
    window.addEventListener("focus", check);
    return () => { controller.abort(); window.removeEventListener("focus", check); };
  }, []);
  useBeforeUnload(lecture.hasActiveLecture || lecture.isLoadingPdf);
  return lecture.hasActiveLecture ? <ActiveLecture lecture={lecture} provider={provider} /> : <>
    <header className="workspace-header"><span className="wordmark">Lecture / <span>Korean → English</span></span><span className="session-badge">Session only</span></header>
    <UploadScreen onStartWithoutSlides={lecture.startWithoutSlides} onUpload={lecture.uploadPdf} isLoading={lecture.isLoadingPdf} error={lecture.uploadError} />
    <footer className="upload-footer"><p>{provider}</p><p>PDFs and notes stay in this tab. Microphone audio is transcribed locally with Whisper and is never uploaded or saved.<br />Only finalized Korean paragraphs in translation mode go to the configured LibreTranslate server. Both transcription-only modes skip translation. Public model files may be cached on this device.</p></footer>
  </>;
}
