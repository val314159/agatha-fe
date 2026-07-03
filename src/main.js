import './styles.css';
import { AvatarViewport } from './AvatarViewport.js';

const presets = new Map([
  ['/models/avaAvatar.vrm', { name: 'Ava Avatar' }],
  ['/models/VRM1_Constraint_Twist_Sample.vrm', { name: 'VRM Twist Sample' }],
  ['/models/cube.gltf', { name: 'Block Man' }],
]);

const els = {
  viewport: document.querySelector('#viewport'),
  state: document.querySelector('#model-state'),
  progress: document.querySelector('#load-progress'),
  tabButtons: [...document.querySelectorAll('.tab-button')],
  tabPanels: [...document.querySelectorAll('.tab-panel')],
  select: document.querySelector('#avatar-select'),
  urlInput: document.querySelector('#avatar-url'),
  loadUrl: document.querySelector('#load-url'),
  fileInput: document.querySelector('#avatar-file'),
  resetCamera: document.querySelector('#reset-camera'),
  autoRotate: document.querySelector('#auto-rotate'),
  backgroundColor: document.querySelector('#background-color'),
  gridVisible: document.querySelector('#grid-visible'),
  gridSize: document.querySelector('#grid-size'),
  keyLight: document.querySelector('#key-light'),
  keyLightValue: document.querySelector('#key-light-value'),
  hemiLight: document.querySelector('#hemi-light'),
  hemiLightValue: document.querySelector('#hemi-light-value'),
  resetStage: document.querySelector('#reset-stage'),
  rigMode: document.querySelector('#rig-mode'),
  rigSearch: document.querySelector('#rig-search'),
  skeletonVisible: document.querySelector('#skeleton-visible'),
  selectedAxesVisible: document.querySelector('#selected-axes-visible'),
  rigCount: document.querySelector('#rig-count'),
  boneList: document.querySelector('#bone-list'),
  boneEmpty: document.querySelector('#bone-empty'),
  boneName: document.querySelector('#bone-name'),
  boneSource: document.querySelector('#bone-source'),
  boneParent: document.querySelector('#bone-parent'),
  boneChildren: document.querySelector('#bone-children'),
  boneLocalPosition: document.querySelector('#bone-local-position'),
  boneLocalRotation: document.querySelector('#bone-local-rotation'),
  boneWorldPosition: document.querySelector('#bone-world-position'),
  metaSource: document.querySelector('#meta-source'),
  metaFormat: document.querySelector('#meta-format'),
  metaMeshes: document.querySelector('#meta-meshes'),
  metaTriangles: document.querySelector('#meta-triangles'),
};

const defaultStage = {
  backgroundColor: '#f4f7f8',
  gridVisible: true,
  gridSize: 4,
  keyLightIntensity: 2.3,
  hemiLightIntensity: 1.7,
};
let selectedBoneId = null;

const viewport = new AvatarViewport(els.viewport, {
  onState: setState,
  onProgress: setProgress,
  onModelLoaded: updateMetadata,
});

function setState(text, tone = 'neutral') {
  els.state.textContent = text;
  els.state.dataset.tone = tone;
}

function setProgress(text = '') {
  els.progress.hidden = !text;
  els.progress.textContent = text;
}

function updateMetadata(result) {
  els.metaSource.textContent = result.source || '-';
  els.metaFormat.textContent = result.format || '-';
  els.metaMeshes.textContent = result.stats.meshes.toLocaleString();
  els.metaTriangles.textContent = result.stats.triangles.toLocaleString();
  selectedBoneId = null;
  renderRigList();
  renderBoneDetails(null);
}

function activateTab(tabName) {
  els.tabButtons.forEach((button) => {
    const active = button.dataset.tab === tabName;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  els.tabPanels.forEach((panel) => {
    panel.hidden = panel.dataset.panel !== tabName;
  });
  if (tabName === 'rig') {
    renderRigList();
  }
  requestAnimationFrame(() => viewport.resize());
}

function loadSelectedAvatar() {
  const path = els.select.value;
  const preset = presets.get(path);
  els.urlInput.value = path;
  viewport.loadAvatar(path, preset?.name || path);
}

function loadCustomUrl() {
  const path = els.urlInput.value.trim();
  if (!path) return;
  viewport.loadAvatar(path, path);
}

function loadLocalFile(file) {
  if (!file) return;
  els.urlInput.value = file.name;
  viewport.loadLocalFile(file);
}

function getStageFormValues() {
  return {
    backgroundColor: els.backgroundColor.value,
    gridVisible: els.gridVisible.checked,
    gridSize: Number(els.gridSize.value),
    keyLightIntensity: Number(els.keyLight.value),
    hemiLightIntensity: Number(els.hemiLight.value),
  };
}

function syncStageLabels() {
  els.keyLightValue.textContent = Number(els.keyLight.value).toFixed(1);
  els.hemiLightValue.textContent = Number(els.hemiLight.value).toFixed(1);
}

function applyStageFromForm() {
  syncStageLabels();
  viewport.setStage(getStageFormValues());
}

function resetStageControls() {
  els.backgroundColor.value = defaultStage.backgroundColor;
  els.gridVisible.checked = defaultStage.gridVisible;
  els.gridSize.value = String(defaultStage.gridSize);
  els.keyLight.value = String(defaultStage.keyLightIntensity);
  els.hemiLight.value = String(defaultStage.hemiLightIntensity);
  applyStageFromForm();
}

function renderRigList() {
  const mode = els.rigMode.value;
  const filter = els.rigSearch.value.trim().toLowerCase();
  const info = viewport.getRigInfo(mode);
  const bones = info.bones.filter((bone) => {
    if (!filter) return true;
    return (
      bone.name.toLowerCase().includes(filter) ||
      bone.sourceName.toLowerCase().includes(filter) ||
      bone.parentName.toLowerCase().includes(filter)
    );
  });

  els.rigCount.textContent = String(bones.length);
  els.boneList.textContent = '';
  els.boneEmpty.hidden = bones.length > 0;

  bones.forEach((bone) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'bone-item';
    button.dataset.boneId = bone.id;
    button.classList.toggle('is-selected', bone.id === selectedBoneId);

    const name = document.createElement('span');
    name.className = 'bone-item-name';
    name.textContent = bone.name;

    const source = document.createElement('span');
    source.className = 'bone-item-source';
    source.textContent = bone.sourceName;

    button.append(name, source);
    button.addEventListener('click', () => selectRigBone(bone.id));
    els.boneList.appendChild(button);
  });
}

function selectRigBone(id) {
  selectedBoneId = id;
  const details = viewport.selectBone(id, els.rigMode.value);
  renderBoneDetails(details);
  renderRigList();
}

function renderBoneDetails(details) {
  els.boneName.textContent = details?.name || '-';
  els.boneSource.textContent = details?.sourceName || '-';
  els.boneParent.textContent = details?.parentName || '-';
  els.boneChildren.textContent = details ? String(details.childCount) : '-';
  els.boneLocalPosition.textContent = details ? formatVector(details.localPosition) : '-';
  els.boneLocalRotation.textContent = details ? formatRotation(details.localRotation) : '-';
  els.boneWorldPosition.textContent = details ? formatVector(details.worldPosition) : '-';
}

function clearRigSelection() {
  selectedBoneId = null;
  viewport.selectBone('', els.rigMode.value);
  renderBoneDetails(null);
  renderRigList();
}

function formatVector(vector) {
  return `x ${formatNumber(vector.x)}  y ${formatNumber(vector.y)}  z ${formatNumber(vector.z)}`;
}

function formatRotation(rotation) {
  return `x ${formatNumber(rotation.x)}°  y ${formatNumber(rotation.y)}°  z ${formatNumber(rotation.z)}°`;
}

function formatNumber(value) {
  return Number(value).toFixed(3);
}

els.tabButtons.forEach((button) => {
  button.addEventListener('click', () => activateTab(button.dataset.tab));
});
els.select.addEventListener('change', loadSelectedAvatar);
els.loadUrl.addEventListener('click', loadCustomUrl);
els.urlInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    loadCustomUrl();
  }
});
els.fileInput.addEventListener('change', (event) => loadLocalFile(event.target.files?.[0]));
els.resetCamera.addEventListener('click', () => viewport.resetCamera());
els.autoRotate.addEventListener('change', () => viewport.setAutoRotate(els.autoRotate.checked));
els.backgroundColor.addEventListener('input', applyStageFromForm);
els.gridVisible.addEventListener('change', applyStageFromForm);
els.gridSize.addEventListener('change', applyStageFromForm);
els.keyLight.addEventListener('input', applyStageFromForm);
els.hemiLight.addEventListener('input', applyStageFromForm);
els.resetStage.addEventListener('click', resetStageControls);
els.rigMode.addEventListener('change', clearRigSelection);
els.rigSearch.addEventListener('input', renderRigList);
els.skeletonVisible.addEventListener('change', () => {
  viewport.setSkeletonVisible(els.skeletonVisible.checked);
});
els.selectedAxesVisible.addEventListener('change', () => {
  viewport.setSelectedAxesVisible(els.selectedAxesVisible.checked);
});
window.addEventListener('resize', () => viewport.resize());

activateTab('viewer');
resetStageControls();
viewport.resize();
viewport.start();

const initialModel = new URLSearchParams(window.location.search).get('model');
if (initialModel) {
  if (presets.has(initialModel)) {
    els.select.value = initialModel;
  }
  els.urlInput.value = initialModel;
  viewport.loadAvatar(initialModel, presets.get(initialModel)?.name || initialModel);
} else {
  loadSelectedAvatar();
}
