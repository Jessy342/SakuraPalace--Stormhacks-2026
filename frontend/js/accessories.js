// Shop accessories built from simple 3D shapes, attached to the character's head bone.
// Coordinates are in meters relative to the head bone: +y = up, +z = towards the face.
// Tweak HEAD_TOP / offsets if things float or sink on your VRoid models.
import * as THREE from 'three';

const HEAD_TOP = 0.2;

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.4, side: THREE.DoubleSide, ...extra });

// Where the eyes are, in the same head-bone space. character.js measures this for each model
// so the glasses sit on the face instead of floating or hiding inside the head.
export const DEFAULT_FACE = { eyeX: 0.034, eyeY: 0.075, frontZ: 0.105 };

export function buildAccessory(id, face = DEFAULT_FACE) {
  const g = new THREE.Group();
  g.name = id;
  switch (id) {
    case 'cat_ears': {
      for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.11, 4), mat('#2b2233'));
        ear.position.set(side * 0.07, HEAD_TOP + 0.01, -0.01);
        ear.rotation.z = -side * 0.35;
        const inner = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.06, 4), mat('#ff9fc8'));
        inner.position.set(0, -0.008, 0.012);
        ear.add(inner);
        g.add(ear);
      }
      break;
    }
    case 'glasses': {
      const frame = mat('#3b2a4a', { metalness: 0.6 });
      const lensMat = mat('#bfe6ff', { transparent: true, opacity: 0.18, metalness: 0.2, roughness: 0.05 });
      const { eyeX, eyeY, frontZ } = face;
      const r = eyeX * 0.78;          // lens size scales with how far apart the eyes are
      const thick = r * 0.15;
      for (const side of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(r, thick, 10, 32), frame);
        ring.position.set(side * eyeX, eyeY, frontZ);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(r, 32), lensMat);
        lens.position.copy(ring.position);
        // little arm going back toward the ear
        const arm = new THREE.Mesh(new THREE.CylinderGeometry(thick * 0.8, thick * 0.8, frontZ * 0.9), frame);
        arm.rotation.x = Math.PI / 2;
        arm.position.set(side * (eyeX + r), eyeY, frontZ * 0.55);
        g.add(ring, lens, arm);
      }
      const gap = Math.max(0.001, 2 * eyeX - 2 * r);
      const bridge = new THREE.Mesh(new THREE.CylinderGeometry(thick * 0.8, thick * 0.8, gap + thick * 2), frame);
      bridge.rotation.z = Math.PI / 2;
      bridge.position.set(0, eyeY + r * 0.15, frontZ);
      g.add(bridge);
      break;
    }
    case 'headphones': {
      const shell = mat('#f4f4f8'), pad = mat('#ff7eb6');
      const band = new THREE.Mesh(new THREE.TorusGeometry(0.112, 0.012, 10, 28, Math.PI), shell);
      band.position.set(0, 0.085, -0.005);
      g.add(band);
      for (const side of [-1, 1]) {
        const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.04, 20), shell);
        cup.rotation.z = Math.PI / 2;
        cup.position.set(side * 0.112, 0.08, -0.005);
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.008, 8, 20), pad);
        ring.rotation.y = Math.PI / 2;
        ring.position.set(side * 0.134, 0.08, -0.005);
        g.add(cup, ring);
      }
      break;
    }
    case 'bunny_ears': {
      for (const side of [-1, 1]) {
        const ear = new THREE.Mesh(new THREE.CapsuleGeometry(0.024, 0.15, 6, 12), mat('#ffffff'));
        ear.position.set(side * 0.05, HEAD_TOP + 0.085, -0.01);
        ear.rotation.z = -side * 0.16;
        ear.scale.z = 0.6;
        const inner = new THREE.Mesh(new THREE.CapsuleGeometry(0.012, 0.12, 4, 10), mat('#ffb3d1'));
        inner.position.set(0, 0, 0.016);
        ear.add(inner);
        g.add(ear);
      }
      break;
    }
    case 'captain_hat': {
      const white = mat('#fbfbff'), navy = mat('#1c2a5a'), gold = mat('#ffcc33', { metalness: 0.8, roughness: 0.3 });
      const top = new THREE.Mesh(new THREE.CylinderGeometry(0.125, 0.1, 0.045, 28), white);
      top.position.set(0, HEAD_TOP + 0.045, -0.01);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.035, 28), navy);
      band.position.set(0, HEAD_TOP + 0.008, -0.01);
      const visor = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.008, 24, 1, false, -Math.PI / 2, Math.PI), mat('#11131f'));
      visor.position.set(0, HEAD_TOP - 0.008, 0.045);
      visor.rotation.x = 0.22;
      const badge = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 10), gold);
      badge.position.set(0, HEAD_TOP + 0.02, 0.092);
      badge.scale.z = 0.5;
      g.add(top, band, visor, badge);
      break;
    }
    case 'star_clip': {
      const star = new THREE.Shape();
      for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5, r = i % 2 ? 0.012 : 0.028; star[i ? 'lineTo' : 'moveTo'](Math.sin(a) * r, Math.cos(a) * r); }
      const geo = new THREE.ExtrudeGeometry(star, { depth: 0.008, bevelEnabled: false });
      for (const side of [-1, 1]) {
        const clip = new THREE.Mesh(geo, mat('#e9d9ff', { emissive: '#b79cff', emissiveIntensity: 0.5 }));
        clip.position.set(side * 0.085, 0.135, 0.085);
        clip.rotation.set(-0.25, side * 0.55, side * 0.2);
        g.add(clip);
      }
      break;
    }
    case 'butterfly_clips': {
      const black = mat('#17151f'), green = mat('#c9e86a');
      for (const side of [-1, 1]) {
        const clip = new THREE.Group();
        for (const up of [-1, 1]) { // two wings
          const wing = new THREE.Mesh(new THREE.ConeGeometry(0.038, 0.085, 4), black);
          wing.position.set(0, up * 0.03, 0);
          wing.rotation.z = up > 0 ? Math.PI + side * 0.5 : side * 0.5;
          wing.scale.z = 0.25;
          const mark = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.05, 4), green);
          mark.position.set(0, -0.012, 0.012);
          mark.scale.z = 0.25;
          wing.add(mark);
          clip.add(wing);
        }
        for (const k of [-1, 1]) { // ribbon tails
          const tail = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.16, 0.004), black);
          tail.position.set(k * 0.012, -0.12, 0);
          tail.rotation.z = k * 0.08;
          clip.add(tail);
        }
        clip.position.set(side * 0.118, 0.155, 0.0);
        clip.rotation.y = side * 1.2;
        g.add(clip);
      }
      break;
    }
    case 'mahoraga': { // an eight-handled wheel floating above the head
      const gold = mat('#e8b84a', { metalness: 0.9, roughness: 0.25, emissive: '#5a3a00', emissiveIntensity: 0.4 });
      const wheel = new THREE.Group();
      wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.009, 10, 48), gold));
      wheel.add(new THREE.Mesh(new THREE.SphereGeometry(0.022, 14, 12), gold));
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        const spoke = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.13), gold);
        spoke.position.set(Math.cos(a) * 0.065, Math.sin(a) * 0.065, 0);
        spoke.rotation.z = a + Math.PI / 2;
        const knob = new THREE.Mesh(new THREE.SphereGeometry(0.02, 14, 12), gold);
        knob.position.set(Math.cos(a) * 0.15, Math.sin(a) * 0.15, 0);
        wheel.add(spoke, knob);
      }
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(0, HEAD_TOP + 0.13, -0.01);
      wheel.userData.spin = true;
      g.add(wheel);
      break;
    }
    case 'round_glasses': case 'sunglasses': case 'heart_glasses': case 'monocle': {
      const { eyeX, eyeY, frontZ } = face;
      const gold = mat('#e8c26a', { metalness: 0.8, roughness: 0.3 }), dark = mat('#15151c', { metalness: 0.5 }), pink = mat('#ff5fa2');
      const frame = id === 'sunglasses' ? dark : id === 'heart_glasses' ? pink : gold;
      const r = eyeX * (id === 'heart_glasses' ? 0.9 : 0.98);
      const heart = new THREE.Shape(); // a heart, pointing down
      heart.moveTo(0, -r); heart.bezierCurveTo(r * 1.5, -r * 0.1, r * 1.1, r * 1.05, 0, r * 0.45); heart.bezierCurveTo(-r * 1.1, r * 1.05, -r * 1.5, -r * 0.1, 0, -r);
      for (const side of id === 'monocle' ? [1] : [-1, 1]) {
        const at = new THREE.Vector3(side * eyeX * 1.02, eyeY, frontZ + 0.004);
        if (id === 'heart_glasses') {
          const lens = new THREE.Mesh(new THREE.ShapeGeometry(heart), mat('#ff8fc4', { transparent: true, opacity: 0.55 }));
          lens.position.copy(at);
          const rim = new THREE.Mesh(new THREE.ExtrudeGeometry(heart, { depth: 0.003, bevelEnabled: false }), pink);
          rim.position.copy(at).add(new THREE.Vector3(0, 0, -0.004)); rim.scale.setScalar(1.12);
          g.add(rim, lens);
        } else {
          const ring = new THREE.Mesh(new THREE.TorusGeometry(r, r * 0.09, 10, 36), frame);
          ring.position.copy(at);
          const lens = new THREE.Mesh(new THREE.CircleGeometry(r, 32), id === 'sunglasses'
            ? mat('#0c0c12', { transparent: true, opacity: 0.92, metalness: 0.6, roughness: 0.15 }) : mat('#d9f0ff', { transparent: true, opacity: 0.16, roughness: 0.05 }));
          lens.position.copy(at);
          g.add(ring, lens);
        }
        if (id !== 'monocle') { // arm going back toward the ear
          const arm = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.07, r * 0.07, frontZ * 0.9), frame);
          arm.rotation.x = Math.PI / 2; arm.position.set(side * (eyeX + r), eyeY, frontZ * 0.55);
          g.add(arm);
        }
      }
      if (id === 'monocle') { // a fine chain hanging from it
        const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.0015, 0.0015, 0.12), gold);
        chain.position.set(eyeX * 1.02 + r * 0.9, eyeY - 0.07, frontZ); chain.rotation.z = -0.15;
        g.add(chain);
      } else {
        const bridge = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.07, r * 0.07, eyeX * 0.5), frame);
        bridge.rotation.z = Math.PI / 2; bridge.position.set(0, eyeY + r * 0.1, frontZ + 0.004);
        g.add(bridge);
      }
      break;
    }
    case 'pointed_shades': { // sharp triangular shades
      const { eyeX, eyeY, frontZ } = face;
      const s = eyeX;
      const shape = new THREE.Shape();
      shape.moveTo(0, -s * 0.35); shape.lineTo(s * 3.3, s * 1.05); shape.lineTo(s * 0.9, s * 0.75); shape.lineTo(0, s * 0.5);
      shape.lineTo(-s * 0.9, s * 0.75); shape.lineTo(-s * 3.3, s * 1.05); shape.lineTo(0, -s * 0.35);
      const shades = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: false }),
        mat('#ff5a1f', { emissive: '#ff3b00', emissiveIntensity: 0.5, metalness: 0.4, roughness: 0.25 }));
      shades.position.set(0, eyeY - s * 0.3, frontZ + 0.004);
      g.add(shades);
      break;
    }
    case 'blindfold': { // a black band over the eyes
      const { eyeY, frontZ } = face;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(frontZ + 0.006, frontZ + 0.006, 0.05, 32, 1, true), mat('#101016', { roughness: 0.9 }));
      band.position.set(0, eyeY + 0.004, 0); band.scale.set(0.98, 1, 1);
      g.add(band);
      break;
    }
    case 'eyepatch': {
      const { eyeX, eyeY, frontZ } = face;
      const black = mat('#101016', { roughness: 0.8 });
      const patch = new THREE.Mesh(new THREE.CircleGeometry(eyeX * 0.95, 24), black);
      patch.position.set(-eyeX * 1.02, eyeY, frontZ + 0.006); patch.scale.set(1.1, 1, 1);
      const strap = new THREE.Mesh(new THREE.TorusGeometry(frontZ + 0.004, 0.003, 6, 40), black);
      strap.rotation.x = Math.PI / 2; strap.rotation.y = 0.28; strap.position.set(0, eyeY + 0.012, 0);
      g.add(patch, strap);
      break;
    }
    case 'halo': {
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.009, 12, 48),
        mat('#ffd75e', { emissive: '#ffcc33', emissiveIntensity: 1.4 }));
      halo.rotation.x = Math.PI / 2;
      halo.position.set(0, HEAD_TOP + 0.08, -0.01);
      halo.userData.spin = true;
      g.add(halo);
      break;
    }
    case 'crown': {
      const gold = mat('#ffcc33', { metalness: 0.9, roughness: 0.25 });
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.06, 0.035, 16, 1, true), gold);
      band.position.set(0, HEAD_TOP + 0.005, -0.005);
      g.add(band);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const spike = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.04, 6), gold);
        spike.position.set(Math.sin(a) * 0.062, HEAD_TOP + 0.04, Math.cos(a) * 0.062 - 0.005);
        g.add(spike);
        const gem = new THREE.Mesh(new THREE.SphereGeometry(0.008), mat(i % 2 ? '#ff3b5c' : '#4ea8ff', { emissive: '#330011' }));
        gem.position.set(Math.sin(a) * 0.066, HEAD_TOP + 0.005, Math.cos(a) * 0.066 - 0.005);
        g.add(gem);
      }
      break;
    }
    case 'witch_hat': {
      const purple = mat('#3a1f5d');
      const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.01, 32), purple);
      brim.position.set(0, HEAD_TOP - 0.01, -0.01);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 24), purple);
      cone.position.set(0, HEAD_TOP + 0.1, -0.02);
      cone.rotation.x = -0.15;
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.09, 0.025, 24, 1, true), mat('#ff9f1c'));
      band.position.set(0, HEAD_TOP + 0.005, -0.01);
      g.add(brim, cone, band);
      break;
    }
    case 'bow': {
      const red = mat('#ff4d8d');
      for (const side of [-1, 1]) {
        const loop = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.09, 4), red);
        loop.rotation.z = side * Math.PI / 2;
        loop.position.set(side * 0.05, HEAD_TOP - 0.01, -0.06);
        g.add(loop);
      }
      const knot = new THREE.Mesh(new THREE.SphereGeometry(0.02), red);
      knot.position.set(0, HEAD_TOP - 0.01, -0.06);
      g.add(knot);
      break;
    }
    default:
      return null;
  }
  return g;
}

/** Small pictures of the accessories for the dressing room tiles. Returns { id: image data URL }. */
export function accessoryThumbs(ids, size = 160) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(size, size);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(1, 2, 3);
  scene.add(key);
  const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 10);
  const out = {};
  for (const id of ids) {
    const acc = buildAccessory(id);
    if (!acc) continue;
    scene.add(acc);
    const bounds = new THREE.Box3().setFromObject(acc);
    const center = bounds.getCenter(new THREE.Vector3());
    const reach = bounds.getSize(new THREE.Vector3()).length();
    camera.position.set(center.x + reach * 0.45, center.y + reach * 0.3, center.z + reach * 1.9);
    camera.lookAt(center);
    renderer.render(scene, camera);
    out[id] = renderer.domElement.toDataURL();
    scene.remove(acc);
  }
  renderer.dispose();
  renderer.forceContextLoss();
  return out;
}
