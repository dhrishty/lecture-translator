import type { LectureSession } from "@/types/lecture";
import { ManualNotes } from "./ManualNotes";
import { LiveTranslation } from "./LiveTranslation";
export function LectureReview({ session, onManualEdit, onTranscriptEdit, onRetry, onBack, onCopy, onEnd, message }: {
  session: LectureSession;
  onManualEdit: (slide: number, text: string) => void;
  onTranscriptEdit: (slide: number, id: string, text: string) => void;
  onRetry: (id: string) => void;
  onBack: () => void; onCopy: () => void; onEnd: () => void; message: string;
}) {
  const pending = session.slides.flatMap(s => s.transcriptSegments).filter(s => s.translationStatus === "translating" || s.translationStatus === "pending").length;
  return <>
    <header className="workspace-header"><span className="wordmark">Lecture / <span>Review</span></span><button className="text-button" onClick={onBack}>Back to lecture</button></header>
    <main className="workspace review-workspace">
      <div className="lecture-heading"><p className="eyebrow">YOUR WHOLE LECTURE</p><h1>{session.title}</h1><p className="muted">Listening has stopped. Review, edit, and copy your notes before leaving.</p></div>
      <div className="review-actions"><button className="primary-button" onClick={onCopy}>Copy Lecture</button><button className="text-button" onClick={onEnd}>End Lecture</button></div>
      <p role="status" className="copy-message">{message}</p>
      {pending > 0 && <p role="status" className="provider-note">Finishing {pending} translation{pending === 1 ? "" : "s"}… Korean text is already included if you copy now.</p>}
      {session.slides.map(slide => <section className="review-slide" key={slide.slideNumber} aria-labelledby={`review-slide-${slide.slideNumber}`}>
        <h2 id={`review-slide-${slide.slideNumber}`}>{session.pdfUrl ? `Slide ${slide.slideNumber}` : "Lecture notes"}</h2>
        <ManualNotes value={slide.manualNotes} onChange={text => onManualEdit(slide.slideNumber, text)} />
        <LiveTranslation segments={slide.transcriptSegments} language={slide.transcriptSegments.some(s => s.sourceLanguage === "ko") ? "ko" : "en"}
          onRetry={onRetry} onEdit={(id, text) => onTranscriptEdit(slide.slideNumber, id, text)} />
      </section>)}
      <footer className="copy-footer"><button className="primary-button" onClick={onCopy}>Copy Lecture</button><p className="muted">Nothing is saved. Your notes disappear when you leave.</p></footer>
    </main>
  </>;
}
