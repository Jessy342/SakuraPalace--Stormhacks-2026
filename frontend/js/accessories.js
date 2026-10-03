// Shop accessories built from simple 3D shapes, attached to the character's head bone.
// Coordinates are in meters relative to the head bone: +y = up, +z = towards the face.
// Tweak HEAD_TOP / offsets if things float or sink on your VRoid models.
import * as THREE from 'three';

const HEAD_TOP = 0.2;

const mat = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.4, side: THREE.DoubleSide, ...extra });

export function buildAccessory(id) {
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
      for (const side of [-1, 1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.004, 8, 24), frame);
        ring.position.set(side * 0.034, 0.075, 0.105);
        g.add(ring);
      }
      const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.02), frame);
      bridge.rotation.z = Math.PI / 2;
      bridge.position.set(0, 0.078, 0.105);
      g.add(bridge);
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
