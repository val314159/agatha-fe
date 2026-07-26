import * as THREE from 'three';
import {
  cloneLocks,
  cloneTarget,
  cloneTracks,
  collectTrackTimes,
  createAnimationClip,
  deriveTiming,
} from './playableAnimation.js';

const PLANT_HEIGHT_THRESHOLD = 0.05;
const PLANT_VELOCITY_THRESHOLD = 0.02;

const CONTACT_CHAINS = {
  leftFoot: { chainName: 'leftLeg', endBone: 'leftFoot' },
  rightFoot: { chainName: 'rightLeg', endBone: 'rightFoot' },
  leftToes: { chainName: 'leftLeg', endBone: 'leftFoot' },
  rightToes: { chainName: 'rightLeg', endBone: 'rightFoot' },
};

export class AvarToAvay {
  constructor(vrm, options = {}) {
    this.vrm = vrm || null;
    this.explicitGroundHeight = options.groundHeight;
    this.plantHeightThreshold = options.plantHeightThreshold ?? PLANT_HEIGHT_THRESHOLD;
    this.plantVelocityThreshold = options.plantVelocityThreshold ?? PLANT_VELOCITY_THRESHOLD;
  }

  bake(avar) {
    if (!avar?.tracks?.length) return null;

    const times = collectTrackTimes(avar.tracks);
    const timing = deriveTiming(times);
    const analysis = this.analyze(avar, times, timing);

    return {
      format: 'avay',
      version: '1.0',
      basis: 'analyzed',
      name: avar.name,
      source: avar.source,
      sourceFormat: avar.format,
      target: cloneTarget(avar.target),
      sourceUnitScale: avar.sourceUnitScale,
      sourceHipsHeight: avar.sourceHipsHeight,
      targetHipsHeight: avar.targetHipsHeight,
      positionScale: avar.positionScale,
      duration: avar.duration,
      tracks: cloneTracks(avar.tracks),
      locks: cloneLocks(avar.locks || []),
      analysis,
    };
  }

  analyze(avar, times, timing) {
    const analysis = {
      timing,
      thresholds: {
        plantHeight: this.plantHeightThreshold,
        plantVelocity: this.plantVelocityThreshold,
      },
      groundHeight: this.explicitGroundHeight ?? 0,
      contacts: [],
      footSamples: [],
    };

    if (!this.vrm || times.length === 0) {
      return analysis;
    }

    const locks = this.getContactLocks(avar.locks || []);
    if (locks.length === 0) {
      return analysis;
    }

    const rawSamples = this.sampleFootMotion(avar, times, locks);
    if (rawSamples.length === 0) {
      return analysis;
    }

    const groundHeight = this.explicitGroundHeight ?? Math.min(...rawSamples.map((sample) => sample.position[1]));
    const footSamples = rawSamples.map((sample) => {
      const height = sample.position[1] - groundHeight;
      const nearGround = Math.abs(height) < this.plantHeightThreshold;
      const slow = !Number.isFinite(sample.velocity) || sample.velocity < this.plantVelocityThreshold;
      return {
        ...sample,
        height,
        nearGround,
        slow,
        contact: sample.planted && nearGround && slow,
      };
    });

    analysis.groundHeight = groundHeight;
    analysis.footSamples = footSamples;
    analysis.contacts = this.buildContacts(footSamples, groundHeight);
    return analysis;
  }

  getContactLocks(locks) {
    return locks
      .map((lock) => {
        const contact = CONTACT_CHAINS[lock.bone];
        if (!contact) return null;
        return {
          bone: lock.bone,
          planted: lock.planted !== false,
          ...contact,
        };
      })
      .filter(Boolean);
  }

  sampleFootMotion(avar, times, locks) {
    const clip = createAnimationClip(avar);
    const mixer = new THREE.AnimationMixer(this.vrm.scene);
    const action = mixer.clipAction(clip);
    const previous = new Map();
    const samples = [];

    action.play();

    for (const time of times) {
      mixer.setTime(time);
      this.vrm.update?.(0);
      this.vrm.scene.updateWorldMatrix(true, true);

      for (const lock of locks) {
        const node = this.vrm.humanoid?.getNormalizedBoneNode(lock.endBone);
        if (!node) continue;

        const position = node.getWorldPosition(new THREE.Vector3());
        const prev = previous.get(lock.bone);
        const dt = prev ? time - prev.time : 0;
        const velocity = prev && dt > 0 ? position.distanceTo(prev.position) / dt : Infinity;

        samples.push({
          bone: lock.bone,
          chainName: lock.chainName,
          endBone: lock.endBone,
          planted: lock.planted,
          time,
          position: position.toArray(),
          velocity,
        });
        previous.set(lock.bone, { time, position: position.clone() });
      }
    }

    mixer.setTime(0);
    action.stop();
    mixer.stopAllAction();
    return samples;
  }

  buildContacts(samples, groundHeight) {
    const byBone = new Map();
    for (const sample of samples) {
      if (!byBone.has(sample.bone)) {
        byBone.set(sample.bone, []);
      }
      byBone.get(sample.bone).push(sample);
    }

    const contacts = [];
    for (const [bone, boneSamples] of byBone) {
      let active = null;
      let lastActiveSample = null;

      for (const sample of boneSamples) {
        if (sample.contact) {
          if (!active) {
            const anchor = sample.position.slice();
            anchor[1] = groundHeight;
            active = {
              bone,
              chainName: sample.chainName,
              endBone: sample.endBone,
              start: sample.time,
              endTime: sample.time,
              anchor,
              sampleCount: 0,
            };
          }

          active.endTime = sample.time;
          active.sampleCount += 1;
          lastActiveSample = sample;
        } else if (active) {
          active.end = lastActiveSample?.time ?? active.endTime;
          delete active.endTime;
          contacts.push(active);
          active = null;
          lastActiveSample = null;
        }
      }

      if (active) {
        active.end = lastActiveSample?.time ?? active.endTime;
        delete active.endTime;
        contacts.push(active);
      }
    }

    return contacts;
  }
}
