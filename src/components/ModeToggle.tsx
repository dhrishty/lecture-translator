import type { SourceLanguage } from "@/types/lecture";
export function ModeToggle({ language, onChange, disabled }: { language: SourceLanguage; onChange: (language: SourceLanguage) => void; disabled?: boolean }) {
  const english = language === "en";
  return <button type="button" className="mode-toggle" aria-label="English-only transcription" aria-pressed={english} disabled={disabled}
    title={english ? "Switch to Korean → English translation" : "Switch to English-only transcription"}
    onClick={() => onChange(english ? "ko" : "en")}>
    {english ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="9" y="3" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></svg> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M2 5h12M8 2v3M4 5c1 6 5 9 9 10M12 5c-1 6-5 9-9 10M13 22l4-11 5 11M15 18h5"/></svg>}
    <span>{english ? "English · Transcribe only" : "한국어 → English · Translate"}</span><span aria-hidden="true">⇄</span>
  </button>;
}
