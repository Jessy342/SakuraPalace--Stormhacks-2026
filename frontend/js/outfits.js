// Outfits: clothes built from simple 3D shapes and fitted onto any VRoid model.
// The model's own clothes are hidden and the new pieces are attached to its bones (torso, sleeves, legs...),
// sized from that model's bone positions, so one outfit fits every character.
// All outfits have long sleeves and a full torso on purpose: VRoid deletes the skin hidden under the original
// clothes (most male models have no torso or upper arms underneath), so an outfit must cover those areas.
import * as THREE from 'three';

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });

// top: main colour. yoke: colour of the shoulders/upper chest. sleeves: 'slim' | 'baggy' | 'bell'.
// legs: 'pants' | 'baggy' | 'skirt' | 'robe'. Everything else is an optional extra.
export const OUTFITS = {
  scout: { name: 'Scout Uniform', top: '#8a5a34', shirt: '#9aa0a8', cropped: true, sleeves: 'slim', legs: 'pants', legColor: '#f4f1ea', cravat: '#ffffff', straps: '#4a2d1c', boots: '#4a2d1c', waistCape: '#5a3a24' },
  kimono_pink: { name: 'Sakura Kimono', top: '#f7c6d6', sleeves: 'bell', legs: 'robe', legColor: '#f7c6d6', obi: '#9bbf8a', vneck: '#fff5f8', hem: '#ef9db8' },
  kimono_navy: { name: 'Indigo Kimono', top: '#27366b', sleeves: 'bell', legs: 'robe', legColor: '#27366b', obi: '#c9a45c', vneck: '#e9ecf7', hem: '#1a2450' },
  kimono_red: { name: 'Crimson Kimono', top: '#b3243a', sleeves: 'bell', legs: 'robe', legColor: '#b3243a', obi: '#f1d27a', vneck: '#fff', hem: '#7d1526' },
  kimono_black: { name: 'Midnight Kimono', top: '#1c1b26', sleeves: 'bell', legs: 'robe', legColor: '#1c1b26', obi: '#8f3fd0', vneck: '#cfcfe0', hem: '#3a2d5c' },
  tracksuit: { name: 'Track Suit', top: '#f4f4f6', yoke: '#16161c', sleeves: 'slim', sleeveColor: '#16161c', cuffs: '#f2b01e', collar: '#f2b01e', zip: '#16161c', legs: 'pants', legColor: '#16161c', stripe: '#f2b01e' },
  maid: { name: 'Maid Outfit', top: '#1f1f2a', sleeves: 'slim', cuffs: '#ffffff', collar: '#ffffff', legs: 'skirt', legColor: '#1f1f2a', skirtLength: 0.62, apron: '#ffffff', headband: '#ffffff' },
  onesie_shark: { name: 'Shark Onesie', top: '#5f8fc4', belly: '#f2f6fb', sleeves: 'baggy', legs: 'baggy', legColor: '#5f8fc4', hood: 'shark', tail: 'shark' },
  onesie_bear: { name: 'Bear Onesie', top: '#a9774c', belly: '#f1dcc0', sleeves: 'baggy', legs: 'baggy', legColor: '#a9774c', hood: 'bear', tail: 'bear' },
  onesie_cat: { name: 'Cat Onesie', top: '#f1f1f4', belly: '#ffd9e6', sleeves: 'baggy', legs: 'baggy', legColor: '#f1f1f4', hood: 'cat', tail: 'cat' },
  hoodie: { name: 'Cozy Hoodie', top: '#ff8fb8', sleeves: 'baggy', cuffs: '#ffffff', collar: '#ffffff', pocket: '#f77aa8', legs: 'pants', legColor: '#3d4a7a' },
  idol: { name: 'Idol Dress', top: '#ffffff', yoke: '#7ad7ff', sleeves: 'bell', sleeveColor: '#ffffff', cuffs: '#ff8fd0', collar: '#ff8fd0', legs: 'skirt', legColor: '#7ad7ff', skirtLength: 0.5, flare: 1.5, obi: '#ff8fd0', hem: '#ffffff' },
  blazer: { name: 'School Blazer', top: '#2b3a67', sleeves: 'slim', collar: '#ffffff', vneck: '#ffffff', cravat: '#c8324a', legs: 'pants', legColor: '#6f7684' },
};

const Y = new THREE.Vector3(0, 1, 0);

/** A tapered tube from point a to point b (radius ra at a, rb at b), optionally squashed: sx/sz scale its two cross-section axes. */
function tube(a, b, ra, rb, material, sx = 1, sz = 1) {
  const len = a.distanceTo(b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rb, ra, len, 20), material);
  m.position.copy(a).add(b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(Y, b.clone().sub(a).normalize());
  m.scale.set(sx, 1, sz);
  return m;
}
function ball(p, r, material, sx = 1, sy = 1, sz = 1) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 14), material);
  m.position.copy(p); m.scale.set(sx, sy, sz);
  return m;
}
function box(p, w, h, d, material) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.copy(p);
  return m;
}
const v = (x, y, z) => new THREE.Vector3(x, y, z);

/**
 * Dresses a model. Call with the model standing in its rest pose and its root un-rotated.
 * Returns { remove() } which takes the outfit off and shows the original clothes again.
 */
export function wearOutfit(vrm, id) {
  const o = OUTFITS[id];
  if (!o) return null;
  const hum = vrm.humanoid;
  hum.resetNormalizedPose();
  hum.update();
  vrm.scene.updateMatrixWorld(true);
  const bone = name => hum.getRawBoneNode(name);
  const P = name => { const n = bone(name); return n ? n.getWorldPosition(new THREE.Vector3()) : null; };
  const pieces = [];
  const put = (mesh, boneName) => { const b = bone(boneName) || bone('hips'); mesh.frustumCulled = false; b.attach(mesh); pieces.push(mesh); return mesh; };

  // --- measurements of this model ---
  const hips = P('hips'), chest = P('upperChest') || P('chest'), neck = P('neck'), head = P('head');
  const chestBone = bone('upperChest') ? 'upperChest' : 'chest';
  const shoulder = Math.abs(P('leftUpperArm').x - hips.x);              // half the shoulder width
  const hipHalf = Math.abs(P('leftUpperLeg').x - hips.x);
  const legTop = P('leftUpperLeg').y, footY = P('leftFoot').y;
  const wx = shoulder * 0.9 + 0.035, wz = wx * 0.95;                    // torso half-width and half-depth
  const fwd = 0.02;                                                     // garments sit a touch forward (chest)
  const waistY = hips.y + (chest.y - hips.y) * 0.35;

  const main = mat(o.top), sleeveMat = mat(o.sleeveColor || o.top), legMat = mat(o.legColor || o.top);
  const baggy = o.sleeves === 'baggy' ? 1.14 : 1;

  // --- torso: one smooth shape from the hips to the neck (narrow waist, wider chest, sloping shoulders) ---
  const y0 = hips.y - 0.05, y1 = neck.y + 0.015;
  const shape = (from, to, grow, material) => {
    const profile = [[0, 0.9], [0.25, 0.83], [0.45, 0.85], [0.7, 1], [0.86, 0.97], [0.95, 0.6], [1, 0.36]];
    const pts = [];
    for (let k = 0; k <= 24; k++) {
      const t = from + (to - from) * k / 24;
      let n = profile.findIndex(q => q[0] >= t); if (n < 1) n = 1;
      const [ta, ra] = profile[n - 1], [tb, rb] = profile[n];
      pts.push(new THREE.Vector2((ra + (rb - ra) * (t - ta) / (tb - ta)) * wx * grow, y0 + (y1 - y0) * t));
    }
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 28), material);
    m.material.side = THREE.DoubleSide; m.position.set(hips.x, 0, fwd); m.scale.set(1, 1, wz / wx);
    return put(m, 'spine');
  };
  const upperMat = o.yoke ? mat(o.yoke) : main;
  shape(0, 1, baggy, o.cropped ? mat(o.shirt) : main);
  if (o.cropped) shape(0.48, 1, baggy * 1.03, main);          // a short jacket over the shirt
  if (o.yoke) shape(0.7, 1, baggy * 1.02, upperMat);          // coloured shoulders
  if (o.belly) put(ball(v(hips.x, (hips.y + chest.y) / 2, fwd + wz * baggy * 0.5), wx * 0.6, mat(o.belly), 1, 1.25, 0.6), 'spine');
  if (o.collar) { const c = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.016, 10, 24), mat(o.collar)); c.position.set(hips.x, neck.y + 0.012, 0.004); c.rotation.x = Math.PI / 2; put(c, 'neck'); }
  if (o.vneck) for (const s of [-1, 1]) { // the two crossing lapels of a kimono or blazer
    const lap = box(v(hips.x + s * wx * 0.2, chest.y + (neck.y - chest.y) * 0.25, fwd + wz * 0.93), 0.03, (neck.y - chest.y) * 1.25, 0.012, mat(o.vneck));
    lap.rotation.z = s * 0.42; lap.rotation.x = -0.12; put(lap, chestBone);
  }
  if (o.zip) put(box(v(hips.x, (hips.y + neck.y) / 2, fwd + wz * 0.98), 0.012, neck.y - hips.y - 0.04, 0.012, mat(o.zip)), 'spine');
  if (o.pocket) put(box(v(hips.x, hips.y + 0.08, fwd + wz * baggy * 0.95), wx * 1.1, 0.085, 0.02, mat(o.pocket)), 'spine');
  if (o.cravat) put(ball(v(hips.x, neck.y - 0.03, fwd + wz * 0.6), 0.04, mat(o.cravat), 1, 1.3, 0.5), chestBone);
  if (o.obi) { // a wide sash, with a bow at the back
    put(tube(v(hips.x, waistY - 0.055, fwd), v(hips.x, waistY + 0.065, fwd), wx * 0.9, wx * 0.93, mat(o.obi), 1, wz / wx * 1.03), 'spine');
    put(box(v(hips.x, waistY + 0.01, -wz * 1.05), wx * 1.1, 0.1, 0.05, mat(o.obi)), 'spine');
  }

  // --- arms ---
  for (const side of ['left', 'right']) {
    const a = P(side + 'UpperArm'), e = P(side + 'LowerArm'), h = P(side + 'Hand');
    const wrist = e.clone().lerp(h, 0.9);
    if (o.sleeves === 'bell') { // wide sleeves that open toward the wrist (tall and flat, so they hang like panels)
      put(tube(a, e, 0.056, 0.07, sleeveMat, 1.15, 0.85), side + 'UpperArm');
      put(tube(e, wrist, 0.07, 0.115, sleeveMat, 1.25, 0.5), side + 'LowerArm');
    } else {
      put(tube(a, e, 0.056 * baggy, 0.047 * baggy, sleeveMat), side + 'UpperArm');
      put(tube(e, wrist, 0.047 * baggy, 0.04 * baggy, sleeveMat), side + 'LowerArm');
    }
    put(ball(a, 0.06 * baggy, o.yoke ? upperMat : sleeveMat), side + 'UpperArm');
    put(ball(e, (o.sleeves === 'bell' ? 0.07 : 0.047 * baggy), sleeveMat), side + 'LowerArm');
    if (o.cuffs) put(tube(e.clone().lerp(h, 0.8), e.clone().lerp(h, 0.93), 0.043 * baggy, 0.043 * baggy, mat(o.cuffs)), side + 'LowerArm');
    if (o.hood) put(ball(h, 0.055, main), side + 'Hand'); // onesie mittens
  }

  // --- legs ---
  const lb = o.legs === 'baggy' ? 1.22 : 1;
  if (o.legs === 'pants' || o.legs === 'baggy') {
    put(tube(v(hips.x, legTop + 0.07, fwd * 0.5), v(hips.x, legTop - 0.1, 0), wx * 0.88 * baggy, (hipHalf + 0.075) * lb, legMat, 1, wz / wx), 'hips');
    for (const side of ['left', 'right']) {
      const t = P(side + 'UpperLeg'), k = P(side + 'LowerLeg'), f = P(side + 'Foot');
      const ankle = k.clone().lerp(f, o.legs === 'baggy' ? 0.97 : 0.93);
      put(tube(t, k, 0.088 * lb, 0.068 * lb, legMat), side + 'UpperLeg');
      put(tube(k, ankle, 0.068 * lb, 0.055 * lb, legMat), side + 'LowerLeg');
      put(ball(k, 0.068 * lb, legMat), side + 'LowerLeg');
      const out = side === 'left' ? 1 : -1;
      if (o.stripe) { // a stripe down the outside of each leg
        put(tube(t.clone().add(v(out * 0.084, 0, 0)), k.clone().add(v(out * 0.066, 0, 0)), 0.012, 0.012, mat(o.stripe)), side + 'UpperLeg');
        put(tube(k.clone().add(v(out * 0.066, 0, 0)), ankle.clone().add(v(out * 0.054, 0, 0)), 0.012, 0.012, mat(o.stripe)), side + 'LowerLeg');
      }
      if (o.straps) for (const at of [0.3, 0.62]) { // leather straps around the thighs
        const p = t.clone().lerp(k, at), r = 0.088 + (0.068 - 0.088) * at + 0.004;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.008, 8, 20), mat(o.straps)); ring.position.copy(p); ring.rotation.x = Math.PI / 2 + (at < 0.5 ? 0.3 : -0.3); put(ring, side + 'UpperLeg');
      }
      if (o.boots) put(tube(k.clone().lerp(f, 0.35), k.clone().lerp(f, 0.98), 0.066, 0.06, mat(o.boots)), side + 'LowerLeg');
    }
  } else { // skirt or robe: one piece hanging from the hips
    const length = o.legs === 'robe' ? 1 : o.skirtLength || 0.6;
    const bottomY = o.legs === 'robe' ? footY + 0.06 : legTop - (legTop - footY) * length * 0.62;
    const flare = (o.legs === 'robe' ? 1.25 : 1.75) * (o.flare || 1);
    put(tube(v(hips.x, waistY, fwd), v(hips.x, bottomY, 0), wx * 0.88, wx * flare, legMat, 1, o.legs === 'robe' ? 0.8 : 0.95), 'hips');
    if (o.hem) put(tube(v(hips.x, bottomY + 0.03, 0), v(hips.x, bottomY - 0.012, 0), wx * flare * 0.985, wx * flare * 1.03, mat(o.hem), 1, o.legs === 'robe' ? 0.8 : 0.95), 'hips');
    if (o.apron) {
      put(box(v(hips.x, (waistY + bottomY) / 2 + 0.02, wx * 1.2), wx * 1.3, (waistY - bottomY) * 0.86, 0.012, mat(o.apron)), 'hips');
      put(box(v(hips.x, (waistY + chest.y) / 2 + 0.04, fwd + wz * 1.0), wx * 0.9, chest.y - waistY + 0.06, 0.012, mat(o.apron)), 'spine');
    }
  }
  if (o.waistCape) put(tube(v(hips.x, legTop + 0.08, 0), v(hips.x, legTop - 0.1, 0), wx * 1.0, wx * 1.25, mat(o.waistCape), 1, 0.95), 'hips');

  // --- head pieces ---
  const crown = v(head.x, head.y + 0.1, head.z);
  if (o.headband) { const band = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.016, 8, 24, Math.PI), mat(o.headband)); band.position.copy(crown).add(v(0, 0.01, 0.01)); put(band, 'head'); }
  if (o.hood) {
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.2, 28, 20, Math.PI * 0.82, Math.PI * 1.36), mat(o.top, { side: THREE.DoubleSide })); // open at the face
    hood.position.copy(crown).add(v(0, -0.01, -0.02)); hood.scale.set(1, 1.05, 1.02); put(hood, 'head');
    const ear = (x, shape) => { const m = shape; m.position.copy(crown).add(v(x, 0.17, -0.01)); put(m, 'head'); };
    if (o.hood === 'bear') for (const s of [-1, 1]) ear(s * 0.12, ball(v(0, 0, 0), 0.055, main, 1, 1, 0.6));
    if (o.hood === 'cat') for (const s of [-1, 1]) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.12, 4), main); c.rotation.z = -s * 0.3; ear(s * 0.11, c); }
    if (o.hood === 'shark') {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 3), main); fin.position.copy(crown).add(v(0, 0.22, -0.06)); fin.scale.set(0.35, 1, 1.2); fin.rotation.x = -0.35; put(fin, 'head');
      for (let i = -3; i <= 3; i++) { const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.03, 4), mat('#ffffff')); tooth.position.copy(crown).add(v(i * 0.035, 0.105 - Math.abs(i) * 0.012, 0.165 - Math.abs(i) * 0.012)); tooth.rotation.x = Math.PI; put(tooth, 'head'); }
    }
  }
  if (o.tail) {
    const back = v(hips.x, legTop + 0.02, -wz * baggy);
    if (o.tail === 'bear') put(ball(back, 0.05, main), 'hips');
    if (o.tail === 'cat') put(tube(back, back.clone().add(v(0.05, -0.2, -0.16)), 0.022, 0.018, main), 'hips');
    if (o.tail === 'shark') { const t = new THREE.Mesh(new THREE.ConeGeometry(0.07, 0.3, 10), main); t.position.copy(back).add(v(0, -0.06, -0.1)); t.rotation.x = -2.1; put(t, 'hips'); }
  }

  // --- hide the model's own clothes (shoes stay on) ---
  const hidden = [];
  vrm.scene.traverse(obj => {
    if (!obj.isMesh || pieces.includes(obj)) return;
    const name = (Array.isArray(obj.material) ? obj.material[0] : obj.material)?.name || '';
    if (name.includes('CLOTH') && !name.includes('Shoes') && obj.visible) { obj.visible = false; hidden.push(obj); }
  });

  return {
    remove() {
      for (const m of pieces) { m.removeFromParent(); m.geometry.dispose(); m.material.dispose(); }
      for (const m of hidden) m.visible = true;
    },
  };
}

/** A little picture of an outfit for the dressing room tiles, drawn from its colours. */
export function outfitThumb(id, size = 200) {
  const o = OUTFITS[id];
  if (!o) return '';
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), s = size / 100;
  const poly = (color, pts) => { g.fillStyle = color; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * s, y * s) : g.moveTo(x * s, y * s))); g.closePath(); g.fill(); g.strokeStyle = 'rgba(40,20,60,.35)'; g.lineWidth = 1.2; g.stroke(); };
  const legs = o.legColor || o.top, sl = o.sleeveColor || o.top, bell = o.sleeves === 'bell';
  if (o.legs === 'robe') poly(legs, [[36, 50], [64, 50], [70, 92], [30, 92]]);
  else if (o.legs === 'skirt') poly(legs, [[37, 50], [63, 50], [76, 74], [24, 74]]);
  else { poly(legs, [[36, 50], [50, 50], [48, 92], [36, 92]]); poly(legs, [[50, 50], [64, 50], [64, 92], [52, 92]]); }
  if (o.stripe) { g.fillStyle = o.stripe; g.fillRect(36 * s, 52 * s, 2 * s, 40 * s); g.fillRect(62 * s, 52 * s, 2 * s, 40 * s); }
  if (o.boots) { g.fillStyle = o.boots; g.fillRect(36 * s, 78 * s, 12 * s, 14 * s); g.fillRect(52 * s, 78 * s, 12 * s, 14 * s); }
  if (o.apron) poly(o.apron, [[42, 50], [58, 50], [62, 72], [38, 72]]);
  poly(sl, bell ? [[34, 20], [14, 44], [26, 54], [38, 32]] : [[34, 20], [20, 46], [28, 50], [39, 30]]);
  poly(sl, bell ? [[66, 20], [86, 44], [74, 54], [62, 32]] : [[66, 20], [80, 46], [72, 50], [61, 30]]);
  poly(o.cropped ? o.shirt : o.top, [[34, 20], [66, 20], [64, 52], [36, 52]]);
  if (o.cropped || o.yoke) poly(o.cropped ? o.top : o.yoke, [[34, 20], [66, 20], [65, 34], [35, 34]]);
  if (o.belly) { g.fillStyle = o.belly; g.beginPath(); g.ellipse(50 * s, 38 * s, 9 * s, 12 * s, 0, 0, 7); g.fill(); }
  if (o.obi) { g.fillStyle = o.obi; g.fillRect(35 * s, 42 * s, 30 * s, 8 * s); }
  if (o.vneck) { g.strokeStyle = o.vneck; g.lineWidth = 2.5 * s; g.beginPath(); g.moveTo(42 * s, 20 * s); g.lineTo(52 * s, 40 * s); g.moveTo(58 * s, 20 * s); g.lineTo(48 * s, 40 * s); g.stroke(); }
  if (o.zip) { g.fillStyle = o.zip; g.fillRect(49.3 * s, 20 * s, 1.4 * s, 32 * s); }
  if (o.collar || o.cravat) { g.fillStyle = o.cravat || o.collar; g.beginPath(); g.ellipse(50 * s, 21 * s, 7 * s, 3.5 * s, 0, 0, 7); g.fill(); }
  if (o.hood) { g.fillStyle = o.top; g.beginPath(); g.arc(50 * s, 12 * s, 10 * s, 0, 7); g.fill(); g.beginPath(); g.arc(42 * s, 4 * s, 4 * s, 0, 7); g.arc(58 * s, 4 * s, 4 * s, 0, 7); g.fill(); }
  return c.toDataURL();
}
