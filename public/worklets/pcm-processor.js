class PcmProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
  }

  // Convert Float32 [-1,1] to 16-bit little-endian PCM
  _floatTo16BitPCM(float32Array) {
    const buffer = new ArrayBuffer(float32Array.length * 2);
    const view = new DataView(buffer);
    let offset = 0;
    for (let i = 0; i < float32Array.length; i++) {
      let s = Math.max(-1, Math.min(1, float32Array[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
      offset += 2;
    }
    return buffer;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    // Downmix to mono: take first channel
    const channelData = input[0];
    if (!channelData) return true;

    const pcmBuffer = this._floatTo16BitPCM(channelData);
    this.port.postMessage(pcmBuffer, [pcmBuffer]);
    return true;
  }
}

registerProcessor('pcm-processor', PcmProcessor);


