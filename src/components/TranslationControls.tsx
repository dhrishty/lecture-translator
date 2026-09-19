export function TranslationControls({ translationState, onStart, onPause, onResume, speechError, isSupported, disabled }: {
  translationState: "idle" | "listening" | "paused" | "reconnecting" | "error";
  onStart: () => void; onPause: () => void; onResume: () => void;
  speechError: string | null; isSupported: boolean; disabled?: boolean;
}) {
  if (!isSupported) return <p className="error">Microphone transcription requires Google Chrome.</p>;
  const listening = translationState === "listening" || translationState === "reconnecting";
  return <div className="speech-controls"><button className="primary-button" disabled={disabled} onClick={listening ? onPause : translationState === "paused" ? onResume : onStart}>{listening ? "Pause Lecture" : translationState === "paused" ? "Resume Lecture" : translationState === "error" ? "Retry Microphone" : "Start Lecture"}</button>{speechError && <p className="error" role="alert">{speechError}</p>}</div>;
}
