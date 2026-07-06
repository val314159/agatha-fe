import * as THREE from 'three';
import { applyFootPlantHipOffset, setWorldQuaternion } from './ik.js';

const _hipPos = new THREE.Vector3();
const _footPos = new THREE.Vector3();
const _toFoot = new THREE.Vector3();
const _leanDir = new THREE.Vector3();
const _leanAxis = new THREE.Vector3();
const _hipQuat = new THREE.Quaternion();
const _leanQuat = new THREE.Quaternion();

export class SimpleBalanceSolver {
  constructor(options = {}) {
    this.maxCorrection = options.maxCorrection ?? 0.15;
    this.iterations = options.iterations ?? 3;
    this.maxLeanAngle = options.maxLeanAngle ?? 0.12;
    this.leanReferenceDistance = options.leanReferenceDistance ?? 0.3;
    this._hipLeanState = new WeakMap();
  }

  solve(vrm, plantedFeet, solve) {
    const hips = vrm?.humanoid?.getNormalizedBoneNode?.('hips') || null;
    const root = vrm?.scene || null;

    if (!plantedFeet?.length) {
      this._removeAppliedHipLean(hips);
      return { applied: false, correction: new THREE.Vector3() };
    }

    if (!hips && !root) {
      return { applied: false, correction: new THREE.Vector3() };
    }

    const plants = plantedFeet.map((p) => ({
      foot: p.foot,
      anchor: p.anchor ?? p.target,
      weight: p.weight ?? 1,
      axes: p.axes ?? { x: true, y: false, z: true },
    }));

    this._applyHipLean(hips, plants);

    return applyFootPlantHipOffset({
      hips,
      root,
      plantedFeet: plants,
      solve,
      iterations: this.iterations,
      maxCorrection: this.maxCorrection,
      axes: { x: true, y: false, z: true },
    });
  }

  _applyHipLean(hips, plants) {
    if (!hips) return;
    this._removeAppliedHipLean(hips);

    const planted = plants.filter((p) => p.foot && p.weight > 0);
    if (planted.length === 0 || this.maxLeanAngle <= 0) return;

    hips.getWorldPosition(_hipPos);

    let totalWeight = 0;
    _toFoot.set(0, 0, 0);

    for (const p of planted) {
      if (!p.foot) continue;
      p.foot.getWorldPosition(_footPos);
      _footPos.sub(_hipPos);
      _footPos.y = 0;
      _toFoot.addScaledVector(_footPos, p.weight);
      totalWeight += p.weight;
    }

    if (totalWeight <= 0) return;
    _toFoot.multiplyScalar(1 / totalWeight);

    const horizontalDist = Math.sqrt(_toFoot.x * _toFoot.x + _toFoot.z * _toFoot.z);
    if (horizontalDist < 1e-4) return;

    const leanAngle = Math.min(
      this.maxLeanAngle * (horizontalDist / this.leanReferenceDistance),
      this.maxLeanAngle,
    );

    const leanDir = _leanDir.set(_toFoot.x, 0, _toFoot.z).normalize();
    const axis = _leanAxis.set(-leanDir.z, 0, leanDir.x).normalize();
    const state = {
      baseLocalQuaternion: hips.quaternion.clone(),
      appliedLocalQuaternion: new THREE.Quaternion(),
    };

    _leanQuat.setFromAxisAngle(axis, leanAngle);
    hips.getWorldQuaternion(_hipQuat);
    _hipQuat.premultiply(_leanQuat);
    setWorldQuaternion(hips, _hipQuat);

    state.appliedLocalQuaternion.copy(hips.quaternion);
    this._hipLeanState.set(hips, state);
  }

  _removeAppliedHipLean(hips) {
    if (!hips) return false;

    const state = this._hipLeanState.get(hips);
    if (!state) return false;

    this._hipLeanState.delete(hips);
    if (!quaternionsNear(hips.quaternion, state.appliedLocalQuaternion)) return false;

    hips.quaternion.copy(state.baseLocalQuaternion);
    hips.updateWorldMatrix(true, true);
    return true;
  }
}

function quaternionsNear(a, b) {
  return Math.abs(1 - Math.abs(a.dot(b))) < 1e-6;
}
