interface SlideNavigationProps {
  currentSlide: number;
  totalSlides: number;
  onPrevious: () => void;
  onNext: () => void;
}

export function SlideNavigation({
  currentSlide,
  totalSlides,
  onPrevious,
  onNext,
}: SlideNavigationProps) {
  const padded = String(currentSlide).padStart(2, "0");
  const totalPadded = String(totalSlides).padStart(2, "0");

  return (
    <div className="flex items-center justify-center gap-6">
      <button
        type="button"
        onClick={onPrevious}
        disabled={currentSlide <= 1}
        className="flex items-center justify-center w-10 h-10 rounded-lg border border-border text-muted hover:text-foreground hover:bg-surface-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Previous slide"
      >
        ←
      </button>

      <span className="text-sm font-medium text-foreground tabular-nums min-w-[5rem] text-center">
        {padded} / {totalPadded}
      </span>

      <button
        type="button"
        onClick={onNext}
        disabled={currentSlide >= totalSlides}
        className="flex items-center justify-center w-10 h-10 rounded-lg border border-border text-muted hover:text-foreground hover:bg-surface-hover transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        aria-label="Next slide"
      >
        →
      </button>
    </div>
  );
}
