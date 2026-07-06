import * as THREE from 'three';
import { applyFootPlantHipOffset, setWorldQuaternion } from './ik.js';

const _hipPos = new THREE.Vector3();
const _footPos = new THREE.Vector3();
const _toFoot = new THREE.Vector3();
const _hipQuat = new THREE.Quaternion();
const _leanQuat = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

export class SimpleBalanceSolver {
  constructor(options = {}) {
    this.maxCorrection = options.maxCorrection ?? 0.15;
    this.iterations = options.iterations ?? 3;
    this.maxLeanAngle = options.maxLeanAngle ?? 0.12;
  }

  solve(vrm, plantedFeet, solve) {
    if (!plantedFeet?.length) return { applied: false, correction: new THREE.Vector3() };

    const plants = plantedFeet.map((p) => ({
      foot: p.foot,
      anchor: p.anchor,
      weight: p.weight ?? 1,
      axes: p.axes ?? { x: true, y: false, z: true },
    }));

    const result = applyFootPlantHipOffset({
      hips: vrm.humanoid?.getNormalizedBoneNode('hips'),
      root: vrm.scene,
      plantedFeet: plants,
      solve,
      iterations: this.iterations,
      maxCorrection: this.maxCorrection,
      axes: { x: true, y: false, z: true },
    });

    this._applyHipLean(vrm, plants);

    return result;
  }

  _applyHipLean(vrm, plants) {
    const hips = vrm.humanoid?.getNormalizedBoneNode('hips');
    if (!hips) return;

    const planted = plants.filter((p) => p.weight > 0);
    if (planted.length === 0) return;

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
      this.maxLeanAngle * (horizontalDist / 0.3),
      this.maxLeanAngle,
    );

    const leanDir = _up.set(_toFoot.x, 0, _toFoot.z).normalize();
    const axis = _up.set(-leanDir.z, 0, leanDir.x).normalize();

    _leanQuat.setFromAxisAngle(axis, leanAngle);
    hips.getWorldQuaternion(_hipQuat);
    _hipQuat.premultiply(_leanQuat);
    setWorldQuaternion(hips, _hipQuat);
  }
}
