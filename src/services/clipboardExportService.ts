import type { SlideData } from "@/types/lecture";

function formatSlideSection(slide: SlideData, withSlideHeaders = true): string | null {
  const notes = slide.manualNotes.trim();
  const segments = slide.transcriptSegments.filter(
    (s) => s.originalText.trim() || (s.editedText ?? s.translatedEnglish).trim(),
  );

  if (!notes && segments.length === 0) return null;

  const slideLabel = String(slide.slideNumber).padStart(2, "0");
  const parts: string[] = withSlideHeaders ? [`## Slide ${slideLabel}`] : [];

  if (notes) {
    parts.push("", "### Notes", "", notes);
  }

  if (segments.length) {
    const paragraphs = segments.map(s => {
      const edited = (s.editedText ?? s.translatedEnglish).trim();
      if (s.sourceLanguage === "ko" && !s.transcribeOnly) {
        return `${s.originalText.trim()}\n\n${edited || "_(Translation pending or failed)_"}`;
      }
      return edited || s.originalText.trim();
    });
    parts.push("", "### Transcribed Notes", "", paragraphs.join("\n\n"));
  }

  return parts.join("\n");
}

export function formatLectureForExport(
  title: string,
  slides: SlideData[],
  withSlideHeaders = true,
): string {
  const header = `# ${title}`;
  const sections = slides
    .map(slide => formatSlideSection(slide, withSlideHeaders))
    .filter((s): s is string => s !== null);

  if (sections.length === 0) {
    return `${header}\n\n_(No notes or translations recorded)_`;
  }

  return [header, "", ...sections.flatMap((s, i) =>
    i < sections.length - 1 ? [s, "", "---", ""] : [s],
  )].join("\n");
}

export function formatCurrentSlideForExport(
  title: string,
  slide: SlideData,
): string {
  const section = formatSlideSection(slide);
  if (!section) {
    return `# ${title}\n\n## Slide ${String(slide.slideNumber).padStart(2, "0")}\n\n_(No content on this slide)_`;
  }
  return `# ${title}\n\n${section}`;
}

export async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(textarea);
  if (!ok) throw new Error("Clipboard copy failed");
}
