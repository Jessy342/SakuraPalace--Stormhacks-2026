// Poses for the VRoid models. A pose is { boneName: [x, y, z] } in radians on the standard VRM humanoid bones
// (the same bones for every model, so one pose works on all characters).
//
// How the numbers work, with the character facing you:
//   upper arm  z: lowers/raises the arm (left arm: negative = down; right arm: positive = down)
//              x: swings a hanging arm forward (negative) or back (positive)
//   lower arm  y: bends the elbow forward (left: negative, right: positive)
//              z: bends the elbow inward / upward (left: positive = up, right: negative = up)
//   fingers    0 = straight, 1 = curled into the palm
const ARM = 1.3; // arms hanging at the sides

/** Arms relaxed at the sides. Every other pose is blended on top of this. */
export const DEFAULT = {
  leftUpperArm: [0, 0, -ARM], rightUpperArm: [0, 0, ARM], leftLowerArm: [0, -0.25, 0], rightLowerArm: [0, 0.25, 0],
  fingers: { left: 0.25, right: 0.25 },
};

// ---- how each personality stands while idle ----
const HAND_ON_HIP_R = { rightUpperArm: [0.35, 0, 0.78], rightLowerArm: [0, 0.5, 1.35] };
const HAND_ON_HIP_L = { leftUpperArm: [0.35, 0, -0.78], leftLowerArm: [0, -0.5, -1.35] };
export const REST = {
  tsundere: { ...HAND_ON_HIP_R, hips: [0, 0, 0.05], spine: [0, 0, -0.05], head: [-0.05, -0.12, 0.05], fingers: { left: 0.25, right: 0.6 } },
  cheerful: { leftUpperArm: [-0.15, 0, -1.12], rightUpperArm: [-0.15, 0, 1.12], leftLowerArm: [0, -0.55, 0], rightLowerArm: [0, 0.55, 0], head: [0, 0, 0.09] },
  sensei: { leftUpperArm: [0.3, 0, -1.22], rightUpperArm: [0.3, 0, 1.22], leftLowerArm: [0, 0.15, -0.7], rightLowerArm: [0, -0.15, 0.7], spine: [-0.03, 0, 0], head: [0.03, 0, 0] },
  chill: { leftUpperArm: [0.12, 0, -1.2], rightUpperArm: [0.12, 0, 1.2], leftLowerArm: [0, -0.45, 0], rightLowerArm: [0, 0.45, 0], spine: [0.07, 0, 0.03], hips: [0, 0, -0.04], head: [0.04, 0.08, -0.06], fingers: { left: 0.6, right: 0.6 } },
  rival: { ...HAND_ON_HIP_R, ...HAND_ON_HIP_L, spine: [-0.06, 0, 0], head: [-0.06, 0, 0], fingers: { left: 0.9, right: 0.9 } },
};

// ---- the pose each personality strikes when summoned ----
export const SIGNATURE = {
  // hand on hip, the other hand flicking her hair
  tsundere: { ...HAND_ON_HIP_R, leftUpperArm: [-0.25, 0, -0.35], leftLowerArm: [0, -0.3, 2.05], hips: [0, 0, 0.07], spine: [0, 0.1, -0.07], head: [-0.08, -0.22, 0.08], fingers: { left: 0.3, right: 0.6 } },
  // peace sign by the face, other hand on hip
  cheerful: { ...HAND_ON_HIP_L, rightUpperArm: [-0.45, 0, 0.3], rightLowerArm: [0, 0.35, -2.1], hips: [0, 0, -0.06], spine: [0, -0.08, 0.06], head: [0, 0.08, -0.14],
    fingers: { left: 0.6, right: { index: 0, middle: 0, ring: 1, little: 1, thumb: 0.8 } } },
  // thinking: hand to the chin, other arm folded across
  sensei: { rightUpperArm: [-0.75, 0, 1.2], rightLowerArm: [0, 2.15, 0], leftUpperArm: [-0.35, 0, -1.2], leftLowerArm: [0, -1.45, 0.35], spine: [0.02, 0.06, 0], head: [0.06, -0.1, 0.05], fingers: { left: 0.5, right: 0.7 } },
  // lazy: one hand behind the head
  chill: { leftUpperArm: [-0.4, 0, 0.75], leftLowerArm: [0, 0, 2.3], rightUpperArm: [0.12, 0, 1.2], rightLowerArm: [0, 0.45, 0], hips: [0, 0, -0.06], spine: [0.04, 0, 0.07], head: [0.02, 0.1, -0.1], fingers: { left: 0.4, right: 0.6 } },
  // pointing straight at you, fist on hip
  rival: { ...HAND_ON_HIP_L, rightUpperArm: [-1.45, 0, 1.55], rightLowerArm: [0, 0.05, 0], spine: [-0.04, 0.32, 0], head: [-0.05, -0.05, 0],
    fingers: { left: 0.9, right: { index: 0, middle: 1, ring: 1, little: 1, thumb: 0.6 } } },
};

/** Falling in from above: arms flung up and out. Blends into the signature pose on landing. */
export const FALL = { leftUpperArm: [0, 0, 0.55], rightUpperArm: [0, 0, -0.55], leftLowerArm: [0, -0.3, 0.4], rightLowerArm: [0, 0.3, -0.4], spine: [-0.12, 0, 0], head: [-0.15, 0, 0], fingers: { left: 0, right: 0 } };

// ---- little things a character does now and then while idle: [pose, seconds] ----
export const GESTURES = [
  [{ leftUpperArm: [0, 0, 1.15], rightUpperArm: [0, 0, -1.15], leftLowerArm: [0, 0, 0.5], rightLowerArm: [0, 0, -0.5], spine: [-0.12, 0, 0], head: [-0.2, 0, 0], fingers: { left: 0, right: 0 } }, 2.8], // big stretch
  [{ leftUpperArm: [-0.25, 0, -0.35], leftLowerArm: [0, -0.3, 2.05], head: [0, -0.15, 0.08] }, 2.6],  // touch her hair
  [{ head: [0, 0.5, 0], spine: [0, 0.12, 0] }, 2.2],                                                   // look to one side
  [{ head: [0, -0.5, 0], spine: [0, -0.12, 0] }, 2.2],                                                 // look to the other side
  [{ hips: [0, 0, -0.08], spine: [0, 0, 0.07], head: [0, 0, 0.1] }, 3.2],                              // shift weight
  [{ rightUpperArm: [-0.75, 0, 1.2], rightLowerArm: [0, 2.15, 0], head: [0.06, -0.08, 0.05] }, 3],     // hand to chin, thinking
];

// ---- quick happy reactions (putting on a new item): [pose, seconds] ----
export const REACTIONS = [
  [{ leftUpperArm: [0, 0, -0.4], rightUpperArm: [0, 0, 0.4], leftLowerArm: [0, 0, 1.8], rightLowerArm: [0, 0, -1.8], head: [-0.1, 0, 0], spine: [-0.05, 0, 0], fingers: { left: 0.9, right: 0.9 } }, 2.0], // both fists up: yay!
  [{ rightUpperArm: [-0.75, 0, 1.2], rightLowerArm: [0, 2.15, 0], head: [0.05, -0.1, 0.14], spine: [0, 0, 0.04] }, 2.4],   // hand to her cheek, admiring
  [{ leftUpperArm: [0, 0, -0.9], rightUpperArm: [0, 0, 0.9], head: [0.3, 0, 0], spine: [0.08, 0, 0], fingers: { left: 0, right: 0 } }, 2.4], // arms out a little, looking down at herself
  [{ leftUpperArm: [-0.25, 0, -0.35], leftLowerArm: [0, -0.3, 2.05], head: [0.04, -0.15, 0.1] }, 2.2], // touches her hair, pleased
];

const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm',
  'leftUpperLeg', 'rightUpperLeg', 'leftLowerLeg', 'rightLowerLeg'];
const FINGERS = ['index', 'middle', 'ring', 'little', 'thumb'];
const ZERO = [0, 0, 0];
const fingerAmounts = f => (typeof f === 'number' ? Object.fromEntries(FINGERS.map(k => [k, k === 'thumb' ? f * 0.5 : f])) : f || {});

/** Mixes two poses: t = 0 gives a, t = 1 gives b. Bones a pose doesn't mention use the DEFAULT stance. */
export function blend(a, b, t) {
  const out = { fingers: {} };
  for (const bone of BONES) {
    const pa = a[bone] || DEFAULT[bone] || ZERO, pb = b[bone] || DEFAULT[bone] || ZERO;
    out[bone] = [pa[0] + (pb[0] - pa[0]) * t, pa[1] + (pb[1] - pa[1]) * t, pa[2] + (pb[2] - pa[2]) * t];
  }
  for (const side of ['left', 'right']) {
    const fa = fingerAmounts((a.fingers || DEFAULT.fingers)[side]), fb = fingerAmounts((b.fingers || DEFAULT.fingers)[side]);
    out.fingers[side] = Object.fromEntries(FINGERS.map(k => [k, (fa[k] || 0) + ((fb[k] || 0) - (fa[k] || 0)) * t]));
  }
  return out;
}

/** Puts a (blended) pose onto a VRM model. */
export function writePose(vrm, pose) {
  const hum = vrm.humanoid;
  for (const bone of BONES) {
    const node = hum.getNormalizedBoneNode(bone), r = pose[bone];
    if (node && r) node.rotation.set(r[0], r[1], r[2]);
  }
  for (const side of ['left', 'right']) {
    const dir = side === 'left' ? -1 : 1;
    const amounts = fingerAmounts(pose.fingers?.[side]);
    for (const finger of FINGERS) {
      const curl = (amounts[finger] || 0) * 1.25 * dir;
      for (const joint of finger === 'thumb' ? ['Metacarpal', 'Proximal', 'Distal'] : ['Proximal', 'Intermediate', 'Distal']) {
        const node = hum.getNormalizedBoneNode(side + finger[0].toUpperCase() + finger.slice(1) + joint);
        if (!node) continue;
        if (finger === 'thumb') node.rotation.set(0, -curl * 0.5, 0); // the thumb folds across the palm
        else node.rotation.set(0, 0, curl);
      }
    }
  }
}
