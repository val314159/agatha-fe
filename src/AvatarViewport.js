import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import {
  applyFootPlantHipOffset,
  applyWorldOffset,
  getNormalizedLimbChain,
  solveLimbIK,
} from './ik.js';
import { MOVE_PRESETS, getMovePreset } from './movePresets.js';

const HUMANOID_BONE_NAMES = [
  'hips',
  'spine',
  'chest',
  'upperChest',
  'neck',
  'head',
  'leftEye',
  'rightEye',
  'jaw',
  'leftUpperLeg',
  'leftLowerLeg',
  'leftFoot',
  'leftToes',
  'rightUpperLeg',
  'rightLowerLeg',
  'rightFoot',
  'rightToes',
  'leftShoulder',
  'leftUpperArm',
  'leftLowerArm',
  'leftHand',
  'rightShoulder',
  'rightUpperArm',
  'rightLowerArm',
  'rightHand',
  'leftThumbMetacarpal',
  'leftThumbProximal',
  'leftThumbDistal',
  'leftIndexProximal',
  'leftIndexIntermediate',
  'leftIndexDistal',
  'leftMiddleProximal',
  'leftMiddleIntermediate',
  'leftMiddleDistal',
  'leftRingProximal',
  'leftRingIntermediate',
  'leftRingDistal',
  'leftLittleProximal',
  'leftLittleIntermediate',
  'leftLittleDistal',
  'rightThumbMetacarpal',
  'rightThumbProximal',
  'rightThumbDistal',
  'rightIndexProximal',
  'rightIndexIntermediate',
  'rightIndexDistal',
  'rightMiddleProximal',
  'rightMiddleIntermediate',
  'rightMiddleDistal',
  'rightRingProximal',
  'rightRingIntermediate',
  'rightRingDistal',
  'rightLittleProximal',
  'rightLittleIntermediate',
  'rightLittleDistal',
];
const ROTATION_AXES = ['x', 'y', 'z'];
const MOVE_HELPERS = [
  ['leftHand', 0xe38b29],
  ['rightHand', 0xe38b29],
  ['leftFoot', 0x247c87],
  ['rightFoot', 0x247c87],
  ['leftElbowPole', 0x7657c9],
  ['rightElbowPole', 0x7657c9],
  ['leftKneePole', 0x2f7d55],
  ['rightKneePole', 0x2f7d55],
];
const FOOT_PLANT_AXES = { x: true, y: false, z: true };

export class AvatarViewport {
  constructor(container, callbacks = {}) {
    this.container = container;
    this.callbacks = callbacks;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
    this.camera.position.set(0, 1.35, 3.2);

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.target.set(0, 1.2, 0);
    this.controls.minDistance = 0.35;
    this.controls.maxDistance = 12;

    this.keyLight = new THREE.DirectionalLight(0xffffff, 2.3);
    this.keyLight.position.set(2.5, 4, 3);
    this.scene.add(this.keyLight);

    this.hemiLight = new THREE.HemisphereLight(0xddeeff, 0x887766, 1.7);
    this.scene.add(this.hemiLight);

    this.loader = new GLTFLoader();
    this.loader.register((parser) => new VRMLoaderPlugin(parser));

    this.clock = new THREE.Clock();
    this.currentRoot = null;
    this.currentVrm = null;
    this.currentObjectUrl = null;
    this.loadToken = 0;
    this.frameId = null;
    this.rawBoneMap = new Map();
    this.humanoidBoneMap = new Map();
    this.skeletonHelper = null;
    this.skeletonVisible = false;
    this.selectedAxesHelper = null;
    this.selectedAxesVisible = true;
    this.selectedBone = null;
    this.selectedBoneEntry = null;
    this.manualBoneRotations = new Map();
    this.moveRig = null;
    this.moveFootPlants = new Map();
    this.moveHelperGroup = null;
    this.moveHelpers = new Map();
    this.moveStatus = null;
    this.move = {
      presetId: MOVE_PRESETS[0].id,
      playing: false,
      time: 0,
      speed: 1,
      showHelpers: true,
      footLock: true,
    };

    this.stage = {
      backgroundColor: '#f4f7f8',
      gridVisible: true,
      gridSize: 4,
      keyLightIntensity: 2.3,
      hemiLightIntensity: 1.7,
      autoRotate: true,
    };
    this.grid = null;
    this.setStage(this.stage);
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

    this.updateMove(delta);
    this.applyManualBoneRotations('humanoid');
    if (this.currentVrm?.update) {
      this.currentVrm.update(delta);
    }
    this.applyManualBoneRotations('raw');
    if (this.selectedBone && this.selectedAxesHelper) {
      this.selectedBone.updateWorldMatrix(true, false);
      this.selectedBone.getWorldPosition(this.selectedAxesHelper.position);
      this.selectedBone.getWorldQuaternion(this.selectedAxesHelper.quaternion);
    }
    if (this.stage.autoRotate && this.currentRoot) {
      this.currentRoot.rotation.y += delta * 0.22;
    }

    if (this.move.playing) {
      this.emitMoveStatus();
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  resize() {
    const rect = this.container.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  setStage(settings = {}) {
    this.stage = {
      ...this.stage,
      ...settings,
    };
    this.scene.background = new THREE.Color(this.stage.backgroundColor);
    this.keyLight.intensity = this.stage.keyLightIntensity;
    this.hemiLight.intensity = this.stage.hemiLightIntensity;
    this.updateGrid();
  }

  setAutoRotate(enabled) {
    this.setStage({ autoRotate: Boolean(enabled) });
  }

  updateGrid() {
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.geometry?.dispose();
      const material = this.grid.material ? [this.grid.material].flat() : [];
      material.forEach((item) => item.dispose?.());
      this.grid = null;
    }

    if (!this.stage.gridVisible) {
      return;
    }

    this.grid = new THREE.GridHelper(
      this.stage.gridSize,
      Math.max(4, this.stage.gridSize * 5),
      0x9aa6a8,
      0xd7dddf,
    );
    this.grid.position.y = 0;
    this.scene.add(this.grid);
  }

  async loadAvatar(path, label = path, options = {}) {
    const { objectUrl = null } = options;
    const token = ++this.loadToken;
    this.callbacks.onState?.('Loading', 'loading');
    this.callbacks.onProgress?.('Starting load...');

    try {
      const gltf = await this.loader.loadAsync(path, (event) => {
        if (event.total > 0) {
          const percent = Math.round((event.loaded / event.total) * 100);
          this.callbacks.onProgress?.(`Loading ${percent}%`);
        } else if (event.loaded) {
          this.callbacks.onProgress?.(
            `${Math.round(event.loaded / 1024).toLocaleString()} KB loaded`,
          );
        }
      });

      if (token !== this.loadToken) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        return null;
      }

      this.clearCurrentModel();
      this.currentObjectUrl = objectUrl;

      const vrm = gltf.userData?.vrm || null;
      const root = vrm ? vrm.scene : gltf.scene;

      if (vrm) {
        this.currentVrm = vrm;
        VRMUtils.rotateVRM0?.(vrm);
      }

      this.currentRoot = root;
      this.scene.add(root);
      this.indexBones();
      this.setupMoveRig();
      this.refreshSkeletonHelper();
      this.frameObject(root);

      const result = {
        source: label,
        format: inferFormat(path, gltf),
        root,
        stats: getModelStats(root),
      };
      this.callbacks.onModelLoaded?.(result);
      this.callbacks.onState?.('Ready', 'ready');
      this.callbacks.onProgress?.('');
      return result;
    } catch (error) {
      if (token !== this.loadToken) {
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        return null;
      }
      console.error(error);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
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
    const url = URL.createObjectURL(file);
    return this.loadAvatar(url, file.name, { objectUrl: url });
  }

  resetCamera() {
    if (this.currentRoot) {
      this.frameObject(this.currentRoot);
    }
  }

  getMovePresets() {
    return MOVE_PRESETS.map((move) => ({
      id: move.id,
      name: move.name,
    }));
  }

  getMoveStatus() {
    if (this.moveStatus) {
      return {
        ...this.moveStatus,
        correction: { ...this.moveStatus.correction },
        plantedFeet: [...this.moveStatus.plantedFeet],
      };
    }

    const preset = getMovePreset(this.move.presetId);
    return {
      ready: Boolean(this.moveRig),
      playing: this.move.playing,
      presetId: preset.id,
      presetName: preset.name,
      time: this.move.time,
      phase: 0,
      footLock: this.move.footLock,
      showHelpers: this.move.showHelpers,
      plantedFeet: [],
      correction: { x: 0, y: 0, z: 0 },
    };
  }

  setMovePreset(id) {
    const preset = getMovePreset(id);
    this.move.presetId = preset.id;
    this.move.time = 0;
    this.moveFootPlants.clear();
    this.applyMoveAtCurrentTime();
    this.emitMoveStatus();
  }

  setMovePlaying(playing) {
    this.move.playing = Boolean(playing && this.moveRig);
    if (this.move.playing) {
      this.moveFootPlants.clear();
    }
    this.updateMoveHelpersVisibility();
    this.emitMoveStatus();
  }

  setMoveSpeed(speed) {
    const value = Number(speed);
    this.move.speed = Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0.15, 2.5) : 1;
    this.emitMoveStatus();
  }

  setMoveOptions(options = {}) {
    if (typeof options.showHelpers === 'boolean') {
      this.move.showHelpers = options.showHelpers;
    }
    if (typeof options.footLock === 'boolean') {
      this.move.footLock = options.footLock;
      this.moveFootPlants.clear();
    }
    this.updateMoveHelpersVisibility();
    this.emitMoveStatus();
  }

  resetMove() {
    this.move.time = 0;
    this.move.playing = false;
    this.moveFootPlants.clear();
    this.currentVrm?.humanoid?.resetNormalizedPose?.();
    this.currentVrm?.update?.(0);
    this.clearMoveHelperPositions();
    this.updateMoveHelpersVisibility();
    this.emitMoveStatus();
  }

  getRigInfo(mode = 'humanoid') {
    const map = mode === 'raw' ? this.rawBoneMap : this.humanoidBoneMap;
    return {
      mode,
      bones: [...map.values()].map((entry) => ({
        id: entry.id,
        name: entry.name,
        sourceName: entry.sourceName,
        parentName: entry.bone.parent?.name || '-',
        childCount: entry.bone.children.length,
        selected: entry.bone === this.selectedBone,
      })),
    };
  }

  selectBone(id, mode = 'humanoid') {
    const map = mode === 'raw' ? this.rawBoneMap : this.humanoidBoneMap;
    const entry = map.get(id) || null;
    this.selectedBone = entry?.bone || null;
    this.selectedBoneEntry = entry;
    this.updateSelectedAxes();
    return entry ? this.getBoneDetails(entry) : null;
  }

  setSelectedBoneRotation(rotationDegrees) {
    if (!this.selectedBoneEntry) return null;

    const entry = this.selectedBoneEntry;
    const rotation = normalizeRotationDegrees(rotationDegrees, entry.bone.rotation);
    const key = getBoneEntryKey(entry);

    this.manualBoneRotations.set(key, {
      mode: entry.mode,
      bone: entry.bone,
      rotation,
    });
    this.applyBoneRotation(entry.bone, rotation);

    if (entry.mode === 'humanoid') {
      this.currentVrm?.update?.(0);
    }

    entry.bone.updateWorldMatrix(true, false);
    this.updateSelectedAxes();
    return this.getBoneDetails(entry);
  }

  resetSelectedBoneRotation() {
    if (!this.selectedBoneEntry) return null;

    const entry = this.selectedBoneEntry;
    this.manualBoneRotations.delete(getBoneEntryKey(entry));
    entry.bone.quaternion.copy(entry.restQuaternion);

    if (entry.mode === 'humanoid') {
      this.currentVrm?.update?.(0);
    }

    entry.bone.updateWorldMatrix(true, false);
    this.updateSelectedAxes();
    return this.getBoneDetails(entry);
  }

  setSkeletonVisible(visible) {
    this.skeletonVisible = Boolean(visible);
    this.refreshSkeletonHelper();
  }

  setSelectedAxesVisible(visible) {
    this.selectedAxesVisible = Boolean(visible);
    this.updateSelectedAxes();
  }

  indexBones() {
    this.rawBoneMap = new Map();
    this.humanoidBoneMap = new Map();
    this.selectedBone = null;
    this.selectedBoneEntry = null;
    this.manualBoneRotations = new Map();

    if (!this.currentRoot) return;

    this.currentRoot.traverse((object) => {
      if (!object.isBone) return;
      this.rawBoneMap.set(object.uuid, {
        id: object.uuid,
        mode: 'raw',
        name: object.name || object.uuid,
        sourceName: object.name || object.uuid,
        bone: object,
        restQuaternion: object.quaternion.clone(),
      });
    });

    const humanoid = this.currentVrm?.humanoid;
    if (!humanoid) return;

    HUMANOID_BONE_NAMES.forEach((name) => {
      const bone = getHumanoidBoneNode(humanoid, name);
      if (!bone) return;
      this.humanoidBoneMap.set(name, {
        id: name,
        mode: 'humanoid',
        name,
        sourceName: bone.name || name,
        bone,
        restQuaternion: bone.quaternion.clone(),
      });
    });
  }

  setupMoveRig() {
    this.moveRig = null;
    this.moveFootPlants.clear();
    this.clearMoveHelperPositions();

    const humanoid = this.currentVrm?.humanoid;
    if (!humanoid || !this.currentRoot) {
      this.updateMoveHelpersVisibility();
      this.emitMoveStatus();
      return;
    }

    humanoid.resetNormalizedPose?.();
    this.currentVrm?.update?.(0);
    this.currentRoot.updateWorldMatrix(true, true);

    const chains = {
      leftArm: getNormalizedLimbChain(this.currentVrm, 'leftArm'),
      rightArm: getNormalizedLimbChain(this.currentVrm, 'rightArm'),
      leftLeg: getNormalizedLimbChain(this.currentVrm, 'leftLeg'),
      rightLeg: getNormalizedLimbChain(this.currentVrm, 'rightLeg'),
    };
    const hips = getHumanoidBoneNode(humanoid, 'hips');
    const chest = getHumanoidBoneNode(humanoid, 'chest') || getHumanoidBoneNode(humanoid, 'spine');
    const head = getHumanoidBoneNode(humanoid, 'head');

    if (!hips || !chest || !head || Object.values(chains).some((chain) => !chain)) {
      this.updateMoveHelpersVisibility();
      this.emitMoveStatus();
      return;
    }

    const box = new THREE.Box3().setFromObject(this.currentRoot);
    const size = box.getSize(new THREE.Vector3());
    const scale = Math.max(size.y || 0, 1);

    this.moveRig = {
      humanoid,
      chains,
      bones: { hips, chest, head },
      metrics: { scale },
      rest: {
        hips: getWorldPosition(hips),
        chest: getWorldPosition(chest),
        head: getWorldPosition(head),
        leftHandRest: getWorldPosition(chains.leftArm.end),
        rightHandRest: getWorldPosition(chains.rightArm.end),
        leftFootRest: getWorldPosition(chains.leftLeg.end),
        rightFootRest: getWorldPosition(chains.rightLeg.end),
        hipsQuaternion: hips.quaternion.clone(),
        chestQuaternion: chest.quaternion.clone(),
        headQuaternion: head.quaternion.clone(),
      },
    };

    this.ensureMoveHelpers();
    this.applyMoveAtCurrentTime();
    this.updateMoveHelpersVisibility();
    this.emitMoveStatus();
  }

  updateMove(delta) {
    if (!this.moveRig || !this.move.playing) return;

    this.move.time += delta * this.move.speed;
    this.applyMoveAtCurrentTime();
  }

  applyMoveAtCurrentTime() {
    if (!this.moveRig || !this.currentVrm) return;

    const preset = getMovePreset(this.move.presetId);
    const sample = preset.sample(this.move.time, preset.tempo);
    const correction = this.applyMoveSample(sample);

    this.moveStatus = {
      ready: true,
      playing: this.move.playing,
      presetId: preset.id,
      presetName: preset.name,
      time: this.move.time,
      phase: sample.phase || 0,
      footLock: this.move.footLock,
      showHelpers: this.move.showHelpers,
      plantedFeet: [...this.moveFootPlants.keys()],
      correction: vectorToObject(correction),
    };
  }

  applyMoveSample(sample) {
    const rig = this.moveRig;
    const helperPoints = new Map();

    rig.humanoid.resetNormalizedPose?.();
    this.currentRoot.updateWorldMatrix(true, true);

    this.applyMoveBody(sample);
    this.currentRoot.updateWorldMatrix(true, true);

    const handTargets = {
      left: this.resolveMovePoint(sample.hands.left),
      right: this.resolveMovePoint(sample.hands.right),
    };
    const handPoles = {
      left: this.resolveMovePoint(sample.handPoles.left),
      right: this.resolveMovePoint(sample.handPoles.right),
    };
    const footTargets = {
      left: this.resolveFootTarget('left', sample.feet.left, rig.chains.leftLeg.end),
      right: this.resolveFootTarget('right', sample.feet.right, rig.chains.rightLeg.end),
    };
    const footPoles = {
      left: this.resolveMovePoint(sample.footPoles.left),
      right: this.resolveMovePoint(sample.footPoles.right),
    };

    helperPoints.set('leftHand', handTargets.left);
    helperPoints.set('rightHand', handTargets.right);
    helperPoints.set('leftFoot', footTargets.left);
    helperPoints.set('rightFoot', footTargets.right);
    helperPoints.set('leftElbowPole', handPoles.left);
    helperPoints.set('rightElbowPole', handPoles.right);
    helperPoints.set('leftKneePole', footPoles.left);
    helperPoints.set('rightKneePole', footPoles.right);

    const solve = () => {
      solveLimbIK(rig.chains.leftArm, handTargets.left, handPoles.left);
      solveLimbIK(rig.chains.rightArm, handTargets.right, handPoles.right);
      solveLimbIK(rig.chains.leftLeg, footTargets.left, footPoles.left);
      solveLimbIK(rig.chains.rightLeg, footTargets.right, footPoles.right);
    };

    solve();
    let correction = new THREE.Vector3();
    const plantedFeet = [...this.moveFootPlants.values()];
    if (this.move.footLock && plantedFeet.length > 0) {
      const result = applyFootPlantHipOffset({
        hips: rig.bones.hips,
        plantedFeet,
        solve,
        iterations: 2,
        maxCorrection: rig.metrics.scale * 0.05,
        axes: FOOT_PLANT_AXES,
      });
      correction = result.correction;
    }

    this.updateMoveHelpers(helperPoints);
    return correction;
  }

  applyMoveBody(sample) {
    const rig = this.moveRig;
    const hipsOffset = this.vectorFromMoveOffset(sample.hips || {});

    applyLocalRotationOffset(rig.bones.hips, rig.rest.hipsQuaternion, sample.hips);
    applyWorldOffset(rig.bones.hips, hipsOffset);

    applyLocalRotationOffset(rig.bones.chest, rig.rest.chestQuaternion, sample.chest);
    applyLocalRotationOffset(rig.bones.head, rig.rest.headQuaternion, sample.head);
  }

  resolveFootTarget(side, spec, foot) {
    const target = this.resolveMovePoint(spec);
    const plantKey = side === 'left' ? 'leftFoot' : 'rightFoot';

    if (!this.move.footLock || !spec.planted) {
      this.moveFootPlants.delete(plantKey);
      return target;
    }

    if (!this.moveFootPlants.has(plantKey)) {
      this.moveFootPlants.set(plantKey, {
        foot,
        anchor: target.clone(),
        weight: 1,
        axes: FOOT_PLANT_AXES,
      });
    }

    return this.moveFootPlants.get(plantKey).anchor.clone();
  }

  resolveMovePoint(spec) {
    if (spec.space === 'blend') {
      const a = this.resolveMovePoint(spec.a);
      const b = this.resolveMovePoint(spec.b);
      return a.lerp(b, spec.amount);
    }

    const base = this.getMoveSpacePosition(spec.space);
    return base.add(this.vectorFromMoveOffset(spec));
  }

  getMoveSpacePosition(space) {
    const rig = this.moveRig;
    if (rig.rest[space]) return rig.rest[space].clone();

    if (space === 'hips') return getWorldPosition(rig.bones.hips);
    if (space === 'chest') return getWorldPosition(rig.bones.chest);
    if (space === 'head') return getWorldPosition(rig.bones.head);

    return rig.rest.hips.clone();
  }

  vectorFromMoveOffset(offset = {}) {
    const axes = this.getMoveAxes();
    const scale = this.moveRig?.metrics.scale || 1;

    return new THREE.Vector3()
      .addScaledVector(axes.right, (offset.x || 0) * scale)
      .addScaledVector(axes.up, (offset.y || 0) * scale)
      .addScaledVector(axes.forward, (offset.z || 0) * scale);
  }

  getMoveAxes() {
    const quaternion = new THREE.Quaternion();
    this.currentRoot?.getWorldQuaternion(quaternion);

    return {
      right: new THREE.Vector3(1, 0, 0).applyQuaternion(quaternion).normalize(),
      up: new THREE.Vector3(0, 1, 0),
      forward: new THREE.Vector3(0, 0, 1).applyQuaternion(quaternion).normalize(),
    };
  }

  ensureMoveHelpers() {
    if (this.moveHelperGroup) return;

    this.moveHelperGroup = new THREE.Group();
    this.moveHelperGroup.name = 'Move IK Helpers';
    this.scene.add(this.moveHelperGroup);

    MOVE_HELPERS.forEach(([key, color]) => {
      const helper = new THREE.Mesh(
        new THREE.SphereGeometry(0.025, 12, 8),
        new THREE.MeshBasicMaterial({
          color,
          depthTest: false,
          transparent: true,
          opacity: 0.86,
        }),
      );
      helper.renderOrder = 3;
      helper.visible = false;
      this.moveHelpers.set(key, helper);
      this.moveHelperGroup.add(helper);
    });
  }

  updateMoveHelpers(points) {
    this.ensureMoveHelpers();
    this.moveHelpers.forEach((helper, key) => {
      const point = points.get(key);
      helper.visible = Boolean(point);
      if (point) helper.position.copy(point);
    });
    this.updateMoveHelpersVisibility();
  }

  clearMoveHelperPositions() {
    this.moveHelpers.forEach((helper) => {
      helper.visible = false;
    });
  }

  updateMoveHelpersVisibility() {
    if (!this.moveHelperGroup) return;
    this.moveHelperGroup.visible = Boolean(this.move.showHelpers && this.moveRig);
  }

  disposeMoveHelpers() {
    if (!this.moveHelperGroup) return;
    this.scene.remove(this.moveHelperGroup);
    this.moveHelpers.forEach((helper) => {
      helper.geometry?.dispose?.();
      helper.material?.dispose?.();
    });
    this.moveHelpers.clear();
    this.moveHelperGroup = null;
  }

  emitMoveStatus() {
    this.callbacks.onMoveStatus?.(this.getMoveStatus());
  }

  applyManualBoneRotations(mode) {
    this.manualBoneRotations.forEach((override) => {
      if (override.mode !== mode) return;
      this.applyBoneRotation(override.bone, override.rotation);
    });
  }

  applyBoneRotation(bone, rotationDegrees) {
    bone.rotation.set(
      THREE.MathUtils.degToRad(rotationDegrees.x),
      THREE.MathUtils.degToRad(rotationDegrees.y),
      THREE.MathUtils.degToRad(rotationDegrees.z),
      bone.rotation.order,
    );
  }

  getBoneDetails(entry) {
    const localPosition = entry.bone.position;
    const localRotation = entry.bone.rotation;
    const worldPosition = new THREE.Vector3();
    entry.bone.getWorldPosition(worldPosition);

    return {
      id: entry.id,
      name: entry.name,
      sourceName: entry.sourceName,
      parentName: entry.bone.parent?.name || '-',
      childCount: entry.bone.children.length,
      localPosition: vectorToObject(localPosition),
      localRotation: {
        x: THREE.MathUtils.radToDeg(localRotation.x),
        y: THREE.MathUtils.radToDeg(localRotation.y),
        z: THREE.MathUtils.radToDeg(localRotation.z),
      },
      worldPosition: vectorToObject(worldPosition),
    };
  }

  refreshSkeletonHelper() {
    if (this.skeletonHelper) {
      this.scene.remove(this.skeletonHelper);
      this.skeletonHelper.dispose?.();
      this.skeletonHelper = null;
    }

    if (!this.skeletonVisible || !this.currentRoot) {
      return;
    }

    this.skeletonHelper = new THREE.SkeletonHelper(this.currentRoot);
    this.skeletonHelper.material.depthTest = false;
    this.skeletonHelper.material.transparent = true;
    this.skeletonHelper.material.opacity = 0.75;
    this.scene.add(this.skeletonHelper);
  }

  updateSelectedAxes() {
    if (!this.selectedAxesHelper) {
      this.selectedAxesHelper = new THREE.AxesHelper(0.16);
      this.selectedAxesHelper.renderOrder = 2;
      this.scene.add(this.selectedAxesHelper);
    }

    this.selectedAxesHelper.visible = Boolean(this.selectedBone && this.selectedAxesVisible);
    if (!this.selectedBone || !this.selectedAxesHelper.visible) {
      return;
    }

    this.selectedBone.updateWorldMatrix(true, false);
    this.selectedBone.getWorldPosition(this.selectedAxesHelper.position);
    this.selectedBone.getWorldQuaternion(this.selectedAxesHelper.quaternion);
  }

  frameObject(object) {
    const box = new THREE.Box3().setFromObject(object);
    if (box.isEmpty()) {
      this.camera.position.set(0, 1.35, 3.2);
      this.controls.target.set(0, 1.2, 0);
      this.controls.update();
      return;
    }

    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const maxSize = Math.max(size.x, size.y, size.z);
    const distance = maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2));
    const viewDistance = Math.max(distance * 1.35, 1.4);

    this.controls.target.copy(center);
    this.camera.position.set(center.x, center.y + maxSize * 0.12, center.z + viewDistance);
    this.camera.near = Math.max(viewDistance / 100, 0.01);
    this.camera.far = Math.max(viewDistance * 100, 100);
    this.camera.updateProjectionMatrix();
    this.controls.update();
  }

  clearCurrentModel() {
    this.move.playing = false;
    this.moveRig = null;
    this.moveFootPlants.clear();
    this.moveStatus = null;
    this.disposeMoveHelpers();

    if (this.currentRoot) {
      this.scene.remove(this.currentRoot);
      disposeObject(this.currentRoot);
    }
    this.currentRoot = null;
    this.currentVrm = null;
    this.rawBoneMap = new Map();
    this.humanoidBoneMap = new Map();
    this.selectedBone = null;
    this.selectedBoneEntry = null;
    this.manualBoneRotations = new Map();
    this.updateSelectedAxes();

    if (this.skeletonHelper) {
      this.scene.remove(this.skeletonHelper);
      this.skeletonHelper.dispose?.();
      this.skeletonHelper = null;
    }

    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
  }
}

function getHumanoidBoneNode(humanoid, name) {
  const node = humanoid.getNormalizedBoneNode?.(name);
  if (node) return node;

  const bone = humanoid.getNormalizedBone?.(name);
  return bone?.node || bone || null;
}

function getBoneEntryKey(entry) {
  return `${entry.mode}:${entry.id}`;
}

function normalizeRotationDegrees(rotationDegrees = {}, fallbackRotation) {
  const fallback = {
    x: THREE.MathUtils.radToDeg(fallbackRotation.x),
    y: THREE.MathUtils.radToDeg(fallbackRotation.y),
    z: THREE.MathUtils.radToDeg(fallbackRotation.z),
  };

  return ROTATION_AXES.reduce((result, axis) => {
    const value = Number(rotationDegrees[axis]);
    result[axis] = Number.isFinite(value) ? clampRotationDegrees(value) : fallback[axis];
    return result;
  }, {});
}

function clampRotationDegrees(value) {
  return THREE.MathUtils.clamp(value, -180, 180);
}

function getWorldPosition(object) {
  object.updateWorldMatrix(true, false);
  return object.getWorldPosition(new THREE.Vector3());
}

function applyLocalRotationOffset(object, restQuaternion, rotationDegrees = {}) {
  const euler = new THREE.Euler(
    THREE.MathUtils.degToRad(rotationDegrees.rx || 0),
    THREE.MathUtils.degToRad(rotationDegrees.ry || 0),
    THREE.MathUtils.degToRad(rotationDegrees.rz || 0),
    object.rotation.order,
  );
  const offset = new THREE.Quaternion().setFromEuler(euler);
  object.quaternion.copy(restQuaternion).multiply(offset);
}

function vectorToObject(vector) {
  return {
    x: vector.x,
    y: vector.y,
    z: vector.z,
  };
}

function inferFormat(path, gltf) {
  if (gltf.userData?.vrm) return 'VRM';
  const lower = path.toLowerCase();
  if (lower.endsWith('.vrm')) return 'VRM';
  if (lower.endsWith('.glb')) return 'glB';
  if (lower.endsWith('.gltf')) return 'glTF';
  return 'Model';
}

function getModelStats(root) {
  let meshes = 0;
  let triangles = 0;

  root.traverse((object) => {
    if (!object.isMesh) return;
    meshes += 1;
    const geometry = object.geometry;
    if (!geometry) return;
    if (geometry.index) {
      triangles += geometry.index.count / 3;
    } else if (geometry.attributes?.position) {
      triangles += geometry.attributes.position.count / 3;
    }
  });

  return {
    meshes,
    triangles: Math.round(triangles),
  };
}

function disposeObject(root) {
  root.traverse((object) => {
    object.geometry?.dispose?.();
    const materials = object.material ? [object.material].flat() : [];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => {
        if (value?.isTexture) {
          value.dispose();
        }
      });
      material.dispose?.();
    });
  });
}
