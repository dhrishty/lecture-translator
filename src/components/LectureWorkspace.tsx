"use client";
import { useEffect, useRef, useState } from "react";
import { useLectureSession } from "@/hooks/useLectureSession";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import { UploadScreen } from "./UploadScreen";
import { Dashboard } from "./Dashboard";
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
function ActiveLecture({ lecture, provider, initialMode, onEnd }: { lecture: Controller; provider: string; initialMode: RecognitionMode; onEnd: () => void }) {
  const { session } = lecture;
  const speech = useSpeechRecognition({ onFinalResult: lecture.handleFinalSpeech, onStopped: lecture.flushTranscriptBuffer, onActivity: lecture.handleSpeechActivity });
  const [language, setLanguage] = useState<RecognitionMode>(initialMode);
  const [prepared, setPrepared] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
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
        event.preventDefault(); lecture.goToSlide(session.currentSlide + (event.key === "ArrowLeft" ? -1 : 1));
      }
    };
    window.addEventListener("keydown", navigate);
    return () => window.removeEventListener("keydown", navigate);
  }, [ending, reviewing, finishing, lecture, session.currentSlide, session.pdfUrl]);
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
  const dialog = ending && <EndLectureDialog onCopy={() => void copy()} onEnd={onEnd} onClose={() => setEnding(false)} message={message} />;
  if (reviewing) return <><LectureReview session={session} onManualEdit={lecture.updateManualNotes}
    onTranscriptEdit={lecture.updateTranscriptNotes} onRetry={lecture.retryTranslation}
    onBack={() => { setReviewing(false); window.scrollTo({ top: 0 }); }} onCopy={() => void copy()}
    onEnd={() => setEnding(true)} message={message} />{dialog}</>;
  const slide = session.slides[session.currentSlide - 1];
  const translationState = speech.status === "denied" || speech.status === "unsupported" ? "error" : speech.status;
  const ready = prepared || !!session.pdfUrl;
  const statusLabel = speech.status === "listening" ? "Listening…" : speech.status === "reconnecting" ? "Reconnecting…" : speech.status === "paused" ? "Paused" : speech.status === "idle" ? "Ready when you are" : "Microphone unavailable";
  const start = () => { setPrepared(true); speech.changeLanguage(language); speech.start(); };
  return <>
    <header className="workspace-header"><div className="brand-status"><span className="wordmark">HanYong</span><span className={`speech-status ${speech.status}`} role="status"><i />{statusLabel}</span></div><div className="header-actions"><button className="secondary-button" onClick={() => void copy()}>Copy Lecture</button><button className="danger-button" disabled={finishing || lecture.isLoadingPdf} onClick={() => void finish()}>{finishing ? "Finishing…" : "End Lecture"}</button></div></header>
    <main className={`workspace lecture-grid ${ready && !session.pdfUrl ? "without-slides" : ""}`}>
      <div className="lecture-main">
        {session.pdfUrl ? <><p className="pdf-title">{session.title}</p><PDFViewer pdfUrl={session.pdfUrl} pageNumber={session.currentSlide} /></> : !ready && <UploadScreen onStartWithoutSlides={() => setPrepared(true)} onUpload={file => void lecture.uploadPdf(file)} isLoading={lecture.isLoadingPdf} error={lecture.uploadError} inputRef={inputRef} />}
        <div className="lecture-controls">
          {session.pdfUrl && <SlideNavigation currentSlide={session.currentSlide} totalSlides={session.totalSlides} onPrevious={() => lecture.goToSlide(session.currentSlide - 1)} onNext={() => lecture.goToSlide(session.currentSlide + 1)} />}
          <div className="control-row"><TranslationControls translationState={translationState} onStart={start} onPause={() => void speech.pause()} onResume={start} speechError={speech.errorMessage} isSupported={speech.isSupported} disabled={finishing || lecture.isLoadingPdf} />
          {session.pdfUrl && <button className="text-button" onClick={() => void copy(true)}>Copy Current Slide</button>}</div>
          <ModeToggle language={language} disabled={finishing} onChange={next => { speech.changeLanguage(next); setLanguage(next); }} />
        </div>
        <LiveTranslation segments={slide.transcriptSegments} language={language} interimText={[lecture.bufferedText, speech.interimText].filter(Boolean).join(" ")} onRetry={lecture.retryTranslation} onEdit={(id, text) => lecture.updateTranscriptNotes(slide.slideNumber, id, text)} />
        {language === "ko" && <p className="provider-note">{provider}</p>}
        <p role="status" className="copy-message">{message}</p>
      </div>
      <aside className="manual-column"><ManualNotes key={`manual-${slide.slideNumber}`} value={slide.manualNotes} onChange={value => lecture.updateManualNotes(slide.slideNumber, value)} /></aside>
    </main>
    {dialog}
  </>;
}
export default function LectureWorkspace() {
  const lecture = useLectureSession();
  const [mode, setMode] = useState<RecognitionMode>("ko");
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
  return lecture.hasActiveLecture ? <ActiveLecture lecture={lecture} provider={provider} initialMode={mode} onEnd={lecture.endLecture} /> : <Dashboard onSelect={next => { setMode(next); lecture.startWithoutSlides(); }} />;
}
