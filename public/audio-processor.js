const MAX_16BIT_INT = 32767;

// Target chunk length in milliseconds (100ms)
const TARGET_MS = 100;
// At 16kHz sample rate, samples per ms = 16
const SAMPLE_RATE = 16000;
const TARGET_SAMPLES = Math.floor((TARGET_MS / 1000) * SAMPLE_RATE); // 1600 samples

class AudioProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    // Float32 accumulator for incoming samples
    this._buffer = new Float32Array(0);
  }

  process(inputs) {
    try {
      const input = inputs[0];
      if (!input) return true; // no input this frame

      const channelData = input[0];
      if (!channelData) return true;

      // Append new samples to accumulator
      const incoming = Float32Array.from(channelData);
      const combined = new Float32Array(this._buffer.length + incoming.length);
      combined.set(this._buffer, 0);
      combined.set(incoming, this._buffer.length);
      this._buffer = combined;

      // While we have enough samples, emit chunks of TARGET_SAMPLES
      while (this._buffer.length >= TARGET_SAMPLES) {
        const chunk = this._buffer.subarray(0, TARGET_SAMPLES);

        // convert to int16 PCM
        const int16 = new Int16Array(chunk.length);
        for (let i = 0; i < chunk.length; i++) {
          const s = Math.max(-1, Math.min(1, chunk[i]));
          int16[i] = s < 0 ? s * 0x8000 : s * MAX_16BIT_INT;
        }

        // Post the ArrayBuffer as transferable to avoid copies
        this.port.postMessage({ audio_data: int16.buffer }, [int16.buffer]);

        // Keep the remaining samples
        const remaining = this._buffer.subarray(TARGET_SAMPLES);
        this._buffer = new Float32Array(remaining.length);
        this._buffer.set(remaining, 0);
      }

      return true;
    } catch (error) {
      console.error('AudioProcessor error:', error);
      return false;
    }
  }
}

registerProcessor('audio-processor', AudioProcessor);
