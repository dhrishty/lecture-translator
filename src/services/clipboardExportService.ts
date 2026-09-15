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

  const english = segments
    .map((s) => (s.editedText ?? s.translatedEnglish).trim())
    .filter(Boolean)
    .join("\n\n");

  const korean = segments
    .filter(s => s.sourceLanguage === "ko")
    .map((s) => s.originalText.trim())
    .filter(Boolean)
    .join("\n\n");

  if (english) {
    parts.push("", "### Transcribed Notes", "", english);
  } else if (korean) {
    parts.push("", "### Transcribed Notes", "", "_(Translation pending or failed)_");
  }

  if (korean) {
    parts.push("", "### Original Korean", "", korean);
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
