import * as THREE from 'three';
import { applyFootPlantHipOffset } from './ik.js';

export class SimpleBalanceSolver {
  constructor(options = {}) {
    this.maxCorrection = options.maxCorrection ?? 0.05;
    this.iterations = options.iterations ?? 1;
  }

  solve(vrm, plantedFeet, solve) {
    if (!plantedFeet?.length) return { applied: false, correction: new THREE.Vector3() };

    const plants = plantedFeet.map((p) => ({
      foot: p.foot,
      anchor: p.anchor,
      weight: p.weight ?? 1,
      axes: p.axes ?? { x: true, y: false, z: true },
    }));

    return applyFootPlantHipOffset({
      hips: vrm.humanoid?.getNormalizedBoneNode('hips'),
      root: vrm.scene,
      plantedFeet: plants,
      solve,
      iterations: this.iterations,
      maxCorrection: this.maxCorrection,
      axes: { x: true, y: false, z: true },
    });
  }
}
