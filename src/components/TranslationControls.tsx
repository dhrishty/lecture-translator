import type { SpeechStatus } from "@/hooks/useSpeechRecognition";
interface TranslationControlsProps {
  translationState: SpeechStatus;
  onStart: () => void; onPause: () => void; onResume: () => void;
  speechError: string | null; isSupported: boolean;
  language?: "ko" | "ko-only" | "en";
}
export function TranslationControls({ translationState: state, onStart, onPause, onResume, speechError, isSupported, language = "ko" }: TranslationControlsProps) {
  if (!isSupported) return <p role="alert">Local transcription requires HTTPS, microphone access, AudioWorklet and WebAssembly. Try an updated desktop browser.</p>;
  return <div className="flex flex-col items-center gap-2">
    {speechError && <p role="alert" className="error">{speechError}</p>}
    {state === "loading" ? <><span role="status">Loading local speech model…</span><button className="text-button" onClick={onPause}>Cancel</button></> :
    state === "processing" ? <span role="status">Microphone off · Finishing local transcription…</span> :
    state === "listening" ? <><span role="status">● Listening locally</span><button className="text-button" onClick={onPause}>Pause</button></> :
    <button className="primary-button" onClick={state === "paused" ? onResume : onStart}>
      {state === "paused" ? "Resume" : state === "error" ? "Retry local transcription" : language === "ko" ? "Start Korean → English" : language === "ko-only" ? "Start Korean transcription" : "Start English transcription"}
    </button>}
  </div>;
}
