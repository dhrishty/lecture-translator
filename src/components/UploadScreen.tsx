"use client";

import { useRef } from "react";
import { PrivacyBanner } from "./PrivacyBanner";

interface UploadScreenProps {
  onUpload: (file: File) => void;
  onStartWithoutSlides: () => void;
  isLoading: boolean;
  error: string | null;
}

export function UploadScreen({ onUpload, onStartWithoutSlides, isLoading, error }: UploadScreenProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (file: File | undefined) => {
    if (file) onUpload(file);
  };

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg text-center space-y-8">
        <div className="space-y-3">
          <h1 className="text-4xl font-semibold tracking-tight text-foreground">
            Follow the lecture.
          </h1>
          <p className="text-muted text-base leading-relaxed">
            Your slides, your notes, and Korean → English translation. One quiet space for the class in front of you.
          </p>
        </div>

        <PrivacyBanner />

        <div className="space-y-4">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => inputRef.current?.click()}
            className="inline-flex items-center justify-center rounded-lg bg-surface-raised border border-border px-6 py-3 text-sm font-medium text-foreground hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Loading PDF…" : "Upload lecture PDF"}
          </button>

          <div><button type="button" className="text-button" disabled={isLoading} onClick={onStartWithoutSlides}>Start without slides</button></div>

          <input
            ref={inputRef}
            type="file"
            accept="application/pdf,.pdf"
            aria-label="Upload lecture PDF"
            className="hidden"
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />

          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
        </div>

        <p className="text-xs text-muted/70">
          Optimized for Chrome · Korean → English · No account required
        </p>
      </div>
    </div>
  );
}
