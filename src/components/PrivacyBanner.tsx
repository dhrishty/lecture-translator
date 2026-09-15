interface PrivacyBannerProps {
  variant?: "default" | "compact";
}

export function PrivacyBanner({ variant = "default" }: PrivacyBannerProps) {
  if (variant === "compact") {
    return (
      <p className="text-sm text-muted">
        Nothing is saved. Copy your notes before leaving.
      </p>
    );
  }

  return (
    <p className="text-sm text-muted max-w-md mx-auto">
      Nothing is saved. Your PDF, notes, and transcript disappear when you leave.
    </p>
  );
}
