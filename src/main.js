import './styles.css';

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const presets = new Map([
  ['/models/avaAvatar.vrm', { name: 'Ava Avatar', format: 'VRM' }],
  ['/models/VRM1_Constraint_Twist_Sample.vrm', { name: 'VRM Twist Sample', format: 'VRM' }],
  ['/models/cube.gltf', { name: 'Block Man', format: 'glTF' }],
]);

const els = {
  viewport: document.querySelector('#viewport'),
  state: document.querySelector('#model-state'),
  select: document.querySelector('#avatar-select'),
  urlInput: document.querySelector('#avatar-url'),
  loadUrl: document.querySelector('#load-url'),
  fileInput: document.querySelector('#avatar-file'),
  resetCamera: document.querySelector('#reset-camera'),
  autoRotate: document.querySelector('#auto-rotate'),
  progress: document.querySelector('#load-progress'),
  metaSource: document.querySelector('#meta-source'),
  metaFormat: document.querySelector('#meta-format'),
  metaMeshes: document.querySelector('#meta-meshes'),
  metaTriangles: document.querySelector('#meta-triangles'),
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xf4f7f8);

const camera = new THREE.PerspectiveCamera(35, 1, 0.01, 100);
camera.position.set(0, 1.35, 3.2);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  preserveDrawingBuffer: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
els.viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1.2, 0);
controls.minDistance = 0.35;
controls.maxDistance = 12;

const keyLight = new THREE.DirectionalLight(0xffffff, 2.3);
keyLight.position.set(2.5, 4, 3);
scene.add(keyLight);
scene.add(new THREE.HemisphereLight(0xddeeff, 0x887766, 1.7));

const grid = new THREE.GridHelper(4, 20, 0x9aa6a8, 0xd7dddf);
grid.position.y = 0;
scene.add(grid);

const loader = new GLTFLoader();
loader.register((parser) => new VRMLoaderPlugin(parser));

const clock = new THREE.Clock();
let currentRoot = null;
let currentVrm = null;
let currentObjectUrl = null;
let loadToken = 0;

function setState(text, tone = 'neutral') {
  els.state.textContent = text;
  els.state.dataset.tone = tone;
}

function setProgress(text = '') {
  els.progress.hidden = !text;
  els.progress.textContent = text;
}

function clearCurrentModel() {
  if (currentRoot) {
    scene.remove(currentRoot);
    disposeObject(currentRoot);
  }
  currentRoot = null;
  currentVrm = null;

  if (currentObjectUrl) {
    URL.revokeObjectURL(currentObjectUrl);
    currentObjectUrl = null;
  }
}

function disposeObject(root) {
  root.traverse((object) => {
    if (object.geometry) {
      object.geometry.dispose();
    }
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

function updateMetadata({ source, format, root }) {
  const stats = root ? getModelStats(root) : { meshes: 0, triangles: 0 };
  els.metaSource.textContent = source || '-';
  els.metaFormat.textContent = format || '-';
  els.metaMeshes.textContent = stats.meshes.toLocaleString();
  els.metaTriangles.textContent = stats.triangles.toLocaleString();
}

function frameObject(object) {
  const box = new THREE.Box3().setFromObject(object);
  if (box.isEmpty()) {
    camera.position.set(0, 1.35, 3.2);
    controls.target.set(0, 1.2, 0);
    controls.update();
    return;
  }

  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxSize = Math.max(size.x, size.y, size.z);
  const distance = maxSize / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  const viewDistance = Math.max(distance * 1.35, 1.4);

  controls.target.copy(center);
  camera.position.set(center.x, center.y + maxSize * 0.12, center.z + viewDistance);
  camera.near = Math.max(viewDistance / 100, 0.01);
  camera.far = Math.max(viewDistance * 100, 100);
  camera.updateProjectionMatrix();
  controls.update();
}

function inferFormat(path, gltf) {
  if (gltf.userData?.vrm) return 'VRM';
  const lower = path.toLowerCase();
  if (lower.endsWith('.vrm')) return 'VRM';
  if (lower.endsWith('.glb')) return 'glB';
  if (lower.endsWith('.gltf')) return 'glTF';
  return presets.get(path)?.format || 'Model';
}

async function loadAvatar(path, label = path, { objectUrl = null } = {}) {
  const token = ++loadToken;
  setState('Loading', 'loading');
  setProgress('Starting load...');

  try {
    const gltf = await loader.loadAsync(
      path,
      (event) => {
        if (event.total > 0) {
          const percent = Math.round((event.loaded / event.total) * 100);
          setProgress(`Loading ${percent}%`);
        } else if (event.loaded) {
          setProgress(`${Math.round(event.loaded / 1024).toLocaleString()} KB loaded`);
        }
      },
    );

    if (token !== loadToken) {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      return;
    }

    clearCurrentModel();
    currentObjectUrl = objectUrl;

    const vrm = gltf.userData?.vrm || null;
    let root;
    if (vrm) {
      currentVrm = vrm;
      VRMUtils.rotateVRM0?.(vrm);
      root = vrm.scene;
    } else {
      root = gltf.scene;
    }

    currentRoot = root;
    scene.add(root);
    frameObject(root);

    const format = inferFormat(path, gltf);
    updateMetadata({ source: label, format, root });
    setState('Ready', 'ready');
    setProgress('');
  } catch (error) {
    if (token !== loadToken) {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
      return;
    }
    console.error(error);
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
    }
    clearCurrentModel();
    updateMetadata({ source: label, format: '-', root: null });
    setState('Failed', 'error');
    setProgress(error instanceof Error ? error.message : String(error));
  }
}

function loadSelectedAvatar() {
  const path = els.select.value;
  const preset = presets.get(path);
  els.urlInput.value = path;
  loadAvatar(path, preset?.name || path);
}

function loadCustomUrl() {
  const path = els.urlInput.value.trim();
  if (!path) return;
  loadAvatar(path, path);
}

function loadLocalFile(file) {
  if (!file) return;
  const url = URL.createObjectURL(file);
  els.urlInput.value = file.name;
  loadAvatar(url, file.name, { objectUrl: url });
}

function resize() {
  const rect = els.viewport.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function animate() {
  requestAnimationFrame(animate);
  const delta = clock.getDelta();

  if (currentVrm?.update) {
    currentVrm.update(delta);
  }
  if (els.autoRotate.checked && currentRoot) {
    currentRoot.rotation.y += delta * 0.22;
  }

  controls.update();
  renderer.render(scene, camera);
}

els.select.addEventListener('change', loadSelectedAvatar);
els.loadUrl.addEventListener('click', loadCustomUrl);
els.urlInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    loadCustomUrl();
  }
});
els.fileInput.addEventListener('change', (event) => loadLocalFile(event.target.files?.[0]));
els.resetCamera.addEventListener('click', () => {
  if (currentRoot) {
    frameObject(currentRoot);
  }
});
window.addEventListener('resize', resize);

resize();
animate();

const initialModel = new URLSearchParams(window.location.search).get('model');
if (initialModel) {
  if (presets.has(initialModel)) {
    els.select.value = initialModel;
  }
  els.urlInput.value = initialModel;
  loadAvatar(initialModel, presets.get(initialModel)?.name || initialModel);
} else {
  loadSelectedAvatar();
}
