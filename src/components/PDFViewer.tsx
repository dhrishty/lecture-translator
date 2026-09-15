"use client";
import { memo, useEffect, useRef, useState } from "react";
import * as pdfjs from "pdfjs-dist";
import { pdfOptions } from "@/lib/pdfOptions";

export const PDFViewer = memo(function PDFViewer({ pdfUrl, pageNumber }: { pdfUrl: string; pageNumber: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdf, setPdf] = useState<pdfjs.PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [renderedPage, setRenderedPage] = useState(0);
  useEffect(() => {
    let active = true;
    const task = pdfjs.getDocument({ ...pdfOptions, url: pdfUrl });
    task.promise.then(doc => { if (active) setPdf(doc); }).catch(() => { if (active) setError("Failed to open PDF."); });
    return () => { active = false; void task.destroy(); };
  }, [pdfUrl]);
  useEffect(() => {
    if (!pdf) return;
    let active = true;
    let task: pdfjs.RenderTask | undefined;
    const render = async () => {
      try {
        const page = await pdf.getPage(pageNumber);
        if (!active || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const viewport = page.getViewport({ scale: 1.6 });
        canvas.height = viewport.height; canvas.width = viewport.width;
        task = page.render({ canvas, viewport });
        await task.promise;
        if (active) { setRenderedPage(pageNumber); setError(null); }
      } catch {
        if (active) setError("Failed to render this slide. Try another slide or reload your PDF.");
      }
    };
    void render();
    return () => { active = false; task?.cancel(); };
  }, [pdf, pageNumber]);
  return <div className="pdf-stage" aria-busy={renderedPage !== pageNumber && !error}>
    {(renderedPage !== pageNumber || error) && <p role={error ? "alert" : "status"} className="pdf-message">{error ?? "Rendering slide…"}</p>}
    <canvas ref={canvasRef} style={{ visibility: renderedPage === pageNumber && !error ? "visible" : "hidden" }} aria-label={`Slide ${pageNumber}`} />
  </div>;
});
