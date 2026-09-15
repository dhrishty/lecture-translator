import { useEffect, useRef } from "react";
export function EndLectureDialog({ onCopy, onEnd, onClose, message }: {
  onCopy: () => void; onEnd: () => void; onClose: () => void; message: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return <dialog ref={ref} onCancel={onClose} aria-labelledby="end-title">
    <h2 id="end-title">Before you leave</h2>
    <p>Nothing from this lecture is saved. Make sure you’ve copied your notes to Notion.</p>
    <p className="muted">Listening is paused. Pending or failed translations are copied with their original Korean text.</p>
    <div className="dialog-actions"><button className="primary-button" onClick={onCopy}>Copy Lecture</button><button className="secondary-button" onClick={onEnd}>End Without Copying</button></div>
    <p role="status">{message}</p>
    <button className="text-button" onClick={onClose}>Return to lecture</button>
  </dialog>;
}
