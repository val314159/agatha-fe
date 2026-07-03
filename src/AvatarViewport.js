import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

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

    if (this.currentVrm?.update) {
      this.currentVrm.update(delta);
    }
    if (this.selectedBone && this.selectedAxesHelper) {
      this.selectedBone.updateWorldMatrix(true, false);
      this.selectedBone.getWorldPosition(this.selectedAxesHelper.position);
      this.selectedBone.getWorldQuaternion(this.selectedAxesHelper.quaternion);
    }
    if (this.stage.autoRotate && this.currentRoot) {
      this.currentRoot.rotation.y += delta * 0.22;
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
    this.updateSelectedAxes();
    return entry ? this.getBoneDetails(entry) : null;
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

    if (!this.currentRoot) return;

    this.currentRoot.traverse((object) => {
      if (!object.isBone) return;
      this.rawBoneMap.set(object.uuid, {
        id: object.uuid,
        name: object.name || object.uuid,
        sourceName: object.name || object.uuid,
        bone: object,
      });
    });

    const humanoid = this.currentVrm?.humanoid;
    if (!humanoid) return;

    HUMANOID_BONE_NAMES.forEach((name) => {
      const bone = getHumanoidBoneNode(humanoid, name);
      if (!bone) return;
      this.humanoidBoneMap.set(name, {
        id: name,
        name,
        sourceName: bone.name || name,
        bone,
      });
    });
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
    if (this.currentRoot) {
      this.scene.remove(this.currentRoot);
      disposeObject(this.currentRoot);
    }
    this.currentRoot = null;
    this.currentVrm = null;
    this.rawBoneMap = new Map();
    this.humanoidBoneMap = new Map();
    this.selectedBone = null;
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
