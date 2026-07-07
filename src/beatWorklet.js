class BeatCaptureProcessor extends AudioProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0]) {
      const frame = new Float32Array(input[0]);
      this.port.postMessage(frame, [frame.buffer]);
    }
    return true;
  }
}

registerProcessor('beat-capture', BeatCaptureProcessor);
