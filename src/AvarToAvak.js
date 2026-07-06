import * as THREE from 'three';

const GROUND_HEIGHT = 0;
const PLANT_THRESHOLD = 0.05;

export class AvarToAvak {
  constructor(vrm, options = {}) {
    if (!vrm) throw new Error('AvarToAvak requires a VRM instance');
    this.vrm = vrm;
    this.modelPath = options.modelPath ?? '';
  }

  bake(avar) {
    if (!avar?.tracks?.length) return null;

    this.diagnose(avar);

    return {
      ...avar,
      format: 'avak',
      version: '1.0',
      kind: avar.kind || 'full',
    };
  }

  diagnose(avar) {
    const clip = this.createClip(avar);
    const mixer = new THREE.AnimationMixer(this.vrm.scene);
    const action = mixer.clipAction(clip);
    action.play();
    action.paused = true;

    const times = this.collectTimes(avar.tracks);
    const leftFoot = this.vrm.humanoid?.getNormalizedBoneNode('leftFoot');
    const rightFoot = this.vrm.humanoid?.getNormalizedBoneNode('rightFoot');
    if (!leftFoot || !rightFoot) {
      console.log('[AVAK] No foot bones found, skipping diagnosis');
      return;
    }

    const pos = new THREE.Vector3();
    let leftBelow = 0, rightBelow = 0;
    let leftPlantable = 0, rightPlantable = 0;
    let minLeftY = Infinity, minRightY = Infinity;
    let maxLeftY = -Infinity, maxRightY = -Infinity;

    for (let i = 0; i < times.length; i++) {
      const t = times[i];
      action.time = t;
      mixer.update(0);
      this.vrm.update?.(0);
      this.vrm.scene.updateWorldMatrix(true, true);

      leftFoot.getWorldPosition(pos);
      const ly = pos.y;
      minLeftY = Math.min(minLeftY, ly);
      maxLeftY = Math.max(maxLeftY, ly);
      if (ly < GROUND_HEIGHT) leftBelow++;
      if (Math.abs(ly - GROUND_HEIGHT) < PLANT_THRESHOLD) leftPlantable++;

      rightFoot.getWorldPosition(pos);
      const ry = pos.y;
      minRightY = Math.min(minRightY, ry);
      maxRightY = Math.max(maxRightY, ry);
      if (ry < GROUND_HEIGHT) rightBelow++;
      if (Math.abs(ry - GROUND_HEIGHT) < PLANT_THRESHOLD) rightPlantable++;
    }

    action.stop();
    mixer.stopAllAction();

    const vrmLeftFootRest = new THREE.Vector3();
    const vrmRightFootRest = new THREE.Vector3();
    this.vrm.humanoid?.resetNormalizedPose?.();
    this.vrm.update?.(0);
    this.vrm.scene.updateWorldMatrix(true, true);
    leftFoot.getWorldPosition(vrmLeftFootRest);
    rightFoot.getWorldPosition(vrmRightFootRest);

    console.log(`[AVAK] Diagnose "${avar.name}" (${times.length} frames, ${(avar.duration).toFixed(2)}s)`);
    console.log(`[AVAK]   VRM rest:  left foot y=${vrmLeftFootRest.y.toFixed(3)}  right foot y=${vrmRightFootRest.y.toFixed(3)}`);
    console.log(`[AVAK]   Left foot:  y=[${minLeftY.toFixed(3)} .. ${maxLeftY.toFixed(3)}]  below ground: ${leftBelow}/${times.length}  plantable: ${leftPlantable}/${times.length}`);
    console.log(`[AVAK]   Right foot: y=[${minRightY.toFixed(3)} .. ${maxRightY.toFixed(3)}]  below ground: ${rightBelow}/${times.length}  plantable: ${rightPlantable}/${times.length}`);

    const locks = avar.locks || [];
    if (locks.length > 0) {
      const lockSummary = locks.map((l) => `${l.bone}=${l.planted ? 'planted' : 'free'}`).join(', ');
      console.log(`[AVAK]   Locks (${locks.length}): ${lockSummary}`);
    } else {
      console.log(`[AVAK]   Locks: none`);
    }

    if (leftBelow > 0 || rightBelow > 0) {
      console.log(`[AVAK]   ⚠ ${leftBelow + rightBelow} frames have feet below ground (y<${GROUND_HEIGHT}) — IK solve needed to lift feet`);
    }
    if (leftPlantable > 0 || rightPlantable > 0) {
      console.log(`[AVAK]   ${leftPlantable + rightPlantable} frames have feet near ground (|y-${GROUND_HEIGHT}|<${PLANT_THRESHOLD}) — IK plant detection would trigger`);
    }
    if (leftBelow === 0 && rightBelow === 0 && leftPlantable === 0 && rightPlantable === 0) {
      console.log(`[AVAK]   ✓ No foot planting or ground penetration detected — AVAR pass-through is correct`);
    }
  }

  createClip(avar) {
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
    return new THREE.AnimationClip(avar.name || 'avar', avar.duration, tracks);
  }

  collectTimes(tracks) {
    const timesSet = new Set();
    for (const track of tracks) {
      for (const t of track.times) {
        timesSet.add(t);
      }
    }
    return Array.from(timesSet).sort((a, b) => a - b);
  }
}
