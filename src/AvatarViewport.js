import * as THREE from 'three';
import { disposeObject } from './utils.js';
import { Stage } from './Stage.js';
import { ModelLoader } from './ModelLoader.js';
import { Rig } from './Rig.js';
import { MoveSystem } from './MoveSystem.js';

export class AvatarViewport {
  constructor(container, callbacks = {}) {
    this.callbacks = callbacks;
    this.stage = new Stage(container);
    this.modelLoader = new ModelLoader();
    this.rig = new Rig(this.stage);
    this.moveSystem = new MoveSystem(this.stage, {
      onMoveStatus: (status) => this.callbacks.onMoveStatus?.(status),
    });

    this.clock = new THREE.Clock();
    this.frameId = null;
    this.currentRoot = null;
    this.currentVrm = null;
    this.currentObjectUrl = null;
  }

  start() {
    if (this.frameId) return;
    const tick = () => {
      this.frameId = requestAnimationFrame(tick);
      this.renderFrame();
    };
    tick();
  }

  stop() {
    if (!this.frameId) return;
    cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  renderFrame() {
    const delta = this.clock.getDelta();
    let rootRotated = false;

    if (this.stage.stage.autoRotate && this.currentRoot) {
      this.currentRoot.rotation.y += delta * 0.22;
      this.currentRoot.updateWorldMatrix(true, true);
      rootRotated = true;
    }

    if (this.moveSystem.move.playing) {
      this.moveSystem.update(delta);
    } else if (rootRotated && this.moveSystem.moveRig) {
      this.moveSystem.applyAtCurrentTime();
    }

    this.rig.applyManualBoneRotations('humanoid');
    if (this.currentVrm?.update) {
      this.currentVrm.update(delta);
    }
    this.rig.applyManualBoneRotations('raw');
    this.rig.updateSelectedAxes();

    if (this.moveSystem.move.playing) {
      this.moveSystem.emitStatus();
    }

    this.stage.render();
  }

  resize() {
    this.stage.resize();
  }

  setStage(settings) {
    this.stage.setStage(settings);
  }

  setAutoRotate(enabled) {
    this.stage.setAutoRotate(enabled);
  }

  resetCamera() {
    if (this.currentRoot) {
      this.stage.frameObject(this.currentRoot);
    }
  }

  async loadAvatar(path, label = path, options = {}) {
    const { objectUrl = null } = options;
    this.callbacks.onState?.('Loading', 'loading');
    this.callbacks.onProgress?.('Starting load...');

    try {
      const result = await this.modelLoader.loadAvatar(path, label, (text) => {
        this.callbacks.onProgress?.(text);
      });
      if (!result) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        return null;
      }

      this.clearCurrentModel();
      this.currentObjectUrl = objectUrl;
      this.currentRoot = result.root;
      this.currentVrm = result.vrm;
      this.stage.scene.add(result.root);
      this.rig.indexBones(result.root, result.vrm);
      this.moveSystem.setupMoveRig(result.root, result.vrm);
      this.stage.frameObject(result.root);

      this.callbacks.onModelLoaded?.(result);
      this.callbacks.onState?.('Ready', 'ready');
      this.callbacks.onProgress?.('');
      return result;
    } catch (error) {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      console.error(error);
      this.clearCurrentModel();
      this.callbacks.onModelLoaded?.({
        source: label,
        format: '-',
        root: null,
        stats: { meshes: 0, triangles: 0 },
      });
      this.callbacks.onState?.('Failed', 'error');
      this.callbacks.onProgress?.(error instanceof Error ? error.message : String(error));
      return null;
    }
  }

  loadLocalFile(file) {
    if (!file) return;
    const url = URL.createObjectURL(file);
    return this.loadAvatar(url, file.name, { objectUrl: url });
  }

  async inspectFbxAnimation(path, label = path) {
    try {
      return await this.modelLoader.inspectFbxAnimation(path, label, (text) => {
        this.callbacks.onProgress?.(text);
      });
    } catch (error) {
      console.error(error);
      this.callbacks.onProgress?.(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  clearCurrentModel() {
    if (this.currentRoot) {
      this.stage.scene.remove(this.currentRoot);
      disposeObject(this.currentRoot);
    }
    this.currentRoot = null;
    this.currentVrm = null;

    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }

    this.rig.clear();
    this.moveSystem.clear();
  }

  getMovePresets() {
    return this.moveSystem.getPresets();
  }

  getMoveStatus() {
    return this.moveSystem.getStatus();
  }

  setMovePreset(id) {
    this.moveSystem.setPreset(id);
  }

  setMovePlaying(playing) {
    this.moveSystem.setPlaying(playing);
  }

  setMoveSpeed(speed) {
    this.moveSystem.setSpeed(speed);
  }

  setMoveOptions(options) {
    this.moveSystem.setOptions(options);
  }

  resetMove() {
    this.moveSystem.reset();
  }

  getRigInfo(mode) {
    return this.rig.getRigInfo(mode);
  }

  selectBone(id, mode) {
    return this.rig.selectBone(id, mode);
  }

  setSelectedBoneRotation(rotationDegrees) {
    return this.rig.setSelectedBoneRotation(rotationDegrees);
  }

  resetSelectedBoneRotation() {
    return this.rig.resetSelectedBoneRotation();
  }

  setSkeletonVisible(visible) {
    this.rig.setSkeletonVisible(visible);
  }

  setSelectedAxesVisible(visible) {
    this.rig.setSelectedAxesVisible(visible);
  }
}
