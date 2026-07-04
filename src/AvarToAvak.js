import * as THREE from 'three';
import {
  applyFootPlantHipOffset,
  captureFootPlant,
  getNormalizedLimbChain,
  solveLimbIK,
} from './ik.js';

const VRM_LIMB_CHAINS = {
  leftLeg: ['leftUpperLeg', 'leftLowerLeg', 'leftFoot'],
  rightLeg: ['rightUpperLeg', 'rightLowerLeg', 'rightFoot'],
  leftArm: ['leftUpperArm', 'leftLowerArm', 'leftHand'],
  rightArm: ['rightUpperArm', 'rightLowerArm', 'rightHand'],
};

const CHAIN_BONE_HUMAN_NAMES = Object.fromEntries(
  Object.entries(VRM_LIMB_CHAINS).flatMap(([chainName, bones]) =>
    bones.map((bone, index) => [bone, { chainName, index }])
  )
);

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

export class AvarToAvak {
  constructor(vrm, options = {}) {
    if (!vrm) throw new Error('AvarToAvak requires a VRM instance');
    this.vrm = vrm;
    this.modelPath = options.modelPath ?? '';
    this.groundHeight = options.groundHeight ?? 0;
    this.plantHeightThreshold = options.plantHeightThreshold ?? 0.05;
    this.plantVelocityThreshold = options.plantVelocityThreshold ?? 0.02;
    this.balanceSolver = options.balanceSolver ?? new SimpleBalanceSolver();
    this.iterations = options.iterations ?? 2;
  }

  bake(avar) {
    if (!avar?.tracks?.length) return null;

    const clip = this.createClip(avar);
    const mixer = new THREE.AnimationMixer(this.vrm.scene);
    const action = mixer.clipAction(clip);
    action.play();
    action.paused = true;

    const times = this.collectTimes(avar.tracks);
    const plantedLocks = this.detectPlantedLocks(avar.locks);
    const anchors = {};
    const prevFootPositions = {};

    const correctedKeyframes = new Map();
    for (const [chainName, bones] of Object.entries(VRM_LIMB_CHAINS)) {
      correctedKeyframes.set(chainName, {
        upperLeg: { times: [], values: [] },
        lowerLeg: { times: [], values: [] },
        end: { times: [], values: [] },
        wasActive: false,
      });
    }
    const hipKeyframes = { times: [], values: [] };

    for (let i = 0; i < times.length; i += 1) {
      const t = times[i];
      action.time = t;
      mixer.update(0);
      this.vrm.scene.updateWorldMatrix(true, true);

      this.updatePlantedStates(plantedLocks, prevFootPositions, anchors, t);

      const solve = () => {
        for (const lock of plantedLocks) {
          if (!lock.isActive || !lock.chain) continue;
          const limbChain = getNormalizedLimbChain(this.vrm, lock.chain.chainName);
          if (!limbChain) continue;
          solveLimbIK(limbChain, lock.anchor, null);
        }
      };

      for (let iter = 0; iter < this.iterations; iter += 1) {
        solve();
        if (this.balanceSolver) {
          const plantedFeet = this.getPlantedFeet(plantedLocks);
          this.balanceSolver.solve(this.vrm, plantedFeet, solve);
        }
      }

      this.extractLegKeyframes(plantedLocks, correctedKeyframes, t);
      this.extractHipKeyframe(hipKeyframes, t);
    }

    action.stop();
    mixer.stopAllAction();

    const newTracks = this.buildTracks(correctedKeyframes, hipKeyframes);
    const correctedBones = new Set(newTracks.map((track) => track.bone));
    const unchangedTracks = avar.tracks.filter((track) => !correctedBones.has(track.bone));

    return {
      format: 'avak',
      version: '1.0',
      name: avar.name,
      source: avar.source,
      target: avar.target,
      sourceUnitScale: avar.sourceUnitScale,
      sourceHipsHeight: avar.sourceHipsHeight,
      targetHipsHeight: avar.targetHipsHeight,
      positionScale: avar.positionScale,
      duration: avar.duration,
      tracks: [...unchangedTracks, ...newTracks],
      locks: avar.locks,
    };
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

  detectPlantedLocks(locks) {
    const plantedLocks = [];
    if (!locks) return plantedLocks;
    for (const lock of locks) {
      const chainName = this.getChainName(lock.bone);
      if (!chainName) continue;
      const chain = VRM_LIMB_CHAINS[chainName];
      plantedLocks.push({
        bone: lock.bone,
        chainName,
        chain: {
          chainName,
          upperLeg: chain[0],
          lowerLeg: chain[1],
          end: chain[2],
        },
        planted: lock.planted !== false,
        isActive: false,
        anchor: null,
      });
    }
    return plantedLocks;
  }

  getChainName(bone) {
    if (bone === 'leftFoot' || bone === 'leftToes') return 'leftLeg';
    if (bone === 'rightFoot' || bone === 'rightToes') return 'rightLeg';
    if (bone === 'leftHand') return 'leftArm';
    if (bone === 'rightHand') return 'rightArm';
    return null;
  }

  updatePlantedStates(plantedLocks, prevFootPositions, anchors, t) {
    for (const lock of plantedLocks) {
      if (!lock.chain) continue;
      const footNode = this.vrm.humanoid?.getNormalizedBoneNode(lock.chain.end);
      if (!footNode) continue;

      const position = new THREE.Vector3();
      footNode.getWorldPosition(position);
      const prev = prevFootPositions[lock.bone];
      const velocity = prev && t > 0 ? position.distanceTo(prev.position) / (t - prev.t) : Infinity;
      const nearGround = Math.abs(position.y - this.groundHeight) < this.plantHeightThreshold;
      const slow = !Number.isFinite(velocity) || velocity < this.plantVelocityThreshold;

      if (nearGround && slow) {
        if (!anchors[lock.bone]) {
          anchors[lock.bone] = position.clone();
          anchors[lock.bone].y = this.groundHeight;
        }
        lock.isActive = true;
        lock.anchor = anchors[lock.bone];
      } else {
        lock.isActive = false;
        lock.anchor = null;
      }

      prevFootPositions[lock.bone] = { position: position.clone(), t };
    }
  }

  getPlantedFeet(plantedLocks) {
    return plantedLocks
      .filter((lock) => lock.planted && lock.isActive && lock.chain)
      .map((lock) => {
        const foot = this.vrm.humanoid?.getNormalizedBoneNode(lock.chain.end);
        if (!foot || !lock.anchor) return null;
        return captureFootPlant(foot, { anchor: lock.anchor, weight: 1 });
      })
      .filter(Boolean);
  }

  extractLegKeyframes(plantedLocks, correctedKeyframes, t) {
    for (const lock of plantedLocks) {
      if (!lock.chain || !lock.isActive) continue;
      const upper = this.vrm.humanoid?.getNormalizedBoneNode(lock.chain.upperLeg);
      const lower = this.vrm.humanoid?.getNormalizedBoneNode(lock.chain.lowerLeg);
      const end = this.vrm.humanoid?.getNormalizedBoneNode(lock.chain.end);
      if (!upper || !lower || !end) continue;

      const kfs = correctedKeyframes.get(lock.chainName);
      kfs.wasActive = true;
      kfs.upperLeg.times.push(t);
      kfs.upperLeg.values.push(
        upper.quaternion.x,
        upper.quaternion.y,
        upper.quaternion.z,
        upper.quaternion.w
      );
      kfs.lowerLeg.times.push(t);
      kfs.lowerLeg.values.push(
        lower.quaternion.x,
        lower.quaternion.y,
        lower.quaternion.z,
        lower.quaternion.w
      );
      kfs.end.times.push(t);
      kfs.end.values.push(
        end.quaternion.x,
        end.quaternion.y,
        end.quaternion.z,
        end.quaternion.w
      );
    }
  }

  extractHipKeyframe(hipKeyframes, t) {
    const hips = this.vrm.humanoid?.getNormalizedBoneNode('hips');
    if (!hips) return;
    hipKeyframes.times.push(t);
    hipKeyframes.values.push(hips.position.x, hips.position.y, hips.position.z);
  }

  buildTracks(correctedKeyframes, hipKeyframes) {
    const tracks = [];
    for (const [chainName, bones] of Object.entries(VRM_LIMB_CHAINS)) {
      const kfs = correctedKeyframes.get(chainName);
      if (!kfs) continue;

      if (kfs.upperLeg.times.length > 0) {
        tracks.push({
          bone: bones[0],
          property: 'quaternion',
          times: kfs.upperLeg.times.slice(),
          values: kfs.upperLeg.values.slice(),
        });
      }
      if (kfs.lowerLeg.times.length > 0) {
        tracks.push({
          bone: bones[1],
          property: 'quaternion',
          times: kfs.lowerLeg.times.slice(),
          values: kfs.lowerLeg.values.slice(),
        });
      }
      if (kfs.end.times.length > 0) {
        tracks.push({
          bone: bones[2],
          property: 'quaternion',
          times: kfs.end.times.slice(),
          values: kfs.end.values.slice(),
        });
      }
    }

    if (hipKeyframes.times.length > 0) {
      tracks.push({
        bone: 'hips',
        property: 'position',
        times: hipKeyframes.times.slice(),
        values: hipKeyframes.values.slice(),
      });
    }

    return tracks;
  }
}
