import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SimpleBalanceSolver } from '../src/SimpleBalanceSolver.js';

const POSITION_EPSILON = 1e-4;

const tests = [
  ['SimpleBalanceSolver corrects foot slip after lean', testSimpleBalanceCorrectsFootAfterLean],
  ['SimpleBalanceSolver does not accumulate hip lean', testSimpleBalanceDoesNotAccumulateLean],
];

for (const [name, test] of tests) {
  test();
  console.log(`ok - ${name}`);
}

function testSimpleBalanceCorrectsFootAfterLean() {
  const { vrm, foot } = createBalanceRig();
  const solver = new SimpleBalanceSolver({
    maxCorrection: 1,
    iterations: 1,
    maxLeanAngle: 0.2,
    leanReferenceDistance: 0.3,
  });
  const anchor = getObjectWorldPosition(foot);
  const result = solver.solve(vrm, [{ foot, anchor, weight: 1 }], () => {});
  const correctedFootPosition = getObjectWorldPosition(foot);

  assert.equal(result.applied, true);
  assert.equal(Math.abs(result.correction.y), 0);
  assert.ok(Math.abs(correctedFootPosition.x - anchor.x) < POSITION_EPSILON);
  assert.ok(Math.abs(correctedFootPosition.z - anchor.z) < POSITION_EPSILON);
}

function testSimpleBalanceDoesNotAccumulateLean() {
  const { vrm, hips, foot } = createBalanceRig();
  const solver = new SimpleBalanceSolver({
    maxCorrection: 0,
    iterations: 1,
    maxLeanAngle: 0.2,
    leanReferenceDistance: 0.3,
  });
  const anchor = getObjectWorldPosition(foot);

  solver.solve(vrm, [{ foot, anchor, weight: 1 }], () => {});
  const firstQuaternion = hips.getWorldQuaternion(new THREE.Quaternion()).clone();
  solver.solve(vrm, [{ foot, anchor, weight: 1 }], () => {});
  const secondQuaternion = hips.getWorldQuaternion(new THREE.Quaternion()).clone();

  assertQuaternionNear(secondQuaternion, firstQuaternion, 1e-6);
}

function createBalanceRig() {
  const scene = new THREE.Scene();
  const hips = new THREE.Object3D();
  const foot = new THREE.Object3D();
  const humanoid = {
    getNormalizedBoneNode(name) {
      return name === 'hips' ? hips : null;
    },
  };

  foot.position.set(0, -1, 1);
  hips.add(foot);
  scene.add(hips);
  scene.updateWorldMatrix(true, true);

  return { vrm: { humanoid, scene }, hips, foot };
}

function getObjectWorldPosition(object) {
  const position = new THREE.Vector3();
  object.getWorldPosition(position);
  return position;
}

function assertQuaternionNear(actual, expected, epsilon) {
  assert.ok(
    1 - Math.abs(actual.dot(expected)) < epsilon,
    `expected ${formatQuaternion(actual)} to be within ${epsilon} of ${formatQuaternion(expected)}`,
  );
}

function formatQuaternion(quaternion) {
  return `[${quaternion.x.toFixed(5)}, ${quaternion.y.toFixed(5)}, ${quaternion.z.toFixed(5)}, ${quaternion.w.toFixed(5)}]`;
}
