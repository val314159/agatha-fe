import * as THREE from 'three';
import { disposeObject } from './utils.js';
import { AvaToAvar, splitByRegion } from './AvaToAvar.js';
import { AvarToAvak } from './AvarToAvak.js';
import { MovePlayer } from './MovePlayer.js';

export class Avatar {
  constructor(vrm, root, path, options = {}) {
    this.vrm = vrm;
    this.root = root;
    this.path = path;
    this.useAvak = options.useAvak ?? false;
    this.movePlayer = new MovePlayer(root);
  }

  resetPose() {
    this.vrm?.humanoid?.resetNormalizedPose?.();
    this.vrm?.update?.(0);
  }

  playAvaMove(move, kind = 'full') {
    if (!this.vrm || !this.movePlayer) return false;
    if (!move?.ava) return false;

    this.stopAnimation();
    this.resetPose();

    const avarBaker = new AvaToAvar(this.vrm, { modelPath: this.path || 'avatar' });
    let avar = avarBaker.bake(move.ava);

    if (kind !== 'full') {
      avar = splitByRegion(avar, kind);
    }

    let clip = avar;
    if (this.useAvak) {
      const avakBaker = new AvarToAvak(this.vrm, { modelPath: this.path || 'avatar' });
      clip = avakBaker.bake(avar) || avar;
    }

    this.movePlayer.play(clip);
    return true;
  }

  stopAnimation() {
    this.movePlayer?.stop();
  }

  setUseAvak(enabled) {
    this.useAvak = enabled;
  }

  setAvaBeatSync(enabled) {
    this.movePlayer?.setBeatSync(enabled);
  }

  setBeatState(state) {
    this.movePlayer?.setBeatState(state);
  }

  setAvaTimeScale(scale) {
    this.movePlayer?.setTimeScale(scale);
  }

  getAvaMoveStatus() {
    return this.movePlayer?.getStatus() || { playing: false, time: 0, duration: 0 };
  }

  isAvaPlaying() {
    return Boolean(this.movePlayer?.action);
  }

  update(delta) {
    this.movePlayer?.update(delta);
    this.vrm?.update?.(delta);
  }

  dispose() {
    this.stopAnimation();
    this.movePlayer = null;
    disposeObject(this.root);
    this.root = null;
    this.vrm = null;
  }
}
