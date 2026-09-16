/* Microphone PCM only exists in RAM. No recording, networking or storage APIs. */
class MicrophoneProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frame = new Float32Array(1600);
    this.offset = 0;
    this.sum = 0;
    this.count = 0;
    this.phase = 0;
    this.stopped = false;
    this.outstanding = 0;
    this.port.onmessage = event => {
      if (event.data === "ack") this.outstanding = Math.max(0, this.outstanding - 1);
      if (event.data === "stop") {
        if (this.offset) {
          const tail = this.frame.slice(0, this.offset);
          this.port.postMessage(tail, [tail.buffer]);
        }
        this.frame.fill(0); this.stopped = true;
        this.port.postMessage("stopped");
      }
    };
  }
  process(inputs) {
    if (this.stopped) return false;
    const channels = inputs[0];
    if (!channels?.length) return true;
    for (let i = 0; i < channels[0].length; i++) {
      let value = 0;
      for (const channel of channels) value += channel[i] / channels.length;
      this.sum += value; this.count++; this.phase += 16000;
      if (this.phase >= sampleRate) {
        this.phase -= sampleRate;
        this.frame[this.offset++] = this.sum / this.count;
        this.sum = 0; this.count = 0;
        if (this.offset === this.frame.length) {
          // Bound MessagePort backlog if the page is suspended or blocked.
          if (this.outstanding >= 64) {
            this.frame.fill(0); this.stopped = true;
            this.port.postMessage("overflow"); return false;
          }
          this.outstanding++;
          this.port.postMessage(this.frame, [this.frame.buffer]);
          this.frame = new Float32Array(1600); this.offset = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("local-microphone", MicrophoneProcessor);
