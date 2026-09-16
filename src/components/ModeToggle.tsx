import type { RecognitionMode } from "@/types/lecture";
export function ModeToggle({ language, onChange, disabled }: { language: RecognitionMode; onChange: (language: RecognitionMode) => void; disabled?: boolean }) {
  return <label className="mode-toggle"><span aria-hidden="true">⇄</span><select aria-label="Transcription mode" value={language} disabled={disabled} onChange={event => onChange(event.target.value as RecognitionMode)}>
    <option value="ko">한국어 → English · Translate</option>
    <option value="ko-only">한국어 · Transcribe only</option>
    <option value="en">English · Transcribe only</option>
  </select></label>;
}
