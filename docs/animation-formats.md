# Animation File Formats: AVA / AVAR / AVAK

This document describes the three intermediate animation formats used in the
agatha-fe avatar viewer pipeline.

## Pipeline Overview

```
FBX (Mixamo)  →  AVA  →  AVAR  →  AVAK
                ↑        ↑        ↑
           source     target   diagnosed
           extraction retarget  target
```

- **AVA**: Source animation extracted from FBX, with rest-pose metadata.
- **AVAR**: AVA retargeted to a specific VRM avatar. Absolute baked values.
- **AVAK**: AVAR with foot-plant diagnosis metadata. Same track structure.

---

## AVA — Source Animation

**Purpose**: Capture animation data and skeleton rest pose from a Mixamo FBX
file in a backend-independent JSON structure.

**Produced by**: `FbxToAva.convert()` in `src/FbxToAva.js`

### Top-level shape

```json
{
  "format": "ava",
  "version": "1.0",
  "name": "Rumba Dancing",
  "source": "/models/Rumba Dancing.fbx",
  "sourceUnits": "cm",
  "sourceUnitScale": 0.01,
  "sourceHipsHeight": 0.92,
  "duration": 12.03,
  "skeleton": { "type": "human", "bones": [ ... ] },
  "tracks": [ ... ],
  "locks": [ ... ]
}
```

### Fields

| Field | Type | Description |
|---|---|---|
| `format` | `string` | Always `"ava"` |
| `version` | `string` | Format version, currently `"1.0"` |
| `name` | `string` | Human-readable clip name |
| `source` | `string` | Original FBX file path or label |
| `sourceUnits` | `string` | `"m"` or `"cm"` depending on inferred scale |
| `sourceUnitScale` | `number` | Multiplier to convert source units to meters |
| `sourceHipsHeight` | `number` | Hips rest height in meters |
| `duration` | `number` | Clip duration in seconds |
| `skeleton` | `object` | Source skeleton with rest-pose data |
| `tracks` | `array` | Animation tracks (quaternion/position per bone) |
| `locks` | `array` | Foot/hand plant hints |

### Skeleton bones

Each entry in `skeleton.bones`:

```json
{
  "name": "hips",
  "parent": null,
  "restPosition": [0, 0.92, 0],
  "restRotation": [0, 0, 0, 1],
  "restWorldRotation": [0, 0, 0, 1],
  "parentRestWorldRotation": [0, 0, 0, 1]
}
```

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Humanoid bone name (e.g. `"hips"`, `"leftUpperArm"`) |
| `parent` | `string\|null` | Parent humanoid bone name, or `null` for root |
| `restPosition` | `[x, y, z]` | Local rest translation in meters |
| `restRotation` | `[x, y, z, w]` | Local rest quaternion |
| `restWorldRotation` | `[x, y, z, w]` | World-space rest quaternion |
| `parentRestWorldRotation` | `[x, y, z, w]` | Parent world-space rest quaternion |

**Important**: Rest rotations are **not guaranteed to be identity** `[0,0,0,1]`.
They reflect the FBX skeleton's bind/T-pose as loaded by Three's `FBXLoader`,
including any pre-rotations or axis corrections the loader applied.

### Tracks

Each track:

```json
{
  "bone": "hips",
  "property": "position",
  "times": [0, 0.033, 0.066, ...],
  "values": [0, 0.92, 0, 0, 0.93, 0, ...]
}
```

| Field | Type | Description |
|---|---|---|
| `bone` | `string` | Humanoid bone name |
| `property` | `string` | `"quaternion"` or `"position"` |
| `times` | `number[]` | Keyframe times in seconds |
| `values` | `number[]` | Flat array: 4 floats per keyframe for quaternion, 3 for position |

Position values are scaled to meters. Quaternion values are the raw FBX local
rotations as loaded by Three.

### Locks

```json
[
  { "bone": "leftFoot", "planted": true },
  { "bone": "rightFoot", "planted": true },
  { "bone": "leftToes", "planted": false },
  { "bone": "rightToes", "planted": false },
  { "bone": "leftHand", "planted": false },
  { "bone": "rightHand", "planted": false }
]
```

Indicates which bones should be considered "planted" (in contact with ground
or a surface) for IK/foot-lock purposes.

---

## AVAR — Retargeted Animation

**Purpose**: Bake AVA animation for a specific target VRM avatar. Values are
absolute — the runtime applies them directly to VRM bone nodes.

**Produced by**: `AvaToAvar.bake()` in `src/AvaToAvar.js`

### Top-level shape

```json
{
  "format": "avar",
  "version": "1.0",
  "kind": "full",
  "name": "Rumba Dancing",
  "source": "/models/Rumba Dancing.fbx",
  "target": {
    "type": "vrm",
    "modelPath": "/models/avaAvatar.vrm",
    "boneMap": { "hips": "J_Bip_Hips", ... }
  },
  "sourceUnitScale": 0.01,
  "sourceHipsHeight": 0.92,
  "targetHipsHeight": 0.88,
  "positionScale": 0.957,
  "duration": 12.03,
  "tracks": [ ... ],
  "locks": [ ... ]
}
```

### Fields

| Field | Type | Description |
|---|---|---|
| `format` | `string` | Always `"avar"` |
| `version` | `string` | Format version, currently `"1.0"` |
| `kind` | `string` | `"full"`, `"upper"`, or `"lower"` (body-region filter) |
| `name` | `string` | Clip name (inherited from AVA) |
| `source` | `string` | Original FBX path (inherited from AVA) |
| `target.type` | `string` | Always `"vrm"` |
| `target.modelPath` | `string` | VRM model path used for baking |
| `target.boneMap` | `object` | Maps humanoid bone names → VRM node names |
| `sourceUnitScale` | `number` | Inherited from AVA |
| `sourceHipsHeight` | `number` | Inherited from AVA |
| `targetHipsHeight` | `number` | `sourceHipsHeight * positionScale` |
| `positionScale` | `number` | Ratio of VRM hips height to source hips height |
| `duration` | `number` | Clip duration in seconds |
| `tracks` | `array` | Baked tracks for target VRM |
| `locks` | `array` | Inherited from AVA |

### Tracks

Same structure as AVA tracks, but:

- `bone` is now a **VRM humanoid bone name** (e.g. `"hips"`, `"leftUpperArm"`).
- **Quaternion values** are baked: source rest-relative rotations have been
  folded in. They are absolute local rotations for the target VRM.
- **Position values** are scaled by `positionScale` and sign-flipped for VRM0.
- **No rest pose** is stored. Rest-pose data is consumed during baking and
  not preserved in AVAR.

### What "absolute" means here

AVAR quaternion values are applied directly by Three's `AnimationMixer` as
local bone rotations (blend mode `Replace`). They are **not** deltas relative
to a T-pose. The rest-pose math happened during baking.

This means:

- AVAR is **not portable** to a different VRM without re-baking from AVA.
- AVAR cannot be used as an additive layer on top of another animation.
- AVAR is replayed as-is for the specific target avatar it was baked for.

### Body-region splitting

`splitByRegion(avar, region)` in `src/AvaToAvar.js` filters tracks to either
`"upper"` or `"lower"` body bones. The `kind` field is updated accordingly.

---

## AVAK — Diagnosed Animation

**Purpose**: Wrap AVAR with foot-plant diagnosis metadata. Currently a thin
pass-through that logs foot-ground-penetration and plant-detection stats.

**Produced by**: `AvarToAvak.bake()` in `src/AvarToAvak.js`

### Top-level shape

```json
{
  "format": "avak",
  "version": "1.0",
  "kind": "full",
  "name": "Rumba Dancing",
  "source": "/models/Rumba Dancing.fbx",
  "target": { ... },
  "sourceUnitScale": 0.01,
  "sourceHipsHeight": 0.92,
  "targetHipsHeight": 0.88,
  "positionScale": 0.957,
  "duration": 12.03,
  "tracks": [ ... ],
  "locks": [ ... ]
}
```

### What AVAK adds

AVAK currently **spreads AVAR** (`...avar`) and overrides `format` to
`"avak"`. The track structure is identical to AVAR.

The `diagnose()` method runs the animation against the target VRM, samples
foot world positions at every keyframe time, and logs:

- VRM rest foot heights
- Min/max foot Y across the clip
- Frames where feet go below ground (`y < 0`)
- Frames where feet are near ground (`|y - 0| < 0.05`)
- Lock summary

This is diagnostic only — no track values are modified.

### Runtime behavior

`MovePlayer` treats AVAK the same as AVAR: it creates Three keyframe tracks
and plays them with an `AnimationMixer`. The diagnosis metadata is not stored
in the JSON; it is only logged to console during baking.

---

## Bone Names

All three formats use **VRM humanoid bone names** as the canonical naming
convention. The mapping from Mixamo bone names is defined in
`src/FbxToAva.js`:

| Mixamo | Humanoid |
|---|---|
| `mixamorigHips` | `hips` |
| `mixamorigSpine` | `spine` |
| `mixamorigSpine1` | `chest` |
| `mixamorigSpine2` | `upperChest` |
| `mixamorigNeck` | `neck` |
| `mixamorigHead` | `head` |
| `mixamorigLeftShoulder` | `leftShoulder` |
| `mixamorigLeftArm` | `leftUpperArm` |
| `mixamorigLeftForeArm` | `leftLowerArm` |
| `mixamorigLeftHand` | `leftHand` |
| `mixamorigRightShoulder` | `rightShoulder` |
| `mixamorigRightArm` | `rightUpperArm` |
| `mixamorigRightForeArm` | `rightLowerArm` |
| `mixamorigRightHand` | `rightHand` |
| `mixamorigLeftUpLeg` | `leftUpperLeg` |
| `mixamorigLeftLeg` | `leftLowerLeg` |
| `mixamorigLeftFoot` | `leftFoot` |
| `mixamorigLeftToeBase` | `leftToes` |
| `mixamorigRightUpLeg` | `rightUpperLeg` |
| `mixamorigRightLeg` | `rightLowerLeg` |
| `mixamorigRightFoot` | `rightFoot` |
| `mixamorigRightToeBase` | `rightToes` |

In AVAR/AVAK, `target.boneMap` maps humanoid names to actual VRM scene node
names (e.g. `"hips"` → `"J_Bip_Hips"`).

---

## Future: Additive Blend Support

Neither AVAR nor AVAK currently supports additive blending. To support
additive clips (e.g. head nod, wave):

1. **AVA**: Already stores rest pose — sufficient as additive reference.
2. **AVAR**: Would need a `blend: "additive"` flag and delta-from-rest
   values instead of absolute baked values.
3. **Playback**: Would use `THREE.AnimationBlendMode.Additive` with
   `action.weight` instead of default `Replace` mode.

Conceptual additive math:

```
delta = inverse(restRotation) * animatedRotation
final = base * slerp(identity, delta, weight)
```

This is not yet implemented.
