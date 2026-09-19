import type { RecognitionMode } from "@/types/lecture";
const modes: Array<{ mode: RecognitionMode; icon: string; title: string }> = [
  { mode: "ko", icon: "한a", title: "Translate your lecture from Korean to English" },
  { mode: "ko-only", icon: "한", title: "Transcribe your Korean Lecture" },
  { mode: "en", icon: "ENG", title: "Transcribe your English Lecture" },
];
export function Dashboard({ onSelect }: { onSelect: (mode: RecognitionMode) => void }) {
  return <><header className="workspace-header"><div className="wordmark">HanYong <span>Dashboard</span></div></header>
    <main className="dashboard"><section className="dashboard-intro"><h1>Let’s get you started</h1><p>HanYong was mainly created to translate from Korean to English during lectures. But I found that adding a transcription tool could help with listening better during class.</p><p>HanYong doesn’t add AI-generated summaries or save your lecture recordings. Notes stay in this tab until you leave.</p><p className="privacy-detail">Chrome may send audio to its speech service. In translation mode, Korean text is sent to LibreTranslate. Copy your notes before closing this tab.</p></section>
      <nav className="mode-cards" aria-label="Choose your lecture mode">{modes.map(({mode, icon, title}) => <button className="mode-card" key={mode} onClick={() => onSelect(mode)}><span className={`mode-icon ${mode === "en" ? "english-icon" : ""}`} aria-hidden="true">{icon}</span><span>{title}</span><span className="card-arrow" aria-hidden="true">→</span></button>)}</nav>
    </main></>;
}
