import { useEffect, useRef } from "react";
export function EndLectureDialog({ onCopy, onEnd, onClose, message }: {
  onCopy: () => void; onEnd: () => void; onClose: () => void; message: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; ref.current?.showModal(); return () => previous?.focus(); }, []);
  return <dialog ref={ref} onCancel={event => { event.preventDefault(); onClose(); }} aria-labelledby="end-title" aria-describedby="end-description" onClick={event => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}>
    <button className="dialog-close" aria-label="Return to notes" onClick={onClose}>×</button>
    <h2 id="end-title">Are you sure?</h2><p id="end-description">Nothing from this lecture is saved. Make sure you’ve copied your notes.</p>
    <div className="dialog-actions"><button className="secondary-button" onClick={onCopy}>Copy Lecture</button><button className="danger-button" onClick={onEnd}>End Lecture</button></div>
    {message && <p className="dialog-message" role="status">{message}</p>}
  </dialog>;
}
