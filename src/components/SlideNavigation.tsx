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
    <div className="slide-navigation">
      <button
        type="button"
        onClick={onPrevious}
        disabled={currentSlide <= 1}
        className="slide-arrow"
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
        className="slide-arrow"
        aria-label="Next slide"
      >
        →
      </button>
    </div>
  );
}
