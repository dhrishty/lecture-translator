import type { RefObject } from "react";
export function UploadScreen({ onUpload, onStartWithoutSlides, isLoading, error, inputRef }: {
  onUpload: (file: File) => void; onStartWithoutSlides: () => void; isLoading: boolean; error: string | null; inputRef: RefObject<HTMLInputElement | null>;
}) {
  return <div className="upload-stage">
    <button className="primary-button" disabled={isLoading} onClick={() => inputRef.current?.click()}>{isLoading ? "Opening PDF…" : "Upload Lecture Slides"}</button>
    <p>or <button className="text-button" disabled={isLoading} onClick={onStartWithoutSlides}>Continue without Slides</button></p>
    <input ref={inputRef} type="file" accept="application/pdf,.pdf" aria-label="Upload lecture PDF" hidden onChange={event => { const file = event.target.files?.[0]; if (file) onUpload(file); event.target.value = ""; }} />
    {error && <p className="error" role="alert">{error}</p>}
  </div>;
}
