import './styles.css';
import { AvatarViewport } from './AvatarViewport.js';

const presets = new Map([
  ['/models/avaAvatar.vrm', { name: 'Ava Avatar' }],
  ['/models/VRM1_Constraint_Twist_Sample.vrm', { name: 'VRM Twist Sample' }],
  ['/models/cube.gltf', { name: 'Block Man' }],
]);

const fbxAnimations = [
  { path: '/models/Arm Stretching.fbx', name: 'Arm Stretching' },
  { path: '/models/Dying.fbx', name: 'Dying' },
  { path: '/models/Rumba Dancing.fbx', name: 'Rumba Dancing' },
  { path: '/models/Salute.fbx', name: 'Salute' },
  { path: '/models/Silly Dancing.fbx', name: 'Silly Dancing' },
  { path: '/models/Texting While Standing.fbx', name: 'Texting While Standing' },
];

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
  boneRotationControls: document.querySelector('#bone-rotation-controls'),
  boneRotationRanges: [...document.querySelectorAll('.bone-rotation-range')],
  boneRotationNumbers: [...document.querySelectorAll('.bone-rotation-number')],
  boneResetRotation: document.querySelector('#bone-reset-rotation'),
  movePlay: document.querySelector('#move-play'),
  moveReset: document.querySelector('#move-reset'),
  moveSpeed: document.querySelector('#move-speed'),
  moveSpeedValue: document.querySelector('#move-speed-value'),
  moveHelpers: document.querySelector('#move-helpers'),
  moveFootLock: document.querySelector('#move-foot-lock'),
  moveCount: document.querySelector('#move-count'),
  moveList: document.querySelector('#move-list'),
  moveActive: document.querySelector('#move-active'),
  movePhase: document.querySelector('#move-phase'),
  movePlanted: document.querySelector('#move-planted'),
  moveCorrection: document.querySelector('#move-correction'),
  fbxCount: document.querySelector('#fbx-count'),
  fbxList: document.querySelector('#fbx-list'),
  fbxInspect: document.querySelector('#fbx-inspect'),
  fbxActive: document.querySelector('#fbx-active'),
  fbxClips: document.querySelector('#fbx-clips'),
  fbxDuration: document.querySelector('#fbx-duration'),
  fbxTracks: document.querySelector('#fbx-tracks'),
  fbxBones: document.querySelector('#fbx-bones'),
  fbxNodes: document.querySelector('#fbx-nodes'),
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
const rotationAxes = ['x', 'y', 'z'];
let selectedBoneId = null;
let selectedMoveId = null;
let selectedFbxPath = fbxAnimations[0]?.path || null;

const viewport = new AvatarViewport(els.viewport, {
  onState: setState,
  onProgress: setProgress,
  onModelLoaded: updateMetadata,
  onMoveStatus: updateMoveStatus,
});
const movePresets = viewport.getMovePresets();
selectedMoveId = movePresets[0]?.id || null;

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
  if (tabName === 'moves') {
    renderMoveList();
    updateMoveStatus(viewport.getMoveStatus());
  }
  if (tabName === 'fbx') {
    renderFbxList();
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

function renderMoveList() {
  els.moveCount.textContent = String(movePresets.length);
  els.moveList.textContent = '';

  movePresets.forEach((move) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'move-item';
    button.dataset.moveId = move.id;
    button.classList.toggle('is-selected', move.id === selectedMoveId);
    button.textContent = move.name;
    button.addEventListener('click', () => selectMove(move.id));
    els.moveList.appendChild(button);
  });
}

function selectMove(id) {
  selectedMoveId = id;
  viewport.setMovePreset(id);
  renderMoveList();
}

function toggleMovePlayback() {
  const status = viewport.getMoveStatus();
  const shouldPlay = !status.playing;

  if (shouldPlay) {
    els.autoRotate.checked = false;
    viewport.setAutoRotate(false);
  }
  viewport.setMovePlaying(shouldPlay);
}

function resetMovePlayback() {
  viewport.resetMove();
  updateMoveStatus(viewport.getMoveStatus());
}

function applyMoveSpeed() {
  const speed = Number(els.moveSpeed.value);
  els.moveSpeedValue.textContent = `${speed.toFixed(1)}x`;
  viewport.setMoveSpeed(speed);
}

function applyMoveOptions() {
  viewport.setMoveOptions({
    showHelpers: els.moveHelpers.checked,
    footLock: els.moveFootLock.checked,
  });
}

function updateMoveStatus(status) {
  const ready = Boolean(status.ready);

  els.movePlay.disabled = !ready;
  els.moveReset.disabled = !ready;
  els.movePlay.textContent = status.playing ? 'Pause' : 'Play';
  els.moveActive.textContent = ready ? status.presetName : '-';
  els.movePhase.textContent = ready ? `${Math.round(status.phase * 100)}%` : '-';
  els.movePlanted.textContent = ready && status.plantedFeet.length
    ? status.plantedFeet.join(', ')
    : '-';
  els.moveCorrection.textContent = ready
    ? formatVector(status.correction)
    : '-';
}

function renderFbxList() {
  els.fbxCount.textContent = String(fbxAnimations.length);
  els.fbxList.textContent = '';

  fbxAnimations.forEach((animation) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'fbx-item';
    button.dataset.fbxPath = animation.path;
    button.classList.toggle('is-selected', animation.path === selectedFbxPath);
    button.textContent = animation.name;
    button.addEventListener('click', () => selectFbxAnimation(animation.path));
    els.fbxList.appendChild(button);
  });

  els.fbxInspect.disabled = !selectedFbxPath;
}

function selectFbxAnimation(path) {
  selectedFbxPath = path;
  renderFbxList();
  updateFbxMetadata(null);
}

async function inspectSelectedFbx() {
  const animation = fbxAnimations.find((item) => item.path === selectedFbxPath);
  if (!animation) return;

  els.fbxInspect.disabled = true;
  els.fbxInspect.textContent = 'Inspecting';
  updateFbxMetadata({ source: animation.name, loading: true });

  try {
    const metadata = await viewport.inspectFbxAnimation(animation.path, animation.name);
    updateFbxMetadata(metadata);
  } catch (error) {
    console.error(error);
    setProgress(error instanceof Error ? error.message : String(error));
    updateFbxMetadata({ source: animation.name, error: true });
  } finally {
    els.fbxInspect.disabled = false;
    els.fbxInspect.textContent = 'Inspect';
  }
}

function updateFbxMetadata(metadata) {
  const selected = fbxAnimations.find((item) => item.path === selectedFbxPath);
  const hasStats = Boolean(metadata && !metadata.loading && !metadata.error);

  els.fbxActive.textContent = metadata?.source || selected?.name || '-';
  els.fbxClips.textContent = metadata?.loading
    ? 'Loading'
    : metadata?.error
      ? 'Failed'
      : hasStats
        ? formatFbxClips(metadata.clips)
        : '-';
  els.fbxDuration.textContent = hasStats && metadata.duration ? `${metadata.duration.toFixed(2)}s` : '-';
  els.fbxTracks.textContent = hasStats ? metadata.tracks.toLocaleString() : '-';
  els.fbxBones.textContent = hasStats ? metadata.bones.toLocaleString() : '-';
  els.fbxNodes.textContent = hasStats ? metadata.nodes.toLocaleString() : '-';
}

function formatFbxClips(clips = []) {
  if (!clips.length) return '0';
  return clips.map((clip) => `${clip.name} (${clip.tracks})`).join(', ');
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
  syncBoneRotationControls(details?.localRotation || null);
}

function clearRigSelection() {
  selectedBoneId = null;
  viewport.selectBone('', els.rigMode.value);
  renderBoneDetails(null);
  renderRigList();
}

function syncBoneRotationControls(rotation) {
  const enabled = Boolean(rotation);
  const values = rotation || { x: 0, y: 0, z: 0 };

  els.boneRotationControls.disabled = !enabled;
  rotationAxes.forEach((axis) => {
    setRotationControlValue(axis, values[axis]);
  });
}

function handleBoneRotationInput(event) {
  const input = event.currentTarget;
  const axis = input.dataset.axis;
  if (!rotationAxes.includes(axis) || input.value === '') return;

  const value = Number(input.value);
  if (!Number.isFinite(value)) return;

  setRotationControlValue(axis, clampRotationValue(value));
  const details = viewport.setSelectedBoneRotation(readBoneRotationControls());
  renderBoneDetails(details);
}

function resetSelectedBoneRotation() {
  const details = viewport.resetSelectedBoneRotation();
  renderBoneDetails(details);
}

function readBoneRotationControls() {
  return rotationAxes.reduce((rotation, axis) => {
    const input = findRotationNumber(axis);
    rotation[axis] = Number(input?.value || 0);
    return rotation;
  }, {});
}

function setRotationControlValue(axis, value) {
  const formatted = formatRotationInput(value);
  const range = findRotationRange(axis);
  const number = findRotationNumber(axis);

  if (range) range.value = formatted;
  if (number) number.value = formatted;
}

function findRotationRange(axis) {
  return els.boneRotationRanges.find((input) => input.dataset.axis === axis);
}

function findRotationNumber(axis) {
  return els.boneRotationNumbers.find((input) => input.dataset.axis === axis);
}

function clampRotationValue(value) {
  return Math.max(-180, Math.min(180, value));
}

function formatRotationInput(value) {
  const cleanValue = Math.abs(Number(value)) < 0.0005 ? 0 : Number(value);
  return cleanValue.toFixed(1);
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
els.movePlay.addEventListener('click', toggleMovePlayback);
els.moveReset.addEventListener('click', resetMovePlayback);
els.moveSpeed.addEventListener('input', applyMoveSpeed);
els.moveHelpers.addEventListener('change', applyMoveOptions);
els.moveFootLock.addEventListener('change', applyMoveOptions);
els.fbxInspect.addEventListener('click', inspectSelectedFbx);
els.rigMode.addEventListener('change', clearRigSelection);
els.rigSearch.addEventListener('input', renderRigList);
els.skeletonVisible.addEventListener('change', () => {
  viewport.setSkeletonVisible(els.skeletonVisible.checked);
});
els.selectedAxesVisible.addEventListener('change', () => {
  viewport.setSelectedAxesVisible(els.selectedAxesVisible.checked);
});
[...els.boneRotationRanges, ...els.boneRotationNumbers].forEach((input) => {
  input.addEventListener('input', handleBoneRotationInput);
});
els.boneResetRotation.addEventListener('click', resetSelectedBoneRotation);
window.addEventListener('resize', () => viewport.resize());

activateTab('viewer');
resetStageControls();
renderMoveList();
renderFbxList();
updateFbxMetadata(null);
applyMoveSpeed();
applyMoveOptions();
updateMoveStatus(viewport.getMoveStatus());
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
