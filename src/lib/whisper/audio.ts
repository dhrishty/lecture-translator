import type { RecognitionMode } from "@/types/lecture";
export const SAMPLE_RATE = 16000;
export const MAX_WINDOW_SAMPLES = SAMPLE_RATE * 24;
export interface CaptureContext { slide: number; mode: RecognitionMode }
export interface AudioWindow { audio: Float32Array; context: CaptureContext; final: boolean }

// Energy-based silence detection, not a speech/language model. Never retains a lecture.
export class ParagraphAudio {
  private frames: Float32Array[] = [];
  private length = 0;
  private silence = 0;
  private lastVoice = 0;
  private active = false;
  private preroll: Float32Array = new Float32Array(0);
  constructor(public context: CaptureContext, private emit: (window: AudioWindow) => void) {}
  push(frame: Float32Array) {
    let energy = 0;
    for (const sample of frame) energy += sample * sample;
    const voiced = Math.sqrt(energy / Math.max(frame.length, 1)) >= 0.008;
    if (!this.active && !voiced) {
      this.preroll.fill(0); this.preroll = frame;
      return;
    }
    if (!this.active) {
      this.active = true;
      if (this.preroll.length) { this.frames.push(this.preroll); this.length += this.preroll.length; this.preroll = new Float32Array(0); }
    }
    this.frames.push(frame); this.length += frame.length;
    if (voiced) this.lastVoice = this.length;
    this.silence = voiced ? 0 : this.silence + frame.length;
    if (this.silence >= SAMPLE_RATE * 3) this.finish();
    else if (this.length >= MAX_WINDOW_SAMPLES || (this.length >= SAMPLE_RATE * 15 && this.silence >= SAMPLE_RATE * 0.2)) this.flush(false);
  }
  private flush(final: boolean) {
    // Keep a small tail for word endings, but never decode silence-only remnants.
    const keep = this.lastVoice ? Math.min(this.length, this.lastVoice + SAMPLE_RATE * 0.2) : 0;
    const audio = new Float32Array(keep);
    let offset = 0;
    for (const frame of this.frames) {
      if (offset < keep) audio.set(frame.subarray(0, Math.min(frame.length, keep - offset)), offset);
      offset += frame.length; frame.fill(0);
    }
    this.frames = []; this.length = 0; this.lastVoice = 0;
    this.emit({ audio, final, context: { ...this.context } });
  }
  finish() {
    if (this.active) { this.active = false; this.silence = 0; this.flush(true); }
    this.preroll.fill(0); this.preroll = new Float32Array(0);
  }
  switchContext(context: CaptureContext) { this.finish(); this.context = context; }
  clear() {
    for (const frame of this.frames) frame.fill(0);
    this.frames = []; this.length = 0; this.lastVoice = 0; this.silence = 0; this.active = false;
    this.preroll.fill(0); this.preroll = new Float32Array(0);
  }
}

// Only this FIFO holds pending PCM. One inference runs at a time.
export class TranscriptionQueue {
  private jobs: AudioWindow[] = [];
  private running = false;
  private closed = false;
  private words: string[] = [];
  private waiters: Array<() => void> = [];
  pendingSamples = 0;
  constructor(private transcribe: (audio: Float32Array, mode: RecognitionMode) => Promise<string>,
    private onParagraph: (text: string, context: CaptureContext) => void,
    private onPreview: (text: string, context: CaptureContext) => void,
    private onError: (message: string) => void) {}
  enqueue(job: AudioWindow) {
    if (this.closed) { job.audio.fill(0); return; }
    if (this.pendingSamples + job.audio.length > SAMPLE_RATE * 100 || this.jobs.length >= 64) {
      job.audio.fill(0); this.clear(); this.onError("This device cannot keep up. Capture stopped; unprocessed audio was discarded. Existing notes are kept."); return;
    }
    this.jobs.push(job); this.pendingSamples += job.audio.length;
    void this.run();
  }
  get overloaded() { return this.pendingSamples >= SAMPLE_RATE * 48 || this.jobs.length >= 48; }
  private async run() {
    if (this.running) return;
    this.running = true;
    while (this.jobs.length && !this.closed) {
      const job = this.jobs.shift()!;
      const samples = job.audio.length;
      try {
        const text = samples ? await this.transcribe(job.audio, job.context.mode) : "";
        if (this.closed) break;
        if (text.trim()) this.words.push(text.trim());
        this.onPreview(this.words.join(" "), job.context);
        if (job.final) {
          if (this.words.length) this.onParagraph(this.words.join(" "), job.context);
          this.words = []; this.onPreview("", job.context);
        }
      } catch {
        if (!this.closed) {
          // Preserve already recognized text; never synthesize missing audio.
          if (this.words.length) this.onParagraph(this.words.join(" "), job.context);
          this.clear();
          this.onError("Local transcription failed. Recognized text is kept; unprocessed audio was discarded. Retry to reload Whisper.");
        }
      } finally {
        if (job.audio.byteLength) job.audio.fill(0);
        this.pendingSamples = Math.max(0, this.pendingSamples - samples);
      }
    }
    this.running = false;
    this.waiters.splice(0).forEach(resolve => resolve());
  }
  drain() { return this.running || this.jobs.length ? new Promise<void>(resolve => this.waiters.push(resolve)) : Promise.resolve(); }
  clear() {
    this.closed = true;
    for (const job of this.jobs) job.audio.fill(0);
    this.jobs = []; this.words = []; this.pendingSamples = 0;
    this.waiters.splice(0).forEach(resolve => resolve());
  }
}
