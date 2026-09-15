import type { TranscriptSegment, SourceLanguage } from "@/types/lecture";
import { NotesEditor } from "./NotesEditor";
export function LiveTranslation({ segments, interimText = "", onRetry, onEdit, language = "ko" }: {
  segments: TranscriptSegment[]; interimText?: string; onRetry: (id: string) => void;
  onEdit: (id: string, text: string) => void; language?: SourceLanguage;
}) {
  const korean = segments.filter(s => s.sourceLanguage === "ko");
  return <section className="document-section">
    <div className="section-heading"><h2>Transcribed Notes</h2><span>{language === "ko" ? "Korean → English" : "English only"}</span></div>
    <div className="translation-text">
      {!segments.length && <p className="placeholder">{language === "ko" ? "English translations" : "English transcripts"} will appear here as your professor speaks. You can edit and format them.</p>}
      {segments.map((segment, index) => <div className="transcript-segment" key={segment.id}>
        {segment.translationStatus === "done" || segment.editedText !== undefined ?
          <NotesEditor label={`Transcribed Notes ${index + 1}`} value={segment.editedText ?? segment.translatedEnglish} onChange={text => onEdit(segment.id, text)} /> :
          <div className="pending-text"><p lang={segment.sourceLanguage}>{segment.originalText}</p><small role="status">{segment.translationStatus === "failed" ? "Translation failed; original text is kept." : "Translating…"}</small></div>}
        {segment.translationStatus === "failed" && <p className="error">{segment.translationError ?? "Translation unavailable."} <button className="text-button" onClick={() => onRetry(segment.id)}>Retry Translation</button></p>}
      </div>)}
    </div>
    {interimText && <p className="interim" lang={language}>{interimText} <small>· Building paragraph — waiting for 3 seconds of silence</small></p>}
    {korean.length > 0 && <details><summary>Original Korean</summary><div lang="ko" className="korean-text">{korean.map(s => <p key={s.id}>{s.originalText}</p>)}</div></details>}
  </section>;
}
