import * as THREE from 'three';

const EPSILON = 1e-5;
const DEFAULT_PLANT_AXES = Object.freeze({ x: true, y: false, z: true });

export const VRM_LIMB_CHAINS = Object.freeze({
  leftArm: ['leftUpperArm', 'leftLowerArm', 'leftHand'],
  rightArm: ['rightUpperArm', 'rightLowerArm', 'rightHand'],
  leftLeg: ['leftUpperLeg', 'leftLowerLeg', 'leftFoot'],
  rightLeg: ['rightUpperLeg', 'rightLowerLeg', 'rightFoot'],
});

export function getNormalizedLimbChain(vrmOrHumanoid, chainName) {
  const names = VRM_LIMB_CHAINS[chainName];
  if (!names) {
    throw new Error(`Unknown VRM limb chain: ${chainName}`);
  }

  const humanoid = vrmOrHumanoid?.humanoid || vrmOrHumanoid;
  if (!humanoid) return null;

  const [rootName, midName, endName] = names;
  const root = getNormalizedBoneNode(humanoid, rootName);
  const mid = getNormalizedBoneNode(humanoid, midName);
  const end = getNormalizedBoneNode(humanoid, endName);

  if (!root || !mid || !end) return null;

  return {
    name: chainName,
    names: { root: rootName, mid: midName, end: endName },
    root,
    mid,
    end,
  };
}

export function solveLimbIK(chain, target, pole, options = {}) {
  return solveTwoBoneIK({
    root: chain.root,
    mid: chain.mid,
    end: chain.end,
    target,
    pole,
    ...options,
  });
}

export function solveTwoBoneIK({
  root,
  mid,
  end,
  target,
  pole,
  endQuaternion = null,
}) {
  assertObject3D(root, 'root');
  assertObject3D(mid, 'mid');
  assertObject3D(end, 'end');

  const rootPos = new THREE.Vector3();
  const midPos = new THREE.Vector3();
  const endPos = new THREE.Vector3();
  const targetPos = new THREE.Vector3();

  root.updateWorldMatrix(true, true);
  root.getWorldPosition(rootPos);
  mid.getWorldPosition(midPos);
  end.getWorldPosition(endPos);
  readWorldPosition(target, targetPos);

  const upperLength = rootPos.distanceTo(midPos);
  const lowerLength = midPos.distanceTo(endPos);
  if (upperLength < EPSILON || lowerLength < EPSILON) {
    return {
      solved: false,
      reached: false,
      reason: 'Limb segment length is too small',
      upperLength,
      lowerLength,
    };
  }

  const targetDirection = new THREE.Vector3().subVectors(targetPos, rootPos);
  const requestedDistance = targetDirection.length();
  if (requestedDistance < EPSILON) {
    targetDirection.subVectors(endPos, rootPos);
  }
  if (targetDirection.lengthSq() < EPSILON) {
    targetDirection.set(0, 0, 1);
  }
  targetDirection.normalize();

  const maxReach = upperLength + lowerLength - EPSILON;
  const minReach = Math.max(Math.abs(upperLength - lowerLength) + EPSILON, EPSILON);
  const solveDistance = THREE.MathUtils.clamp(
    requestedDistance || minReach,
    minReach,
    maxReach,
  );

  const poleDirection = resolvePoleDirection({
    rootPosition: rootPos,
    midPosition: midPos,
    targetDirection,
    pole,
  });

  const alongTarget =
    (upperLength * upperLength - lowerLength * lowerLength + solveDistance * solveDistance) /
    (2 * solveDistance);
  const bendHeight = Math.sqrt(Math.max(upperLength * upperLength - alongTarget * alongTarget, 0));

  const desiredEndPosition = new THREE.Vector3()
    .copy(targetDirection)
    .multiplyScalar(solveDistance)
    .add(rootPos);
  const desiredMidPosition = new THREE.Vector3()
    .copy(targetDirection)
    .multiplyScalar(alongTarget)
    .addScaledVector(poleDirection, bendHeight)
    .add(rootPos);

  rotateObjectToPointAt(root, midPos, desiredMidPosition);
  root.updateWorldMatrix(true, true);

  mid.getWorldPosition(midPos);
  end.getWorldPosition(endPos);
  rotateObjectToPointAt(mid, endPos, desiredEndPosition);
  root.updateWorldMatrix(true, true);

  if (endQuaternion) {
    const eq = new THREE.Quaternion();
    setWorldQuaternion(end, readWorldQuaternion(endQuaternion, eq));
  }

  return {
    solved: true,
    reached: requestedDistance <= maxReach && requestedDistance >= minReach,
    requestedDistance,
    solveDistance,
    upperLength,
    lowerLength,
    desiredMidPosition: desiredMidPosition.clone(),
    desiredEndPosition: desiredEndPosition.clone(),
  };
}

export function captureFootPlant(foot, options = {}) {
  assertObject3D(foot, 'foot');
  return {
    foot,
    anchor: getWorldPosition(foot, new THREE.Vector3()),
    weight: options.weight ?? 1,
    axes: options.axes || DEFAULT_PLANT_AXES,
  };
}

export function applyFootPlantHipOffset({
  hips,
  root,
  plantedFeet,
  solve,
  iterations = 1,
  maxCorrection = 0.12,
  axes = DEFAULT_PLANT_AXES,
}) {
  const objectToMove = hips || root;
  assertObject3D(objectToMove, 'hips/root');

  const feet = (plantedFeet || []).filter(Boolean);
  const totalCorrection = new THREE.Vector3();
  const slips = [];

  for (let i = 0; i < iterations; i += 1) {
    solve?.();

    const weightedSlip = new THREE.Vector3();
    let totalWeight = 0;
    slips.length = 0;

    feet.forEach((plant) => {
      const foot = plant.foot || plant.end || plant.object;
      if (!foot) return;

      const anchor = readWorldPosition(plant.anchor || plant.target, new THREE.Vector3());
      const footPosition = getWorldPosition(foot, new THREE.Vector3());
      const slip = footPosition.sub(anchor);
      maskAxes(slip, plant.axes || axes);

      const weight = plant.weight ?? 1;
      weightedSlip.addScaledVector(slip, weight);
      totalWeight += weight;
      slips.push({ foot, slip: slip.clone(), weight });
    });

    if (totalWeight <= 0) break;

    const correction = weightedSlip.multiplyScalar(-1 / totalWeight);
    clampLength(correction, maxCorrection);

    if (correction.lengthSq() < EPSILON * EPSILON) break;

    applyWorldOffset(objectToMove, correction);
    totalCorrection.add(correction);
  }

  solve?.();

  return {
    applied: totalCorrection.lengthSq() > EPSILON * EPSILON,
    correction: totalCorrection,
    slips,
  };
}

export function derivePoleDirection(rootPosition, endPosition, jointPosition, target = new THREE.Vector3()) {
  const rootPos = readWorldPosition(rootPosition, new THREE.Vector3());
  const endPos = readWorldPosition(endPosition, new THREE.Vector3());
  const jointPos = readWorldPosition(jointPosition, new THREE.Vector3());
  const limbDirection = endPos.sub(rootPos);
  if (limbDirection.lengthSq() < EPSILON * EPSILON) {
    return target.set(0, 1, 0);
  }
  limbDirection.normalize();

  const jointOffset = jointPos.sub(rootPos);
  const alongLimb = limbDirection.clone().multiplyScalar(jointOffset.dot(limbDirection));

  target.copy(jointOffset.sub(alongLimb));
  if (target.lengthSq() < EPSILON * EPSILON) {
    target.copy(makeFallbackPoleDirection(limbDirection));
  } else {
    target.normalize();
  }
  return target;
}

export function makePolePoint(rootPosition, poleDirection, distance, target = new THREE.Vector3()) {
  const rootPos = readWorldPosition(rootPosition, new THREE.Vector3());
  const direction = readWorldDirection(poleDirection, new THREE.Vector3());
  return target.copy(rootPos).addScaledVector(direction, distance);
}

export function applyWorldOffset(object, worldOffset) {
  assertObject3D(object, 'object');
  const offset = readWorldDirection(worldOffset, new THREE.Vector3());
  if (offset.lengthSq() < EPSILON * EPSILON) return object;

  if (!object.parent) {
    object.position.add(offset);
    object.updateWorldMatrix(true, true);
    return object;
  }

  const objWorldPos = new THREE.Vector3();
  const offsetWorld = new THREE.Vector3();
  const currentLocal = new THREE.Vector3();
  const targetLocal = new THREE.Vector3();

  object.updateWorldMatrix(true, false);
  object.getWorldPosition(objWorldPos);
  offsetWorld.copy(objWorldPos).add(offset);

  object.parent.updateWorldMatrix(true, false);
  currentLocal.copy(objWorldPos);
  object.parent.worldToLocal(currentLocal);
  targetLocal.copy(offsetWorld);
  object.parent.worldToLocal(targetLocal);

  object.position.add(targetLocal.sub(currentLocal));
  object.updateWorldMatrix(true, true);
  return object;
}

export function setWorldQuaternion(object, worldQuaternion) {
  assertObject3D(object, 'object');
  const targetWorldQuaternion = worldQuaternion.clone();

  if (!object.parent) {
    object.quaternion.copy(targetWorldQuaternion);
    object.updateWorldMatrix(true, true);
    return object;
  }

  const parentWorldQuat = new THREE.Quaternion();
  object.parent.updateWorldMatrix(true, false);
  object.parent.getWorldQuaternion(parentWorldQuat);
  object.quaternion.copy(parentWorldQuat.invert().multiply(targetWorldQuaternion));
  object.updateWorldMatrix(true, true);
  return object;
}

function getNormalizedBoneNode(humanoid, name) {
  const node = humanoid.getNormalizedBoneNode?.(name);
  if (node) return node;

  const bone = humanoid.getNormalizedBone?.(name);
  return bone?.node || bone || null;
}

function rotateObjectToPointAt(object, currentChildPosition, targetChildPosition) {
  const objectPos = new THREE.Vector3();
  object.getWorldPosition(objectPos);
  const currentDirection = new THREE.Vector3().subVectors(currentChildPosition, objectPos);
  const targetDirection = new THREE.Vector3().subVectors(targetChildPosition, objectPos);

  if (currentDirection.lengthSq() < EPSILON * EPSILON) return false;
  if (targetDirection.lengthSq() < EPSILON * EPSILON) return false;

  currentDirection.normalize();
  targetDirection.normalize();

  const deltaQuat = new THREE.Quaternion().setFromUnitVectors(currentDirection, targetDirection);
  const worldQuat = new THREE.Quaternion();
  object.getWorldQuaternion(worldQuat);
  worldQuat.premultiply(deltaQuat);
  setWorldQuaternion(object, worldQuat);
  return true;
}

function resolvePoleDirection({
  rootPosition,
  midPosition,
  targetDirection,
  pole,
}) {
  const polePos = new THREE.Vector3();

  if (pole) {
    readWorldPosition(pole, polePos).sub(rootPosition);
  } else {
    polePos.subVectors(midPosition, rootPosition);
  }

  polePos.addScaledVector(targetDirection, -polePos.dot(targetDirection));

  if (polePos.lengthSq() < EPSILON * EPSILON) {
    polePos.subVectors(midPosition, rootPosition);
    polePos.addScaledVector(targetDirection, -polePos.dot(targetDirection));
  }

  if (polePos.lengthSq() < EPSILON * EPSILON) {
    polePos.copy(makeFallbackPoleDirection(targetDirection));
  } else {
    polePos.normalize();
  }

  return polePos.clone();
}

function makeFallbackPoleDirection(direction) {
  const fallback = Math.abs(direction.y) < 0.9
    ? new THREE.Vector3(0, 1, 0)
    : new THREE.Vector3(1, 0, 0);

  fallback.addScaledVector(direction, -fallback.dot(direction));
  return fallback.normalize();
}

function readWorldPosition(value, target) {
  if (!value) {
    throw new Error('Expected a position, Object3D, Vector3, array, or { x, y, z } object');
  }

  if (value.isObject3D) return value.getWorldPosition(target);
  if (value.isVector3) return target.copy(value);
  if (Array.isArray(value)) return target.fromArray(value);

  if (
    typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    typeof value.z === 'number'
  ) {
    return target.set(value.x, value.y, value.z);
  }

  throw new Error('Unsupported position value');
}

function readWorldDirection(value, target) {
  readWorldPosition(value, target);
  return target;
}

function readWorldQuaternion(value, target) {
  if (value.isQuaternion) return target.copy(value);
  if (Array.isArray(value)) return target.fromArray(value);

  if (
    typeof value.x === 'number' &&
    typeof value.y === 'number' &&
    typeof value.z === 'number' &&
    typeof value.w === 'number'
  ) {
    return target.set(value.x, value.y, value.z, value.w);
  }

  throw new Error('Unsupported quaternion value');
}

function getWorldPosition(object, target) {
  object.updateWorldMatrix(true, false);
  return object.getWorldPosition(target);
}

function maskAxes(vector, axes) {
  if (axes.x === false) vector.x = 0;
  if (axes.y === false) vector.y = 0;
  if (axes.z === false) vector.z = 0;
  return vector;
}

function clampLength(vector, maxLength) {
  if (!Number.isFinite(maxLength) || maxLength <= 0) return vector.set(0, 0, 0);

  const length = vector.length();
  if (length > maxLength) {
    vector.multiplyScalar(maxLength / length);
  }
  return vector;
}

function assertObject3D(value, label) {
  if (!value?.isObject3D) {
    throw new Error(`Expected ${label} to be a THREE.Object3D`);
  }
}
