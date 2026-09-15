interface TranslationControlsProps {
  translationState: "idle" | "listening" | "paused" | "error";
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  speechError: string | null;
  isSupported: boolean;
  language?: "ko" | "en";
}

export function TranslationControls({
  translationState,
  onStart,
  onPause,
  onResume,
  speechError,
  isSupported,
  language = "ko",
}: TranslationControlsProps) {
  if (!isSupported) {
    return (
      <p className="text-sm text-red-400 text-center">
        Web Speech API is not supported. Please use Google Chrome.
      </p>
    );
  }

  if (translationState === "idle") {
    return (
      <button
        type="button"
        onClick={onStart}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface-raised px-5 py-2.5 text-sm font-medium text-foreground hover:bg-surface-hover transition-colors"
      >
        {language === "ko" ? "Start Live Translation" : "Start English Transcription"}
      </button>
    );
  }

  if (translationState === "listening") {
    return (
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-2 text-sm text-foreground">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500 animate-pulse" aria-hidden />
            Listening
          </span>
          <button
            type="button"
            onClick={onPause}
            className="rounded-lg border border-border px-4 py-2 text-sm text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
          >
            Pause
          </button>
        </div>
      </div>
    );
  }

  if (translationState === "paused") {
    return (
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted">Paused</span>
        <button
          type="button"
          onClick={onResume}
          className="rounded-lg border border-border bg-surface-raised px-4 py-2 text-sm font-medium text-foreground hover:bg-surface-hover transition-colors"
        >
          Resume
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-2">
      {speechError && (
        <p className="text-sm text-red-400">{speechError}</p>
      )}
      <button
        type="button"
        onClick={onStart}
        className="rounded-lg border border-border px-4 py-2 text-sm text-foreground hover:bg-surface-hover transition-colors"
      >
        Retry
      </button>
    </div>
  );
}
