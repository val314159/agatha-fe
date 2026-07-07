// BeatTracker.js
// Uses aubiojs (WASM) + AudioWorklet for real-time BPM detection from mic.
//
// Usage:
//   const tracker = new BeatTracker();
//   await tracker.start();          // requests mic permission, loads aubio WASM
//   tracker.update();               // call each frame
//   const bpm = tracker.getBPM();   // null until locked on
//   tracker.stop();                 // release mic

const BUFFER_SIZE = 1024;
const HOP_SIZE = 512;

// Onset detection defaults (can be overridden via constructor opts)
const DEFAULT_ONSET_THRESHOLD = 0.1;
const DEFAULT_ONSET_SILENCE = -70;
const DEFAULT_ONSET_MINIOI_S = 0.04;

export class BeatTracker {
  constructor(opts = {}) {
    this.bufferSize = opts.bufferSize ?? BUFFER_SIZE;
    this.hopSize = opts.hopSize ?? HOP_SIZE;
    this.onsetThreshold = opts.onsetThreshold ?? DEFAULT_ONSET_THRESHOLD;
    this.onsetSilence = opts.onsetSilence ?? DEFAULT_ONSET_SILENCE;
    this.onsetMinioiS = opts.onsetMinioiS ?? DEFAULT_ONSET_MINIOI_S;
    this.onAdaptiveWhitening = opts.onAdaptiveWhitening ?? true;
    this.onCompression = opts.onCompression ?? true;

    this.audioCtx = null;
    this.stream = null;
    this.source = null;
    this.workletNode = null;
    this.tempo = null;
    this.onset = null;
    this._running = false;

    this._sampleBuffer = new Float32Array(this.hopSize);
    this._bufferFill = 0;
    this._bpm = null;
    this._bpmConfidence = 0;
    this._beatDetected = false;
    this._beatTimestamp = null;
    this._onsetTimestamp = null;
    this._onsetDescriptor = 0;
    this._rms = 0;
    this._lowEnergy = 0;
    this._midEnergy = 0;
    this._highEnergy = 0;

    // Callback fired when aubio detects a beat, with audioCtx.currentTime
    this.onBeat = null;

    this._features = {
      lowEnergy: 0,
      midEnergy: 0,
      highEnergy: 0,
      rms: 0,
      onset: 0,
      onsetActive: false,
      onsetDescriptor: 0,
      lowEnergySmooth: 0,
      midEnergySmooth: 0,
      highEnergySmooth: 0,
      rmsSmooth: 0,
    };
  }

  async start() {
    if (this._running) return;

    const AC = (typeof window !== 'undefined' &&
                (window.AudioContext || window.webkitAudioContext)) || null;
    if (!AC) throw new Error('Web Audio API not supported');

    if (!AC.prototype.audioWorklet) {
      throw new Error('AudioWorklet not supported in this browser');
    }

    const aubioModule = await import('aubiojs');
    const aubioFactory = aubioModule.default;
    const Aubio = await aubioFactory();

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    this.audioCtx = new AC();
    const sampleRate = this.audioCtx.sampleRate;

    this.tempo = new Aubio.Tempo(this.bufferSize, this.hopSize, sampleRate);
    this.onset = new Aubio.Onset(this.bufferSize, this.hopSize, sampleRate);

    this.onset.setThreshold(this.onsetThreshold);
    this.onset.setSilence(this.onsetSilence);
    this.onset.setMinioiS(this.onsetMinioiS);
    this.onset.setAwhitening(this.onAdaptiveWhitening);
    this.onset.setCompression(this.onCompression);

    const workletUrl = new URL('./beatWorklet.js', import.meta.url);
    await this.audioCtx.audioWorklet.addModule(workletUrl);

    this.source = this.audioCtx.createMediaStreamSource(this.stream);
    this.workletNode = new AudioWorkletNode(this.audioCtx, 'beat-capture');
    this.source.connect(this.workletNode);

    this.workletNode.port.onmessage = (e) => {
      this._onAudioFrame(e.data);
    };

    this._bpm = null;
    this._bpmConfidence = 0;
    this._bufferFill = 0;
    this._beatDetected = false;
    this._beatTimestamp = null;
    this._onsetTimestamp = null;
    this._onsetDescriptor = 0;
    this.onset?.reset();
    this._running = true;
  }

  _onAudioFrame(frame) {
    let offset = 0;
    while (offset < frame.length) {
      const remaining = this.hopSize - this._bufferFill;
      const toCopy = Math.min(frame.length - offset, remaining);
      this._sampleBuffer.set(frame.subarray(offset, offset + toCopy), this._bufferFill);
      this._bufferFill += toCopy;
      offset += toCopy;

      if (this._bufferFill >= this.hopSize) {
        this._processHop();
        this._bufferFill = 0;
      }
    }

    let sum = 0;
    let lowSum = 0, midSum = 0, highSum = 0;
    const n = frame.length;
    const lowEnd = Math.floor(n * 0.1);
    const midEnd = Math.floor(n * 0.4);
    for (let i = 0; i < n; i++) {
      const s = frame[i];
      sum += s * s;
      const e = s * s;
      if (i < lowEnd) lowSum += e;
      else if (i < midEnd) midSum += e;
      else highSum += e;
    }
    this._rms = Math.sqrt(sum / n);
    this._lowEnergy = Math.sqrt(lowSum / lowEnd);
    this._midEnergy = Math.sqrt(midSum / (midEnd - lowEnd));
    this._highEnergy = Math.sqrt(highSum / (n - midEnd));
  }

  _processHop() {
    const buffer = this._sampleBuffer;
    const now = this.audioCtx?.currentTime ?? 0;

    const beat = this.tempo.do(buffer);
    if (beat > 0) {
      this._beatDetected = true;
      this._beatTimestamp = now;
      if (this.onBeat) this.onBeat(now);
    }

    const onsetResult = this.onset.do(buffer);
    if (onsetResult > 0) {
      this._onsetTimestamp = this.onset.getLastS();
    }
    this._onsetDescriptor = this.onset.getDescriptor();

    const bpm = this.tempo.getBpm();
    const conf = this.tempo.getConfidence();

    if (bpm > 0) {
      if (this._bpm === null) {
        this._bpm = bpm;
      } else {
        this._bpm += (bpm - this._bpm) * 0.15;
      }
    }

    if (conf > 0) {
      this._bpmConfidence = conf;
    } else {
      this._bpmConfidence *= 0.95;
    }
  }

  stop() {
    this._running = false;

    if (this.workletNode) {
      try { this.workletNode.port.onmessage = null; this.workletNode.disconnect(); } catch (e) {}
      this.workletNode = null;
    }
    if (this.source) {
      try { this.source.disconnect(); } catch (e) {}
      this.source = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    this.tempo = null;
    this.onset = null;
    this._bpm = null;
    this._bpmConfidence = 0;
    this._bufferFill = 0;
    this._beatDetected = false;
    this._beatTimestamp = null;
    this._onsetTimestamp = null;
    this._onsetDescriptor = 0;
    this._lowEnergy = 0;
    this._midEnergy = 0;
    this._highEnergy = 0;
  }

  isRunning() {
    return this._running;
  }

  update() {
    if (!this._running) {
      this._decayFeatures();
      return this._features;
    }

    const f = this._features;
    f.rms = this._rms;
    f.lowEnergy = this._lowEnergy;
    f.midEnergy = this._midEnergy;
    f.highEnergy = this._highEnergy;
    f.onset = this._beatDetected ? 1 : 0;
    f.onsetActive = this._beatDetected;
    f.onsetDescriptor = this._onsetDescriptor;
    f.lowEnergySmooth += (this._lowEnergy - f.lowEnergySmooth) * 0.3;
    f.midEnergySmooth += (this._midEnergy - f.midEnergySmooth) * 0.3;
    f.highEnergySmooth += (this._highEnergy - f.highEnergySmooth) * 0.3;
    f.rmsSmooth += (this._rms - f.rmsSmooth) * 0.3;

    this._beatDetected = false;

    return f;
  }

  getBPM() {
    return this._bpm;
  }

  getBPMConfidence() {
    return this._bpmConfidence;
  }

  getFeatures() {
    return this._features;
  }

  isLocked() {
    return this._bpm !== null && this._bpmConfidence > 0.3;
  }

  getBeatTimestamp() {
    return this._beatTimestamp;
  }

  getOnsetTimestamp() {
    return this._onsetTimestamp;
  }

  getOnsetDescriptor() {
    return this._onsetDescriptor;
  }

  _decayFeatures() {
    const f = this._features;
    const decay = 0.92;
    f.lowEnergySmooth *= decay;
    f.midEnergySmooth *= decay;
    f.highEnergySmooth *= decay;
    f.rmsSmooth *= decay;
    f.onset = 0;
    f.onsetActive = false;
    this._bpmConfidence *= 0.95;
  }
}
