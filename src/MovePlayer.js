import * as THREE from 'three';

export class MovePlayer {
  constructor(root) {
    this.root = root;
    this.mixer = null;
    this.clip = null;
    this.action = null;
    this.timeScale = 0.6;
    this.beatSync = false;
    this.beatState = null;
    this.pendingStart = false;
  }

  setRoot(root) {
    this.stop();
    this.root = root;
  }

  setTimeScale(scale) {
    this.timeScale = scale;
    if (this.action && !this.beatSync) {
      this.action.setEffectiveTimeScale(scale);
    }
  }

  setBeatSync(enabled) {
    this.beatSync = Boolean(enabled);
    this.pendingStart = false;
    if (this.action) {
      if (enabled) {
        this.action.setEffectiveTimeScale(0);
      } else {
        this.action.setEffectiveTimeScale(this.timeScale);
      }
    }
  }

  setBeatState(state) {
    this.beatState = state || null;
  }

  computeBeatFloat() {
    if (!this.beatState) return 0;
    const beatPeriodMs = 60000 / this.beatState.bpm;
    return ((performance.now() - this.beatState.anchorTimeMs + this.beatState.offsetMs) / beatPeriodMs) + this.beatState.anchorBeat;
  }

  getStatus() {
    if (!this.action) return { playing: false, time: 0, duration: 0 };
    return {
      playing: this.action.isRunning(),
      time: this.action.time,
      duration: this.clip?.duration || 0,
    };
  }

  play(avar) {
    this.stop();
    if (!avar?.tracks?.length || !this.root) return;

    const boneMap = avar.target?.boneMap || {};
    const tracks = avar.tracks
      .map((track) => {
        const nodeName = boneMap[track.bone];
        if (!nodeName) return null;

        const name = `${nodeName}.${track.property}`;
        if (track.property === 'quaternion') {
          return new THREE.QuaternionKeyframeTrack(name, track.times, track.values);
        }
        if (track.property === 'position') {
          return new THREE.VectorKeyframeTrack(name, track.times, track.values);
        }
        return null;
      })
      .filter(Boolean);

    if (tracks.length === 0) return;

    this.clip = new THREE.AnimationClip(avar.name || 'avar', avar.duration, tracks);
    this.mixer = new THREE.AnimationMixer(this.root);
    this.action = this.mixer.clipAction(this.clip);

    if (this.beatSync && this.beatState?.avaEnabled) {
      this.action.setEffectiveTimeScale(0);
      this.pendingStart = true;
    } else {
      this.action.setEffectiveTimeScale(this.timeScale);
    }
    this.action.play();
  }

  stop() {
    if (this.action) {
      this.action.paused = true;
      this.action = null;
    }
    if (this.mixer) {
      this.mixer = null;
    }
    this.clip = null;
    this.pendingStart = false;
  }

  update(delta) {
    if (!this.mixer || !this.action) return;

    if (this.beatSync && this.beatState?.avaEnabled) {
      if (this.pendingStart) {
        const beatFloat = this.computeBeatFloat();
        const beatCount = ((Math.floor(beatFloat) % 4) + 4) % 4 + 1;
        const phase = beatFloat - Math.floor(beatFloat);
        if (beatCount === 1 && phase < 0.05) {
          this.pendingStart = false;
        } else {
          return;
        }
      }

      const beatFloat = this.computeBeatFloat();
      const beatPhaseInBar = (((beatFloat % 4) + 4) % 4) / 4;
      const duration = this.clip?.duration || 1;
      this.action.time = beatPhaseInBar * duration;
      this.mixer.update(0);
    } else {
      this.mixer.update(delta);
    }
  }
}
