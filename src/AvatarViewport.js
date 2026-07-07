import * as THREE from 'three';
import { disposeObject } from './utils.js';
import { Stage } from './Stage.js';
import { ModelLoader } from './ModelLoader.js';
import { Rig } from './Rig.js';
import { MoveSystem } from './MoveSystem.js';
import { FbxToAva } from './FbxToAva.js';
import { Avatar } from './Avatar.js';

export class AvatarViewport {
  constructor(container, callbacks = {}) {
    this.callbacks = callbacks;
    this.stage = new Stage(container);
    this.modelLoader = new ModelLoader();
    this.rig = new Rig(this.stage);
    this.moveSystem = new MoveSystem(this.stage, {
      onMoveStatus: (status) => this.callbacks.onMoveStatus?.(status),
    });

    this.timer = new THREE.Timer();
    this.frameId = null;
    this.avatar = null;
    this.currentObjectUrl = null;
    this.fbx = {
      root: null,
      mixer: null,
      path: null,
      playing: false,
    };
    this.avaMoves = [];
    this.useAvak = false;
    this.beatSync = false;
    this.avaBeatSync = false;
  }

  setBeatSync(enabled) {
    this.beatSync = Boolean(enabled);
    this.moveSystem.setBeatSync(enabled);
  }

  setAvaBeatSync(enabled) {
    this.avaBeatSync = Boolean(enabled);
    this.avatar?.setAvaBeatSync(enabled);
  }

  setUseAvak(enabled) {
    this.useAvak = enabled;
    this.avatar?.setUseAvak(enabled);
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
    this.timer.update();
    const delta = this.timer.getDelta();
    let rootRotated = false;

    if (this.stage.stage.autoRotate && this.avatar?.root) {
      this.avatar.root.rotation.y += delta * 0.22;
      this.avatar.root.updateWorldMatrix(true, true);
      rootRotated = true;
    }

    this.moveSystem.setBeatState(this.callbacks.getBeatState?.());
    this.avatar?.setBeatState(this.callbacks.getBeatState?.());

    if (this.moveSystem.move.playing) {
      this.moveSystem.update(delta);
    } else if (rootRotated && this.moveSystem.moveRig) {
      this.moveSystem.applyAtCurrentTime();
    }

    this.rig.applyManualBoneRotations('humanoid');

    if (this.fbx.playing && this.fbx.mixer) {
      this.fbx.mixer.update(delta);
    }

    if (this.avatar) {
      this.avatar.update(delta);
    }

    this.rig.applyManualBoneRotations('raw');
    this.rig.updateSelectedAxes();

    if (this.moveSystem.move.playing) {
      this.moveSystem.emitStatus();
    }

    if (this.avatar?.isAvaPlaying()) {
      this.callbacks.onAvaStatus?.(this.avatar.getAvaMoveStatus());
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
    if (this.avatar?.root) {
      this.stage.frameObject(this.avatar.root);
    }
  }

  resetPose() {
    this.avatar?.stopAnimation();
    this.stopFbxAnimation();
    this.moveSystem.setPlaying(false);
    this.moveSystem.reset();
    this.avatar?.resetPose();
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
      this.avatar = new Avatar(result.vrm, result.root, path, { useAvak: this.useAvak });
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

  async playFbxAnimation(path, label = path) {
    this.stopFbxAnimation();
    this.callbacks.onState?.('Loading FBX', 'loading');
    this.callbacks.onProgress?.('Loading animation...');

    try {
      const result = await this.modelLoader.loadFbxAnimation(path, label, (text) => {
        this.callbacks.onProgress?.(text);
      });
      if (!result || result.clips.length === 0) {
        throw new Error('No animation clips found');
      }

      if (this.avatar?.root) {
        this.avatar.root.visible = false;
      }

      this.fbx.root = result.root;
      this.fbx.path = path;
      this.stage.scene.add(result.root);
      this.fitFbxRoot(result.root);

      this.fbx.mixer = new THREE.AnimationMixer(result.root);
      result.clips.forEach((clip) => {
        const action = this.fbx.mixer.clipAction(clip);
        action.setEffectiveTimeScale(1);
        action.play();
      });
      this.fbx.playing = true;

      this.stage.frameObject(result.root);
      this.callbacks.onState?.('Playing FBX', 'ready');
      this.callbacks.onProgress?.('');
      return result;
    } catch (error) {
      console.error(error);
      this.stopFbxAnimation();
      this.callbacks.onState?.('Failed', 'error');
      this.callbacks.onProgress?.(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  stopFbxAnimation() {
    if (!this.fbx.root) return;

    if (this.fbx.mixer) {
      this.fbx.mixer.stopAllAction();
      this.fbx.mixer = null;
    }

    this.stage.scene.remove(this.fbx.root);
    disposeObject(this.fbx.root);
    this.fbx.root = null;
    this.fbx.path = null;
    this.fbx.playing = false;

    if (this.avatar?.root) {
      this.avatar.root.visible = true;
      this.stage.frameObject(this.avatar.root);
      this.callbacks.onState?.('Ready', 'ready');
    } else {
      this.callbacks.onState?.('No model', 'neutral');
    }
  }

  getFbxStatus() {
    return {
      ready: Boolean(this.fbx.root),
      playing: this.fbx.playing,
      path: this.fbx.path,
    };
  }

  fitFbxRoot(root) {
    if (!this.avatar?.root) return;

    const currentBox = new THREE.Box3().setFromObject(this.avatar.root);
    const currentHeight = currentBox.getSize(new THREE.Vector3()).y;
    if (currentHeight <= 0) return;

    const fbxBox = new THREE.Box3().setFromObject(root);
    const fbxHeight = fbxBox.getSize(new THREE.Vector3()).y;
    if (fbxHeight <= 0) return;

    const scale = currentHeight / fbxHeight;
    if (scale > 0 && scale < 100) {
      root.scale.setScalar(scale);
    }
  }

  clearCurrentModel() {
    this.stopFbxAnimation();
    this.avatar?.dispose();
    this.avatar = null;
    this.avaMoves = [];

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

  async loadAvaMoves(paths, onProgress = null) {
    const converter = new FbxToAva();
    const moves = [];
    for (let i = 0; i < paths.length; i++) {
      const { path, name } = paths[i];
      if (onProgress) onProgress(`Converting ${name}...`);
      try {
        const root = await this.modelLoader.fbxLoader.loadAsync(path);
        const ava = converter.convert(root, name, path);
        moves.push({ path, name, ava });
        disposeObject(root);
      } catch (error) {
        console.error(`Failed to convert ${name} to AVA`, error);
      }
    }
    if (onProgress) onProgress('');
    this.avaMoves = moves;
    return moves;
  }

  playAvaMove(name, kind = 'full') {
    if (!this.avatar) return false;

    const move = this.avaMoves.find((m) => m.name === name);
    if (!move) return false;

    this.moveSystem.setPlaying(false);
    return this.avatar.playAvaMove(move, kind);
  }

  stopAvaMove() {
    this.avatar?.stopAnimation();
  }

  getAvaStatus() {
    return {
      ready: this.avaMoves.length > 0,
      playing: this.avatar?.isAvaPlaying() || false,
      moveCount: this.avaMoves.length,
    };
  }

  getAvaMoves() {
    return this.avaMoves;
  }

  setAvaTimeScale(scale) {
    this.avatar?.setAvaTimeScale(scale);
  }

  getAvaMoveStatus() {
    return this.avatar?.getAvaMoveStatus() || { playing: false, time: 0, duration: 0 };
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
