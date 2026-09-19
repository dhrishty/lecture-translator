import type { TranscriptSegment, RecognitionMode } from "@/types/lecture";
import { NotesEditor } from "./NotesEditor";
export function LiveTranslation({ segments, interimText = "", onRetry, onEdit, language = "ko" }: {
  segments: TranscriptSegment[]; interimText?: string; onRetry: (id: string) => void;
  onEdit: (id: string, text: string) => void; language?: RecognitionMode;
}) {
  return <section className="document-section">
    <div className="section-heading"><h2>Transcription</h2><span>{language === "ko" ? "Korean → English" : language === "ko-only" ? "Korean only" : "English only"}</span></div>
    <div className="translation-text">
      {!segments.length && <p className="placeholder">Paragraphs appear after 3 seconds without speech updates.</p>}
      {segments.map((segment, index) => {
        const bilingual = segment.sourceLanguage === "ko" && !segment.transcribeOnly;
        return <div className="transcript-segment" key={segment.id}>
          {bilingual && <p lang="ko" className="korean-text">{segment.originalText}</p>}
          {segment.translationStatus === "done" || segment.editedText !== undefined ?
            <div lang={bilingual ? "en" : segment.sourceLanguage}><NotesEditor label={`${bilingual ? "English translation" : "Transcribed Notes"} ${index + 1}`} value={segment.editedText ?? segment.translatedEnglish} onChange={text => onEdit(segment.id, text)} /></div> :
            <small role="status">{segment.translationStatus === "failed" ? "Translation failed; original text is kept." : "Translating paragraph…"}</small>}
          {segment.translationStatus === "failed" && <p className="error">{segment.translationError ?? "Translation unavailable."} <button className="text-button" onClick={() => onRetry(segment.id)}>Retry Translation</button></p>}
        </div>;
      })}
    </div>
    {interimText && <p className="interim" lang={language === "en" ? "en" : "ko"}>{interimText} <small>· Building paragraph — waiting for 3 seconds without speech updates</small></p>}
  </section>;
}
