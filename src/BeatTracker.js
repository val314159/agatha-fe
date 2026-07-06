// BeatTracker.js
// Listens to ambient audio via microphone, detects beats, and tracks BPM.
//
// Usage:
//   const tracker = new BeatTracker();
//   await tracker.start();          // requests mic permission
//   tracker.update();               // call each frame
//   const bpm = tracker.getBPM();   // null until locked on
//   tracker.stop();                 // release mic


const FFT_SIZE = 1024;
const SMOOTHING = 0.7;

// Low-frequency band for beat detection (as fraction of Nyquist)
const LOW_BAND = 0.06;  // ~0-1.3kHz at 44.1kHz

// Rolling window for BPM estimation
const WINDOW_SECONDS = 10;
const MIN_ONSETS = 4;
const MAX_ONSETS = 200;

// BPM sanity bounds
const MIN_BPM = 60;
const MAX_BPM = 200;

export class BeatTracker {
  constructor(opts = {}) {
    this.fftSize = opts.fftSize ?? FFT_SIZE;
    this.smoothing = opts.smoothing ?? SMOOTHING;
    this.lowBand = opts.lowBand ?? LOW_BAND;
    this.onsetThreshold = opts.onsetThreshold ?? 0.25;
    this.onsetCooldown = opts.onsetCooldown ?? 6;
    this.windowSeconds = opts.windowSeconds ?? WINDOW_SECONDS;

    this.audioCtx = null;
    this.analyser = null;
    this.stream = null;
    this.source = null;
    this._freqData = null;
    this._prevSpectrum = null;
    this._onsetTimes = [];
    this._onsetDecay = 0;
    this._bpm = null;
    this._bpmConfidence = 0;
    this._lastOnsetTime = 0;
    this._running = false;

    this._features = {
      lowEnergy: 0,
      midEnergy: 0,
      highEnergy: 0,
      rms: 0,
      onset: 0,
      onsetActive: false,
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

    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });

    this.audioCtx = new AC();
    this.source = this.audioCtx.createMediaStreamSource(this.stream);

    this.analyser = this.audioCtx.createAnalyser();
    this.analyser.fftSize = this.fftSize;
    this.analyser.smoothingTimeConstant = this.smoothing;
    this.source.connect(this.analyser);
    // Note: analyser is NOT connected to destination — we don't want
    // to play the mic input back through speakers (feedback loop).

    this._freqData = new Uint8Array(this.analyser.frequencyBinCount);
    this._prevSpectrum = new Float32Array(this.analyser.frequencyBinCount);
    this._onsetTimes = [];
    this._onsetDecay = 0;
    this._bpm = null;
    this._bpmConfidence = 0;
    this._running = true;
  }

  stop() {
    this._running = false;

    if (this.source) {
      try { this.source.disconnect(); } catch (e) {}
      this.source = null;
    }
    if (this.analyser) {
      try { this.analyser.disconnect(); } catch (e) {}
      this.analyser = null;
    }
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.audioCtx) {
      this.audioCtx.close().catch(() => {});
      this.audioCtx = null;
    }
    this._freqData = null;
    this._prevSpectrum = null;
    this._onsetTimes = [];
    this._bpm = null;
    this._bpmConfidence = 0;
  }

  isRunning() {
    return this._running;
  }

  /**
   * Call once per animation frame.
   * Updates features and BPM estimate.
   * @returns {Object} features object
   */
  update() {
    if (!this._running || !this.analyser) {
      this._decayFeatures();
      return this._features;
    }

    this.analyser.getByteFrequencyData(this._freqData);

    const bins = this._freqData.length;
    const lowEnd = Math.max(1, Math.floor(bins * this.lowBand));
    const midEnd = Math.floor(bins * 0.25);

    let lowSum = 0, midSum = 0, highSum = 0;
    let spectralFlux = 0;

    for (let i = 0; i < bins; i++) {
      const v = this._freqData[i] / 255;
      if (i < lowEnd) lowSum += v;
      else if (i < midEnd) midSum += v;
      else highSum += v;

      const diff = v - this._prevSpectrum[i];
      if (diff > 0) spectralFlux += diff;
      this._prevSpectrum[i] = v;
    }

    const lowEnergy = lowSum / lowEnd;
    const midEnergy = midSum / (midEnd - lowEnd);
    const highEnergy = highSum / (bins - midEnd);
    const spectralFluxNorm = spectralFlux / bins;

    // RMS approximation from frequency data (no time-domain read needed)
    let totalEnergy = 0;
    for (let i = 0; i < bins; i++) totalEnergy += this._freqData[i] / 255;
    const rms = Math.sqrt(totalEnergy / bins);

    // Onset detection
    const now = this.audioCtx.currentTime;
    let onset = 0;
    if (spectralFluxNorm > this.onsetThreshold && this._onsetDecay <= 0) {
      onset = 1;
      this._onsetDecay = this.onsetCooldown;
      this._onsetTimes.push(now);
      this._lastOnsetTime = now;
    } else {
      this._onsetDecay = Math.max(0, this._onsetDecay - 1);
    }

    // Trim old onsets outside the rolling window
    const windowStart = now - this.windowSeconds;
    while (this._onsetTimes.length && this._onsetTimes[0] < windowStart) {
      this._onsetTimes.shift();
    }

    this._estimateBPM();

    // Smooth features
    const a = 0.3;
    const f = this._features;
    f.lowEnergy = lowEnergy;
    f.midEnergy = midEnergy;
    f.highEnergy = highEnergy;
    f.rms = rms;
    f.onset = onset;
    f.onsetActive = onset > 0;
    f.lowEnergySmooth += (lowEnergy - f.lowEnergySmooth) * a;
    f.midEnergySmooth += (midEnergy - f.midEnergySmooth) * a;
    f.highEnergySmooth += (highEnergy - f.highEnergySmooth) * a;
    f.rmsSmooth += (rms - f.rmsSmooth) * a;

    return f;
  }

  /**
   * Estimate BPM from onset intervals using histogram of inter-onset distances.
   * Picks the most common interval, converts to BPM.
   */
  _estimateBPM() {
    const times = this._onsetTimes;
    if (times.length < MIN_ONSETS) {
      this._bpm = null;
      this._bpmConfidence = 0;
      return;
    }

    // Compute all inter-onset intervals
    const intervals = [];
    for (let i = 1; i < times.length; i++) {
      for (let j = Math.max(0, i - 8); j < i; j++) {
        const dt = times[i] - times[j];
        if (dt > 0.2 && dt < 2.0) {  // 30-300 BPM range
          intervals.push(dt);
        }
      }
    }

    if (intervals.length < 3) {
      this._bpmConfidence *= 0.9;
      return;
    }

    // Build a histogram with fine resolution
    const binSize = 0.005;  // 5ms bins
    const minInterval = 0.3;  // 200 BPM
    const maxInterval = 1.0;  // 60 BPM
    const numBins = Math.floor((maxInterval - minInterval) / binSize);
    const histogram = new Int32Array(numBins);

    for (const dt of intervals) {
      const bin = Math.floor((dt - minInterval) / binSize);
      if (bin >= 0 && bin < numBins) histogram[bin]++;
    }

    // Find the peak bin
    let bestBin = 0;
    let bestCount = 0;
    for (let i = 0; i < numBins; i++) {
      if (histogram[i] > bestCount) {
        bestCount = histogram[i];
        bestBin = i;
      }
    }

    if (bestCount < 2) {
      this._bpmConfidence *= 0.9;
      return;
    }

    const bestInterval = minInterval + (bestBin + 0.5) * binSize;
    let bpm = 60 / bestInterval;

    // Fold into sane range (handle half/double time)
    while (bpm < MIN_BPM) bpm *= 2;
    while (bpm > MAX_BPM) bpm /= 2;

    // Smooth BPM updates
    if (this._bpm === null) {
      this._bpm = bpm;
    } else {
      this._bpm += (bpm - this._bpm) * 0.15;
    }

    // Confidence: ratio of peak count to total intervals
    this._bpmConfidence = Math.min(1, bestCount / intervals.length);
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

  _decayFeatures() {
    const f = this._features;
    const decay = 0.92;
    f.lowEnergySmooth *= decay;
    f.midEnergySmooth *= decay;
    f.highEnergySmooth *= decay;
    f.rmsSmooth *= decay;
    f.onset = 0;
    f.onsetActive = false;
    this._onsetDecay = Math.max(0, this._onsetDecay - 1);
    this._bpmConfidence *= 0.95;
  }
}
