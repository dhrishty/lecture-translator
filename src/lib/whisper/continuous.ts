import type { RecognitionMode } from "@/types/lecture";
import type { CaptureContext } from "./audio";
export const RATE = 16000;
export const WINDOW = 24 * RATE;
export const OVERLAP = 3 * RATE;
export interface Boundary { sample: number; context: CaptureContext }
export interface ContinuousWindow {
  audio: Float32Array; start: number; end: number; final: boolean;
  boundaries: Boundary[]; context: CaptureContext;
}
export interface TimedWord { text: string; timestamp: [number, number | null] }
export interface RecognitionResult { text: string; chunks?: TimedWord[]; warning?: string; rejected?: boolean }

/** Rolling audio, bounded to 24 seconds, including three seconds reused by the next call. */
export class ContinuousAudio {
  private pcm = new Float32Array(WINDOW);
  private length = 0;
  private start = 0;
  private silence = 0;
  private changed = false;
  private hasSignal = false;
  private boundaries: Boundary[];
  constructor(public context: CaptureContext, private emit: (window: ContinuousWindow) => void) {
    this.boundaries = [{ sample: 0, context: { ...context } }];
  }
  push(frame: Float32Array) {
    let offset = 0;
    while (offset < frame.length) {
      const size = Math.min(WINDOW - this.length, frame.length - offset);
      const part = frame.subarray(offset, offset + size);
      this.pcm.set(part, this.length); this.length += size; offset += size; this.changed = true;
      let energy = 0;
      for (const value of part) { energy += value * value; if (value !== 0) this.hasSignal = true; }
      // Near-zero energy is a boundary hint only. Quiet frames are never gated out.
      this.silence = Math.sqrt(energy / size) < 0.00001 ? this.silence + size : 0;
      if (this.length === WINDOW) this.flush(false);
      else if (this.silence >= 3 * RATE && this.length >= 3 * RATE) this.flush(true);
    }
    frame.fill(0);
  }
  private flush(final: boolean) {
    if (!this.length) return;
    const end = this.start + this.length;
    // A final overlap-only window still seals the previously provisional text.
    const audio = this.hasSignal && this.changed ? this.pcm.slice(0, this.length) : new Float32Array(0);
    const job = { audio, start: this.start, end, final, boundaries: this.boundaries.map(b => ({ sample: b.sample, context: { ...b.context } })), context: { ...this.context } };
    const keep = final ? 0 : Math.min(OVERLAP, this.length);
    this.pcm.copyWithin(0, this.length - keep, this.length); this.pcm.fill(0, keep);
    this.start = end - keep; this.length = keep; this.changed = false;
    this.hasSignal = keep > 0 && this.pcm.subarray(0, keep).some(value => value !== 0);
    if (final) this.silence = 0;
    // Keep only the ownership marker at/before the retained audio and later changes.
    let owner = this.boundaries[0];
    for (const boundary of this.boundaries) if (boundary.sample <= this.start) owner = boundary;
    this.boundaries = [owner, ...this.boundaries.filter(b => b.sample > this.start)];
    this.emit(job);
  }
  switchContext(context: CaptureContext) {
    if (context.mode !== this.context.mode) this.finish(); // Language tasks cannot share one decode.
    this.context = { ...context };
    const sample = this.start + this.length;
    const last = this.boundaries.at(-1)!;
    if (last.sample === sample) this.boundaries[this.boundaries.length - 1] = { sample, context: { ...context } };
    else this.boundaries.push({ sample, context: { ...context } });
    // Slide changes annotate time; they never flush or reset acoustic context.
  }
  finish() { this.flush(true); }
  clear() { this.pcm.fill(0); this.length = 0; this.changed = false; this.hasSignal = false; this.boundaries = []; }
}

interface Word { text: string; start: number; end: number; context: CaptureContext }
const midpoint = (word: Word) => (word.start + word.end) / 2;
const normalize = (text: string) => text.normalize("NFKC").replace(/[\s\p{P}\p{S}]/gu, "");
/** Returns the longest suffix/prefix match; only called for shared acoustic time. */
export function overlapMatch(left: string[], right: string[]): { left: number; right: number } | null {
  let best: { left: number; right: number; length: number } | null = null;
  for (let a = Math.max(0, left.length - 40); a < left.length - 1; a++) {
    const suffix = normalize(left.slice(a).join(" "));
    if (suffix.length < 6) continue;
    for (let b = 2; b <= Math.min(40, right.length); b++) {
      if (normalize(right.slice(0, b).join(" ")) === suffix && (!best || suffix.length > best.length)) best = { left: a, right: b, length: suffix.length };
    }
  }
  return best;
}

/** Timestamp ownership first; conservative boundary matching reconciles repeated overlap. */
export class TranscriptMerger {
  private tail: Word[] = [];
  private previousEnd = 0;
  private committedThrough = 0;
  private draft: Word[] = [];
  constructor(private emit: (text: string, context: CaptureContext) => void,
    private preview: (text: string, context: CaptureContext) => void,
    private warn: (message: string) => void = () => {}) {}
  private publish() {
    if (!this.draft.length) return;
    const context = this.draft[0].context;
    this.emit(this.draft.map(w => w.text.trim()).join(" "), context);
    this.draft = []; this.preview("", context);
  }
  accept(job: ContinuousWindow, result: RecognitionResult) {
    if (result.rejected) {
      this.warn(result.warning ?? "Unreliable audio was skipped; check for a gap.");
      // Keep already aligned text, but do not bridge missing audio silently.
      this.commit(this.tail); this.tail = []; this.publish();
      this.previousEnd = job.end; this.committedThrough = job.end;
      return;
    }
    let incoming: Word[] = [];
    if (result.text.trim()) {
      if (!result.chunks?.length) throw new Error("Word timestamps unavailable; cannot safely assign speech across slides.");
      let last = -Infinity;
      incoming = result.chunks.filter(w => w.text.trim()).map(w => {
        const [start, end] = w.timestamp;
        if (!Number.isFinite(start) || end === null || !Number.isFinite(end) || end < start || start < last || start < 0 || end > (job.end - job.start) / RATE + 0.5) throw new Error("Invalid word timestamps; transcription paused to protect slide ownership.");
        last = start;
        const absoluteStart = job.start + start * RATE;
        const absoluteEnd = job.start + end * RATE;
        const middle = (absoluteStart + absoluteEnd) / 2;
        let owner = job.boundaries[0].context;
        for (const boundary of job.boundaries) if (boundary.sample <= middle) owner = boundary.context;
        return { text: w.text, start: absoluteStart, end: absoluteEnd, context: { ...owner } };
      });
    }
    const overlap = incoming.filter(w => midpoint(w) < this.previousEnd);
    const match = overlapMatch(this.tail.map(w => w.text), overlap.map(w => w.text));
    let combined: Word[];
    if (match) {
      // Preserve old timestamps for matched words so a slide click cannot move them twice.
      combined = [...this.tail, ...incoming.slice(match.right)];
    } else if (this.tail.length && overlap.length) {
      const seam = (job.start + this.previousEnd) / 2;
      combined = [...this.tail.filter(w => midpoint(w) < seam), ...incoming.filter(w => midpoint(w) >= seam)];
      this.warn("Overlap wording differed; aligned at the audio midpoint. Review this boundary in the comparison test.");
    } else combined = [...this.tail, ...incoming];
    // Timestamp-only marker when finalizing an exact window boundary: preserve its tail.
    const cutoff = job.final ? job.end + 1 : job.end - OVERLAP;
    // A word straddling the stable/overlap edge remains provisional in full.
    combined = combined.filter(w => w.end > this.committedThrough);
    this.commit(combined.filter(w => w.end <= cutoff));
    this.tail = combined.filter(w => w.end > cutoff);
    this.committedThrough = Math.max(this.committedThrough, job.final ? job.end : cutoff);
    this.previousEnd = job.end;
    if (job.final) { this.publish(); this.tail = []; }
    else if (this.draft.length) this.preview([...this.draft, ...this.tail].map(w => w.text.trim()).join(" "), this.draft[0].context);
  }
  private commit(words: Word[]) {
    for (const word of words) {
      const previous = this.draft.at(-1);
      if (previous && (previous.context.slide !== word.context.slide || previous.context.mode !== word.context.mode)) this.publish();
      this.draft.push(word);
    }
  }
  finishStable() { this.publish(); this.tail = []; }
  clear() { this.tail = []; this.draft = []; }
}

export class ContinuousQueue {
  private jobs: ContinuousWindow[] = [];
  private running = false;
  private closed = false;
  private waiters: Array<() => void> = [];
  pendingSamples = 0;
  private merger: TranscriptMerger;
  constructor(private transcribe: (audio: Float32Array, mode: RecognitionMode) => Promise<RecognitionResult>,
    onParagraph: (text: string, context: CaptureContext) => void, onPreview: (text: string, context: CaptureContext) => void,
    private onError: (message: string) => void, onWarning: (message: string) => void = () => {}) {
    this.merger = new TranscriptMerger(onParagraph, onPreview, onWarning);
  }
  get overloaded() { return this.pendingSamples >= 48 * RATE || this.jobs.length >= 48; }
  enqueue(job: ContinuousWindow) {
    if (this.closed) { job.audio.fill(0); return; }
    if (this.pendingSamples + job.audio.length > 100 * RATE || this.jobs.length >= 64) {
      job.audio.fill(0); this.merger.finishStable(); this.clear(); this.onError("Device cannot keep up. Unprocessed audio was discarded; existing notes remain."); return;
    }
    this.pendingSamples += job.audio.length; this.jobs.push(job); void this.run();
  }
  private async run() {
    if (this.running) return;
    this.running = true;
    while (this.jobs.length && !this.closed) {
      const job = this.jobs.shift()!; const length = job.audio.length;
      try {
        const result = length ? await this.transcribe(job.audio, job.context.mode) : { text: "", chunks: [] };
        if (!this.closed) this.merger.accept(job, result);
      } catch (error) {
        if (!this.closed) { this.merger.finishStable(); this.clear(); this.onError(error instanceof Error ? error.message : "Local transcription failed."); }
      } finally {
        if (job.audio.byteLength) job.audio.fill(0);
        this.pendingSamples = Math.max(0, this.pendingSamples - length);
      }
    }
    this.running = false; this.waiters.splice(0).forEach(resolve => resolve());
  }
  drain() { return this.running ? new Promise<void>(resolve => this.waiters.push(resolve)) : Promise.resolve(); }
  clear() {
    this.closed = true; this.jobs.forEach(j => j.audio.fill(0)); this.jobs = []; this.pendingSamples = 0;
    this.merger.clear(); this.waiters.splice(0).forEach(resolve => resolve());
  }
}
