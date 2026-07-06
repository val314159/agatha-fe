import './styles.css';
import { AvatarViewport } from './AvatarViewport.js';
import { BeatTracker } from './BeatTracker.js';
import { splitByRegion } from './AvaToAvar.js';

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
  resetPose: document.querySelector('#reset-pose'),
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
  moveBalance: document.querySelector('#move-balance'),
  moveCount: document.querySelector('#move-count'),
  moveList: document.querySelector('#move-list'),
  moveActive: document.querySelector('#move-active'),
  movePhase: document.querySelector('#move-phase'),
  movePlanted: document.querySelector('#move-planted'),
  moveCorrection: document.querySelector('#move-correction'),
  beatCountSteps: [...document.querySelectorAll('.beat-count-step')],
  beatBpm: document.querySelector('#beat-bpm'),
  beatBpmDisplay: document.querySelector('#beat-bpm-display'),
  beatMode: document.querySelector('#beat-mode'),
  beatConfidence: document.querySelector('#beat-confidence'),
  beatOffset: document.querySelector('#beat-offset'),
  beatOffsetValue: document.querySelector('#beat-offset-value'),
  beatOffsetDisplay: document.querySelector('#beat-offset-display'),
  beatPhase: document.querySelector('#beat-phase'),
  beatTap: document.querySelector('#beat-tap'),
  beatSetBeat: document.querySelector('#beat-set-beat'),
  beatSetDownbeat: document.querySelector('#beat-set-downbeat'),
  beatHalf: document.querySelector('#beat-half'),
  beatDouble: document.querySelector('#beat-double'),
  beatReset: document.querySelector('#beat-reset'),
  beatLock: document.querySelector('#beat-lock'),
  beatStartNextBeat: document.querySelector('#beat-start-next-beat'),
  beatStartNextBar: document.querySelector('#beat-start-next-bar'),
  beatSampleMic: document.querySelector('#beat-sample-mic'),
  beatStopSampling: document.querySelector('#beat-stop-sampling'),
  beatUseDetected: document.querySelector('#beat-use-detected'),
  beatDetectedBpm: document.querySelector('#beat-detected-bpm'),
  beatDetectedConfidence: document.querySelector('#beat-detected-confidence'),
  beatDetectedLevel: document.querySelector('#beat-detected-level'),
  beatDetectedOnset: document.querySelector('#beat-detected-onset'),
  beatStatus: document.querySelector('#beat-status'),
  beatNudgeButtons: [...document.querySelectorAll('[data-beat-nudge]')],
  avaPlay: document.querySelector('#ava-play'),
  avaStop: document.querySelector('#ava-stop'),
  avaLists: {
    full: document.querySelector('#ava-list-full'),
    upper: document.querySelector('#ava-list-upper'),
    lower: document.querySelector('#ava-list-lower'),
  },
  avaCounts: {
    full: document.querySelector('#ava-count-full'),
    upper: document.querySelector('#ava-count-upper'),
    lower: document.querySelector('#ava-count-lower'),
  },
  avaActive: document.querySelector('#ava-active'),
  avaDuration: document.querySelector('#ava-duration'),
  avaTracks: document.querySelector('#ava-tracks'),
  avaSpeed: document.querySelector('#ava-speed'),
  avaSpeedValue: document.querySelector('#ava-speed-value'),
  avaUseAvak: document.querySelector('#ava-use-avak'),
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
const BEAT_MIN_BPM = 30;
const BEAT_MAX_BPM = 300;
const BEAT_MAX_OFFSET_MS = 250;
const BEAT_TAP_RESET_MS = 2000;
const BEAT_TAP_LIMIT = 12;
const BEAT_DETECTED_MIN_CONFIDENCE = 0.2;
let selectedBoneId = null;
let selectedMoveId = null;
let selectedAvaMove = null;
let selectedAvaKind = 'full';
let playingAvaMove = null;
let playingAvaKind = null;
let avaMoves = [];
const beatState = {
  bpm: 120,
  offsetMs: 0,
  confidence: 0,
  mode: 'Manual',
  anchorTimeMs: performance.now(),
  anchorBeat: 0,
  tapTimes: [],
  sampling: false,
  sampleError: '',
  detectedBpm: null,
  detectedConfidence: 0,
  detectedLevel: 0,
  detectedOnset: false,
  status: 'Ready for manual beat sync.',
};
const beatTracker = new BeatTracker();

const viewport = new AvatarViewport(els.viewport, {
  onState: setState,
  onProgress: setProgress,
  onModelLoaded: updateMetadata,
  onMoveStatus: updateMoveStatus,
  onAvaStatus: updateAvaStatus,
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
  if (tabName === 'ava') {
    renderAvaList();
  }
  if (tabName === 'beats') {
    renderBeatState();
  }
  requestAnimationFrame(() => viewport.resize());
}

async function loadSelectedAvatar() {
  const path = els.select.value;
  const preset = presets.get(path);
  els.urlInput.value = path;
  await viewport.loadAvatar(path, preset?.name || path);
  await reloadAvaMoves();
}

async function loadCustomUrl() {
  const path = els.urlInput.value.trim();
  if (!path) return;
  await viewport.loadAvatar(path, path);
  await reloadAvaMoves();
}

async function loadLocalFile(file) {
  if (!file) return;
  els.urlInput.value = file.name;
  await viewport.loadLocalFile(file);
  await reloadAvaMoves();
}

async function reloadAvaMoves() {
  viewport.stopAvaMove();
  playingAvaMove = null;
  playingAvaKind = null;
  selectedAvaMove = null;
  selectedAvaKind = 'full';
  avaMoves = await viewport.loadAvaMoves(fbxAnimations, setProgress);
  renderAvaList();
  updateAvaToolbar();
  setProgress('');
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
    balance: els.moveBalance.checked,
  });
}

function applyAvaSpeed() {
  const speed = Number(els.avaSpeed.value);
  els.avaSpeedValue.textContent = `${speed.toFixed(1)}x`;
  viewport.setAvaTimeScale(speed);
}

function getBeatPeriodMs() {
  return 60000 / beatState.bpm;
}

function getBeatFloat(nowMs = performance.now()) {
  return ((nowMs - beatState.anchorTimeMs + beatState.offsetMs) / getBeatPeriodMs()) + beatState.anchorBeat;
}

function getBeatPhase(beatFloat) {
  return beatFloat - Math.floor(beatFloat);
}

function getBeatCount(beatFloat) {
  return positiveModulo(Math.floor(beatFloat), 4) + 1;
}

function setBeatBpm(value, status) {
  const bpm = clampNumber(Number(value), BEAT_MIN_BPM, BEAT_MAX_BPM);
  if (!Number.isFinite(bpm)) return;

  const now = performance.now();
  const beatFloat = getBeatFloat(now);
  beatState.bpm = bpm;
  beatState.anchorTimeMs = now + beatState.offsetMs - (beatFloat - beatState.anchorBeat) * getBeatPeriodMs();
  beatState.mode = 'Manual';
  if (status) beatState.status = status;
  renderBeatState();
}

function setBeatNow(status, forceDownbeat = false) {
  const now = performance.now();
  const beatFloat = getBeatFloat(now);
  beatState.anchorBeat = forceDownbeat ? 0 : Math.round(beatFloat);
  beatState.anchorTimeMs = now + beatState.offsetMs;
  beatState.confidence = Math.max(beatState.confidence, 0.75);
  beatState.mode = 'Manual';
  beatState.status = status;
  renderBeatState();
}

function setBeatOffset(value, status) {
  const offsetMs = clampNumber(Number(value), -BEAT_MAX_OFFSET_MS, BEAT_MAX_OFFSET_MS);
  if (!Number.isFinite(offsetMs)) return;
  beatState.offsetMs = offsetMs;
  if (status) beatState.status = status;
  renderBeatState();
}

function tapBeat() {
  const now = performance.now();
  const previousTap = beatState.tapTimes.at(-1);
  if (previousTap && now - previousTap > BEAT_TAP_RESET_MS) {
    beatState.tapTimes.length = 0;
  }

  const beatFloat = getBeatFloat(now);
  beatState.tapTimes.push(now);
  while (beatState.tapTimes.length > BEAT_TAP_LIMIT) beatState.tapTimes.shift();

  if (beatState.tapTimes.length >= 2) {
    const intervals = [];
    for (let i = 1; i < beatState.tapTimes.length; i++) {
      intervals.push(beatState.tapTimes[i] - beatState.tapTimes[i - 1]);
    }
    const averageMs = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
    beatState.bpm = clampNumber(60000 / averageMs, BEAT_MIN_BPM, BEAT_MAX_BPM);
    beatState.status = `Tap tempo from ${beatState.tapTimes.length} taps.`;
  } else {
    beatState.status = 'First tap recorded.';
  }

  beatState.anchorBeat = Math.round(beatFloat);
  beatState.anchorTimeMs = now + beatState.offsetMs;
  beatState.confidence = Math.min(1, Math.max(beatState.confidence, (beatState.tapTimes.length - 1) / 6));
  beatState.mode = 'Tap';
  renderBeatState();
}

function resetBeatSync() {
  beatState.bpm = 120;
  beatState.offsetMs = 0;
  beatState.confidence = 0;
  beatState.mode = 'Manual';
  beatState.anchorTimeMs = performance.now();
  beatState.anchorBeat = 0;
  beatState.tapTimes.length = 0;
  beatState.status = 'Sync reset.';
  els.beatLock.checked = false;
  renderBeatState();
}

async function startBeatSampling() {
  if (beatState.sampling) return;

  beatState.status = 'Requesting microphone access...';
  beatState.sampleError = '';
  renderBeatState();

  try {
    await beatTracker.start();
    beatState.sampling = true;
    beatState.mode = 'Sampling';
    beatState.status = 'Sampling mic for BPM. Use Set 1 after applying detected BPM.';
  } catch (error) {
    beatState.sampling = false;
    beatState.sampleError = error instanceof Error ? error.message : String(error);
    beatState.status = `Mic sampling failed: ${beatState.sampleError}`;
  }

  renderBeatState();
}

function stopBeatSampling(status = 'Mic sampling stopped.') {
  beatTracker.stop();
  beatState.sampling = false;
  beatState.detectedLevel = 0;
  beatState.detectedOnset = false;
  if (beatState.mode === 'Sampling') beatState.mode = 'Manual';
  beatState.status = status;
  renderBeatState();
}

function updateBeatSampling() {
  if (!beatState.sampling) return;

  const features = beatTracker.update();
  const bpm = beatTracker.getBPM();
  const confidence = beatTracker.getBPMConfidence();
  beatState.detectedBpm = Number.isFinite(bpm) ? bpm : null;
  beatState.detectedConfidence = Number.isFinite(confidence) ? confidence : 0;
  beatState.detectedLevel = clampNumber(features.rmsSmooth || features.rms || 0, 0, 1);
  beatState.detectedOnset = Boolean(features.onsetActive);

  if (beatTracker.isLocked() && beatState.detectedBpm) {
    beatState.status = `Mic locked near ${beatState.detectedBpm.toFixed(1)} BPM.`;
  }
}

function useDetectedBeatBpm() {
  if (!beatState.detectedBpm) return;

  setBeatBpm(beatState.detectedBpm, `Using detected ${beatState.detectedBpm.toFixed(1)} BPM. Press Set Beat Now or Set 1 to align phase.`);
  beatState.confidence = Math.max(beatState.confidence, beatState.detectedConfidence);
  beatState.mode = 'Mic';
  renderBeatState();
}

function setBeatStartTarget(beatsPerTarget, label) {
  const beatFloat = getBeatFloat();
  let targetBeat = Math.ceil(beatFloat / beatsPerTarget) * beatsPerTarget;
  if (targetBeat <= beatFloat + 0.0001) targetBeat += beatsPerTarget;
  const seconds = ((targetBeat - beatFloat) * getBeatPeriodMs()) / 1000;
  beatState.status = `${label} target in ${seconds.toFixed(2)}s.`;
  renderBeatState();
}

function renderBeatState() {
  const beatFloat = getBeatFloat();
  const phase = getBeatPhase(beatFloat);
  const count = getBeatCount(beatFloat);
  const offsetText = formatSignedMs(beatState.offsetMs);
  const detectedReady = Boolean(
    beatState.detectedBpm && beatState.detectedConfidence >= BEAT_DETECTED_MIN_CONFIDENCE,
  );

  if (document.activeElement !== els.beatBpm) {
    els.beatBpm.value = beatState.bpm.toFixed(1);
  }
  els.beatBpmDisplay.textContent = beatState.bpm.toFixed(1);
  els.beatMode.textContent = els.beatLock.checked ? `${beatState.mode} / Locked` : beatState.mode;
  els.beatConfidence.textContent = `${Math.round(beatState.confidence * 100)}%`;
  els.beatOffset.value = String(Math.round(beatState.offsetMs));
  els.beatOffsetValue.textContent = offsetText;
  els.beatOffsetDisplay.textContent = offsetText;
  els.beatPhase.textContent = `${Math.round(phase * 100)}%`;
  els.beatDetectedBpm.textContent = beatState.detectedBpm ? beatState.detectedBpm.toFixed(1) : '-';
  els.beatDetectedConfidence.textContent = `${Math.round(beatState.detectedConfidence * 100)}%`;
  els.beatDetectedLevel.textContent = `${Math.round(beatState.detectedLevel * 100)}%`;
  els.beatDetectedOnset.textContent = beatState.detectedOnset ? 'Yes' : 'No';
  els.beatSampleMic.disabled = beatState.sampling;
  els.beatStopSampling.disabled = !beatState.sampling;
  els.beatUseDetected.disabled = !detectedReady;
  els.beatStatus.textContent = beatState.status;

  els.beatCountSteps.forEach((step, index) => {
    step.classList.toggle('is-active', index + 1 === count);
  });
}

function tickBeatState() {
  updateBeatSampling();
  renderBeatState();
  requestAnimationFrame(tickBeatState);
}

function formatSignedMs(value) {
  const rounded = Math.round(value);
  return `${rounded >= 0 ? '+' : ''}${rounded}ms`;
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

const AVA_KINDS = ['full', 'upper', 'lower'];

function renderAvaList() {
  const moves = viewport.getAvaMoves();
  for (const kind of AVA_KINDS) {
    const list = els.avaLists[kind];
    const count = els.avaCounts[kind];
    list.textContent = '';
    count.textContent = String(moves.length);

    moves.forEach((move) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'fbx-item';
      button.dataset.avaName = move.name;
      button.dataset.avaKind = kind;
      const isSelected = move.name === selectedAvaMove && kind === selectedAvaKind;
      const isPlaying = move.name === playingAvaMove && kind === playingAvaKind;
      button.classList.toggle('is-selected', isSelected);
      button.classList.toggle('is-playing', isPlaying);
      button.textContent = move.name;
      button.addEventListener('click', () => selectAvaMove(move.name, kind));
      list.appendChild(button);
    });
  }

  updateAvaToolbar();
  updateAvaMetadata();
}

function selectAvaMove(name, kind) {
  selectedAvaMove = name;
  selectedAvaKind = kind;
  renderAvaList();
  updateAvaToolbar();
  updateAvaMetadata();
}

function updateAvaToolbar() {
  const selected = Boolean(selectedAvaMove);
  const playing = Boolean(playingAvaMove);
  const selectedIsPlaying = selectedAvaMove === playingAvaMove && selectedAvaKind === playingAvaKind;

  els.avaPlay.disabled = !selected || selectedIsPlaying;
  els.avaPlay.textContent = selectedIsPlaying ? 'Playing' : 'Play';
  els.avaStop.disabled = !playing;
}

function playSelectedAva() {
  if (!selectedAvaMove) return;

  els.avaPlay.disabled = true;
  els.avaPlay.textContent = 'Baking';

  try {
    viewport.playAvaMove(selectedAvaMove, selectedAvaKind);
    playingAvaMove = selectedAvaMove;
    playingAvaKind = selectedAvaKind;
    els.autoRotate.checked = false;
    viewport.setAutoRotate(false);
  } catch (error) {
    console.error(error);
    setProgress(error instanceof Error ? error.message : String(error));
    playingAvaMove = null;
    playingAvaKind = null;
  } finally {
    renderAvaList();
  }
}

function stopAvaPlayback() {
  viewport.stopAvaMove();
  playingAvaMove = null;
  playingAvaKind = null;
  renderAvaList();
}

function updateAvaMetadata() {
  const move = viewport.getAvaMoves().find((m) => m.name === selectedAvaMove);
  if (!move) {
    els.avaActive.textContent = '-';
    els.avaDuration.textContent = '-';
    els.avaTracks.textContent = '-';
    return;
  }

  els.avaActive.textContent = `${move.name} (${selectedAvaKind})`;
  els.avaDuration.textContent = move.ava.duration ? `${move.ava.duration.toFixed(2)}s` : '-';
  els.avaTracks.textContent = move.ava.tracks?.length ? String(move.ava.tracks.length) : '-';
}

function updateAvaStatus(status) {
  const statusTime = document.querySelector('#ava-status-time');
  if (statusTime) {
    const pct = status.duration > 0 ? Math.round((status.time / status.duration) * 100) : 0;
    statusTime.textContent = `${status.time.toFixed(2)}s / ${status.duration.toFixed(2)}s (${pct}%)`;
  }
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

function clampNumber(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function positiveModulo(value, size) {
  return ((value % size) + size) % size;
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
els.resetPose.addEventListener('click', () => viewport.resetPose());
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
els.moveBalance.addEventListener('change', applyMoveOptions);
els.beatTap.addEventListener('click', tapBeat);
els.beatSetBeat.addEventListener('click', () => setBeatNow('Beat aligned to now.'));
els.beatSetDownbeat.addEventListener('click', () => setBeatNow('Downbeat set to now.', true));
els.beatBpm.addEventListener('input', () => {
  const bpm = Number(els.beatBpm.value);
  setBeatBpm(bpm, `Manual BPM set to ${bpm.toFixed(1)}.`);
  beatState.confidence = Math.max(beatState.confidence, 0.6);
});
els.beatHalf.addEventListener('click', () => setBeatBpm(beatState.bpm / 2, 'BPM halved.'));
els.beatDouble.addEventListener('click', () => setBeatBpm(beatState.bpm * 2, 'BPM doubled.'));
els.beatReset.addEventListener('click', resetBeatSync);
els.beatOffset.addEventListener('input', () => setBeatOffset(els.beatOffset.value, 'Offset adjusted.'));
els.beatLock.addEventListener('change', () => {
  beatState.status = els.beatLock.checked ? 'BPM locked.' : 'BPM unlocked.';
  renderBeatState();
});
els.beatStartNextBeat.addEventListener('click', () => setBeatStartTarget(1, 'Next beat'));
els.beatStartNextBar.addEventListener('click', () => setBeatStartTarget(4, 'Next bar'));
els.beatSampleMic.addEventListener('click', startBeatSampling);
els.beatStopSampling.addEventListener('click', () => stopBeatSampling());
els.beatUseDetected.addEventListener('click', useDetectedBeatBpm);
els.beatNudgeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const deltaMs = Number(button.dataset.beatNudge);
    setBeatOffset(beatState.offsetMs + deltaMs, `Offset nudged ${formatSignedMs(deltaMs)}.`);
  });
});
els.avaPlay.addEventListener('click', playSelectedAva);
els.avaStop.addEventListener('click', stopAvaPlayback);
els.avaSpeed.addEventListener('input', applyAvaSpeed);
els.avaUseAvak.addEventListener('change', () => {
  viewport.setUseAvak(els.avaUseAvak.checked);
  if (playingAvaMove) {
    playSelectedAva();
  }
});
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
applyMoveSpeed();
applyMoveOptions();
applyAvaSpeed();
renderBeatState();
requestAnimationFrame(tickBeatState);
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
