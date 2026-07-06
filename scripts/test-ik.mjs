import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  applyFootPlantHipOffset,
  makePolePoint,
  solveTwoBoneIK,
} from '../src/ik.js';

const POSITION_EPSILON = 1e-4;

const tests = [
  ['solveTwoBoneIK reaches a parented target', testParentedReach],
  ['solveTwoBoneIK follows the requested pole side', testPoleSide],
  ['applyFootPlantHipOffset removes horizontal foot slip', testFootPlantOffset],
  ['makePolePoint treats distance as distance', testPolePointDistance],
];

for (const [name, test] of tests) {
  test();
  console.log(`ok - ${name}`);
}

function testParentedReach() {
  const { scene, root, mid, end } = createChain();
  const parent = new THREE.Object3D();
  parent.position.set(1.25, 0.4, -0.75);
  parent.rotation.set(0.15, -0.45, 0.25);
  parent.add(root);
  scene.add(parent);
  scene.updateWorldMatrix(true, true);

  const rootPosition = new THREE.Vector3();
  root.getWorldPosition(rootPosition);
  const target = rootPosition.clone().add(new THREE.Vector3(0.55, 1.25, 0.45));
  const pole = rootPosition.clone().add(new THREE.Vector3(0.2, 0.4, 2));
  const result = solveTwoBoneIK({ root, mid, end, target, pole });

  const endPosition = new THREE.Vector3();
  end.getWorldPosition(endPosition);

  assert.equal(result.solved, true);
  assert.equal(result.reached, true);
  assertVectorNear(endPosition, target, POSITION_EPSILON);
}

function testPoleSide() {
  const { root, mid, end } = createChain();
  const target = new THREE.Vector3(0, 1.2, 1.2);
  const pole = new THREE.Vector3(2, 0, 0);
  const result = solveTwoBoneIK({ root, mid, end, target, pole });

  const midPosition = new THREE.Vector3();
  const endPosition = new THREE.Vector3();
  mid.getWorldPosition(midPosition);
  end.getWorldPosition(endPosition);

  assert.equal(result.solved, true);
  assert.equal(result.reached, true);
  assert.ok(result.desiredMidPosition.x > 0.1);
  assert.ok(midPosition.x > 0.1);
  assertVectorNear(endPosition, target, POSITION_EPSILON);
}

function testFootPlantOffset() {
  const hips = new THREE.Object3D();
  const foot = new THREE.Object3D();
  hips.add(foot);
  hips.position.set(1, 0.5, -2);
  foot.position.set(0.2, -1, 0.3);
  hips.updateWorldMatrix(true, true);

  const footPosition = new THREE.Vector3();
  foot.getWorldPosition(footPosition);
  const anchor = footPosition.clone().add(new THREE.Vector3(0.1, 0.4, -0.2));
  const result = applyFootPlantHipOffset({
    hips,
    plantedFeet: [{ foot, anchor, weight: 1, axes: { x: true, y: false, z: true } }],
    iterations: 1,
    maxCorrection: 1,
  });

  const correctedFootPosition = new THREE.Vector3();
  foot.getWorldPosition(correctedFootPosition);

  assert.equal(result.applied, true);
  assert.equal(Math.abs(result.correction.y), 0);
  assert.ok(Math.abs(correctedFootPosition.x - anchor.x) < POSITION_EPSILON);
  assert.ok(Math.abs(correctedFootPosition.z - anchor.z) < POSITION_EPSILON);
  assert.ok(Math.abs(correctedFootPosition.y - footPosition.y) < POSITION_EPSILON);
}

function testPolePointDistance() {
  const root = new THREE.Vector3(1, 2, 3);
  const point = makePolePoint(root, new THREE.Vector3(0, 0, 2), 5);

  assertVectorNear(point, new THREE.Vector3(1, 2, 8), POSITION_EPSILON);
}

function createChain() {
  const scene = new THREE.Scene();
  const root = new THREE.Object3D();
  const mid = new THREE.Object3D();
  const end = new THREE.Object3D();

  mid.position.set(0, 1, 0);
  end.position.set(0, 1, 0);
  root.add(mid);
  mid.add(end);
  scene.add(root);
  scene.updateWorldMatrix(true, true);

  return { scene, root, mid, end };
}

function assertVectorNear(actual, expected, epsilon) {
  assert.ok(
    actual.distanceTo(expected) < epsilon,
    `expected ${formatVector(actual)} to be within ${epsilon} of ${formatVector(expected)}`,
  );
}

function formatVector(vector) {
  return `[${vector.x.toFixed(5)}, ${vector.y.toFixed(5)}, ${vector.z.toFixed(5)}]`;
}
