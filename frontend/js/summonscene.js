// The build-up of a summon, as a real 3D scene in the app's own theme:
// a lotus bud (the lotus is our points symbol) floats on still water under a starry dusk sky while sakura petals
// are drawn toward it. The bud glows through the rarity colours, shooting stars fall from the sky into it
// (one per pull, each in its rarity colour), and it bursts into bloom with a pillar of light as the camera rushes in.
import * as THREE from 'three';

const RARITY = { Common: '#9aa5b1', Rare: '#4ea8ff', Epic: '#b06bff', Legendary: '#ffb627', Mythic: '#ff3b5c', Unbound: 'rainbow' };
const TAU = Math.PI * 2;
const Y_AXIS = new THREE.Vector3(0, 1, 0);

function canvasTexture(w, h, paint) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const glowTexture = () => canvasTexture(128, 128, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
});
const trailTexture = () => canvasTexture(64, 256, (g, w, h) => { // bright at the top (the head), fading down the tail and toward the sides
  const down = g.createLinearGradient(0, 0, 0, h);
  down.addColorStop(0, 'rgba(255,255,255,1)'); down.addColorStop(0.15, 'rgba(255,255,255,.6)'); down.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = down; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'destination-in';
  const across = g.createLinearGradient(0, 0, w, 0);
  across.addColorStop(0, 'rgba(0,0,0,0)'); across.addColorStop(0.5, 'rgba(0,0,0,1)'); across.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = across; g.fillRect(0, 0, w, h);
});
const skyTexture = () => canvasTexture(8, 256, (g, w, h) => { // deep indigo overhead, glowing pink at the horizon
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#060824'); gr.addColorStop(0.3, '#1c1654'); gr.addColorStop(0.43, '#5a2f86'); gr.addColorStop(0.5, '#ff9ac4'); gr.addColorStop(1, '#ff9ac4');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
const pillarTexture = () => canvasTexture(8, 128, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.75, 'rgba(255,255,255,.7)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});

/** One lotus petal: a pointed oval standing up from its base, cupped toward the centre of the flower. */
function petalGeometry(len, wid) {
  const sh = new THREE.Shape();
  sh.moveTo(0, 0);
  sh.bezierCurveTo(wid, len * 0.2, wid * 0.95, len * 0.75, 0, len);
  sh.bezierCurveTo(-wid * 0.95, len * 0.75, -wid, len * 0.2, 0, 0);
  const geo = new THREE.ShapeGeometry(sh, 12);
  const p = geo.attributes.position, colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    p.setZ(i, -Math.pow(x / wid, 2) * wid * 0.32 - Math.pow(y / len, 2) * len * 0.14);
    const k = 0.5 + 0.5 * (y / len); // darker at the base, bright at the tip
    colors.set([k, k, k], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** Starts the scene inside `overlay`. Returns the controls the cutscene uses. */
export function startScene(overlay) {
  const canvas = document.createElement('canvas');
  canvas.className = 'cut-3d';
  overlay.prepend(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x6a3a86, 0.028);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 300);
  const resize = () => {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1600 / innerWidth));
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);

  const glow = glowTexture(), trail = trailTexture();
  const additive = (extra = {}) => ({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, ...extra });
  const color = new THREE.Color(RARITY.Common), tint = new THREE.Color();
  let rarity = 'Common';

  // --- sky, stars, water ---
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(150, 24, 16), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false })));
  const starPos = new Float32Array(1400 * 3);
  for (let i = 0; i < 1400; i++) {
    const a = Math.random() * TAU, up = Math.acos(Math.random() * 0.92 + 0.05); // only above the horizon
    starPos.set([Math.sin(up) * Math.cos(a) * 120, Math.cos(up) * 120, Math.sin(up) * Math.sin(a) * 120], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 1.1, map: glow, color: 0xffffff, ...additive() }));
  scene.add(stars);
  const water = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshBasicMaterial({ color: 0x120c30 }));
  water.rotation.x = -Math.PI / 2;
  scene.add(water);
  const waterGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glow, ...additive({ opacity: 0.6 }) })); // the flower's light on the water
  waterGlow.rotation.x = -Math.PI / 2; waterGlow.position.y = 0.02; waterGlow.scale.setScalar(9);
  scene.add(waterGlow);

  // --- the lotus ---
  const lotus = new THREE.Group();
  lotus.position.y = 0.2; lotus.scale.setScalar(1.25);
  scene.add(lotus);
  const petalMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide, transparent: true, opacity: 0.96 });
  const RINGS = [ // from the heart outward: how many petals, their size, how far they lean when closed and when open
    { n: 6, len: 1.0, wid: 0.34, r: 0.08, closed: 0.07, open: 0.5, turn: 0 },
    { n: 8, len: 1.25, wid: 0.42, r: 0.14, closed: 0.15, open: 0.95, turn: TAU / 16 },
    { n: 8, len: 1.42, wid: 0.5, r: 0.2, closed: 0.25, open: 1.34, turn: 0 },
  ];
  const petals = [];
  for (const ring of RINGS) {
    const geo = petalGeometry(ring.len, ring.wid);
    for (let i = 0; i < ring.n; i++) {
      const spoke = new THREE.Group(), hinge = new THREE.Group();
      spoke.rotation.y = ring.turn + i * TAU / ring.n;
      hinge.position.z = ring.r;
      hinge.add(new THREE.Mesh(geo, petalMat));
      spoke.add(hinge);
      lotus.add(spoke);
      petals.push({ hinge, ring, phase: Math.random() * TAU });
    }
  }
  const pad = new THREE.Mesh(new THREE.CircleGeometry(2.3, 40), new THREE.MeshBasicMaterial({ color: 0x1d5a4c, transparent: true, opacity: 0.75 }));
  pad.rotation.x = -Math.PI / 2; pad.position.y = 0.03;
  scene.add(pad);
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xfff1c9, ...additive() }));
  core.position.y = 0.75;
  scene.add(core);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, ...additive({ opacity: 0.5 }) })); // big soft light in the rarity colour
  halo.position.y = 1.2;
  scene.add(halo);

  // --- pillar of light (on at the bloom) ---
  const pillarMat = new THREE.MeshBasicMaterial({ map: pillarTexture(), side: THREE.DoubleSide, ...additive({ opacity: 0 }) });
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 0.7, 70, 28, 1, true), pillarMat);
  pillar.position.y = 35;
  const pillarCore = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.2, 70, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, ...additive({ opacity: 0 }) }));
  pillarCore.position.y = 35;
  scene.add(pillar, pillarCore);

  // --- sakura petals drawn in toward the flower ---
  const N_PETALS = 260;
  const drift = Array.from({ length: N_PETALS }, () => ({ a: Math.random() * TAU, d: 1 + Math.random() * 14, y: 0.3 + Math.random() * 6, s: 0.4 + Math.random() }));
  const driftGeo = new THREE.BufferGeometry();
  driftGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N_PETALS * 3), 3));
  scene.add(new THREE.Points(driftGeo, new THREE.PointsMaterial({ size: 0.2, map: glow, color: 0xffb3d1, ...additive({ fog: true }) })));

  // --- sparks (bursts) ---
  const N_SPARKS = 900;
  const sparkPos = new Float32Array(N_SPARKS * 3).fill(-999), sparkCol = new Float32Array(N_SPARKS * 3);
  const sparks = Array.from({ length: N_SPARKS }, () => ({ life: 0, v: new THREE.Vector3(), g: 0 }));
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
  const sparkPoints = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.22, map: glow, vertexColors: true, ...additive() }));
  sparkPoints.frustumCulled = false;
  scene.add(sparkPoints);
  let nextSpark = 0;
  const burst = (at, n, speed, c, up = 0.4, gravity = 3) => {
    for (let i = 0; i < n; i++) {
      const k = nextSpark = (nextSpark + 1) % N_SPARKS, s = sparks[k];
      const a = Math.random() * TAU, el = (Math.random() - 0.5 + up) * Math.PI * 0.9, sp = (0.3 + Math.random()) * speed;
      s.v.set(Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp, Math.sin(a) * Math.cos(el) * sp);
      s.life = 0.7 + Math.random() * 0.9; s.g = gravity;
      sparkPos.set([at.x, at.y, at.z], k * 3);
      const white = Math.random() < 0.3;
      sparkCol.set(white ? [1, 1, 1] : [c.r, c.g, c.b], k * 3);
    }
  };

  // --- ripples on the water ---
  const ringGeo = new THREE.RingGeometry(0.94, 1, 64);
  const ripples = [];
  const ripple = (c, speed = 6, start = 0.4) => {
    const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, ...additive() }));
    m.rotation.x = -Math.PI / 2; m.position.y = 0.05; m.scale.setScalar(start);
    scene.add(m);
    ripples.push({ m, speed, life: 1 });
  };

  // --- shooting stars ---
  const trailGeo = new THREE.PlaneGeometry(0.9, 9);
  trailGeo.translate(0, -4.5, 0); // the head is at the top end
  let meteors = [];

  // --- camera and state ---
  const cam = { ang: 0.6, r: 12, h: 3.4, look: 1.2, tr: 7.4, th: 2.1, tlook: 1.2, spin: 0.22 };
  const target = new THREE.Vector3(0, 0.9, 0);
  let charge = 0, pulse = 0, bloom = 0, bloomTo = 0, pillarOn = 0, shake = 0, bloomedAt = 0, lookDownAt = 0;
  let running = true, last = performance.now(), lastFrame = 0;
  const clock0 = performance.now();

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (now - lastFrame < 15) return; // 60 frames a second is plenty
    lastFrame = now;
    const dt = Math.min((now - last) / 1000, 0.05), t = (now - clock0) / 1000;
    last = now;
    if (overlay.querySelector('.reveal')) return; // a character reveal covers this scene: rest until it is visible again

    // colour of the moment
    if (RARITY[rarity] === 'rainbow') color.setHSL((t * 0.18) % 1, 0.95, 0.66);
    else color.lerp(tint.set(RARITY[rarity]), Math.min(1, dt * 6));
    petalMat.color.set(0xffc2dc).lerp(color, 0.62);
    halo.material.color.copy(color); waterGlow.material.color.copy(color); pillarMat.color.copy(color);

    charge = Math.min(1, charge + dt * 0.3);
    pulse *= Math.pow(0.02, dt);
    bloom += (bloomTo - bloom) * Math.min(1, dt * 4.5);
    if (lookDownAt && now > lookDownAt) { lookDownAt = 0; cam.tlook = 1.3; cam.tr = 8.4; cam.th = 2; }
    if (bloomedAt && now - bloomedAt > 1300) { bloomedAt = 0; cam.tr = 8.6; cam.th = 2.8; cam.tlook = 1.5; cam.spin = 0.16; }

    // lotus: the bud breathes, swells when struck, and opens at the bloom
    for (const p of petals) {
      const open = THREE.MathUtils.lerp(p.ring.closed, p.ring.open, bloom);
      p.hinge.rotation.x = open + Math.sin(t * 1.6 + p.phase) * 0.02 + (charge * 0.05 + pulse * 0.16) * (1 - bloom);
    }
    lotus.rotation.y = t * 0.12;
    const swell = 1 + pulse * 0.6;
    core.scale.setScalar((1.2 + charge * 1.3 + bloom * 3.5) * swell);
    halo.scale.setScalar((5 + charge * 4 + bloom * 9) * swell);
    halo.material.opacity = 0.3 + charge * 0.2 + pulse * 0.3;
    waterGlow.scale.setScalar((7 + charge * 4 + bloom * 12) * swell);
    stars.rotation.y = t * 0.01;

    // pillar of light
    pillarOn += ((bloomTo ? 1 : 0) - pillarOn) * Math.min(1, dt * 5);
    pillarMat.opacity = pillarOn * (0.5 + 0.12 * Math.sin(t * 9));
    pillarCore.material.opacity = pillarOn * 0.8;
    pillar.scale.x = pillar.scale.z = 1 + 0.08 * Math.sin(t * 7);
    pillar.rotation.y = t * 0.8;

    // sakura petals: spiral inward while the bud charges, drift up and outward once it has bloomed
    const dp = driftGeo.attributes.position;
    for (let i = 0; i < N_PETALS; i++) {
      const p = drift[i];
      if (bloom < 0.5) {
        p.a += dt * p.s * (0.3 + charge * 1.6) / Math.max(0.6, p.d * 0.3);
        p.d -= dt * p.s * (0.3 + charge * 2.2);
        p.y += (0.9 - p.y) * dt * 0.25 * charge;
        if (p.d < 0.3) { p.d = 8 + Math.random() * 8; p.y = 0.3 + Math.random() * 6; }
      } else {
        p.a += dt * p.s * 0.25; p.d += dt * p.s * 1.4; p.y += dt * p.s * 1.1;
        if (p.d > 16 || p.y > 9) { p.d = 0.5 + Math.random() * 2; p.y = 0.4 + Math.random(); }
      }
      dp.setXYZ(i, Math.cos(p.a) * p.d, p.y + Math.sin(t * p.s + i) * 0.15, Math.sin(p.a) * p.d);
    }
    dp.needsUpdate = true;

    // shooting stars
    for (const m of meteors) {
      if (m.done || now < m.start) continue;
      const p = Math.min(1, (now - m.start) / m.time), e = p * p;
      const prev = m.head.position.clone();
      m.head.position.lerpVectors(m.from, target, e);
      m.head.position.x += Math.sin(p * Math.PI) * m.bend;
      m.head.visible = m.tail.visible = true;
      const dir = m.head.position.clone().sub(prev);
      if (dir.lengthSq() > 1e-8) m.tail.quaternion.setFromUnitVectors(Y_AXIS, dir.normalize());
      m.tail.position.copy(m.head.position);
      if (RARITY[m.rarity] === 'rainbow') { m.head.material.color.copy(color); m.tailMat.color.copy(color); }
      if (Math.random() < 0.7) burst(m.head.position, 1, 0.6, m.head.material.color, 0, 0.5);
      if (p >= 1) {
        m.done = true; m.head.visible = m.tail.visible = false;
        pulse = 1; shake = Math.max(shake, 0.25);
        ripple(m.head.material.color.getHex(), 7);
        burst(target, 40, 4.5, m.head.material.color, 0.5);
        m.onHit();
      }
    }

    // sparks and ripples
    for (let k = 0; k < N_SPARKS; k++) {
      const s = sparks[k];
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) { sparkPos[k * 3 + 1] = -999; continue; }
      s.v.y -= s.g * dt; s.v.multiplyScalar(1 - dt * 0.8);
      sparkPos[k * 3] += s.v.x * dt; sparkPos[k * 3 + 1] += s.v.y * dt; sparkPos[k * 3 + 2] += s.v.z * dt;
      if (s.life < 0.4) { sparkCol[k * 3] *= 0.92; sparkCol[k * 3 + 1] *= 0.92; sparkCol[k * 3 + 2] *= 0.92; } // fade out
    }
    sparkGeo.attributes.position.needsUpdate = true; sparkGeo.attributes.color.needsUpdate = true;
    for (let i = ripples.length - 1; i >= 0; i--) {
      const r = ripples[i];
      r.m.scale.setScalar(r.m.scale.x + r.speed * dt); r.life -= dt * 0.7; r.m.material.opacity = Math.max(0, r.life);
      if (r.life <= 0) { scene.remove(r.m); r.m.material.dispose(); ripples.splice(i, 1); }
    }

    // camera: a slow orbit that glides between the shots, with a shake on impacts
    const k = Math.min(1, dt * 2.6);
    cam.r += (cam.tr - cam.r) * k; cam.h += (cam.th - cam.h) * k; cam.look += (cam.tlook - cam.look) * k;
    cam.ang += dt * cam.spin;
    shake *= Math.pow(0.01, dt);
    const sx = (Math.random() - 0.5) * shake * 0.5, sy = (Math.random() - 0.5) * shake * 0.5;
    camera.position.set(Math.cos(cam.ang) * cam.r + sx, cam.h + sy, Math.sin(cam.ang) * cam.r);
    camera.lookAt(0, cam.look, 0);
    renderer.render(scene, camera);
  }
  requestAnimationFrame(frame);

  return {
    /** The bud changes colour with a swell and a ripple. */
    setRarity(r) {
      rarity = r; pulse = 1;
      ripple(RARITY[r] === 'rainbow' ? 0xffffff : RARITY[r], 5);
    },
    /** Launches one shooting star per pull; the camera looks up to watch them come in. Returns the duration in ms. */
    starfall(rarities, onHit) {
      const now = performance.now(), gap = rarities.length > 1 ? 150 : 0, time = 1150;
      meteors = rarities.map((r, i) => {
        const c = RARITY[r] === 'rainbow' ? 0xffffff : RARITY[r];
        const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: c, ...additive() }));
        head.scale.setScalar(1.6);
        const tailMat = new THREE.MeshBasicMaterial({ map: trail, color: c, side: THREE.DoubleSide, ...additive() });
        const tail = new THREE.Group(), blade = new THREE.Mesh(trailGeo, tailMat), cross = new THREE.Mesh(trailGeo, tailMat);
        cross.rotation.y = Math.PI / 2; // two crossed sheets, so the tail shows from any side
        tail.add(blade, cross);
        head.visible = tail.visible = false;
        scene.add(head, tail);
        const a = cam.ang + Math.PI + (Math.random() - 0.5) * 1.6; // they come from the sky ahead of the camera
        return { rarity: r, head, tail, tailMat, start: now + i * gap, time, done: false, bend: (Math.random() - 0.5) * 6,
          from: new THREE.Vector3(Math.cos(a) * 34, 26 + Math.random() * 8, Math.sin(a) * 34), onHit: () => onHit(i) };
      });
      const total = time + gap * (rarities.length - 1) + 150;
      cam.tr = 10.5; cam.th = 1.2; cam.tlook = 6; cam.spin = 0.1;
      lookDownAt = now + total - 650;
      return total;
    },
    /** strength 1: the lotus bursts into bloom with a pillar of light and the camera rushes in. Less: a puff of sparks. */
    erupt(strength = 1) {
      if (strength >= 1) {
        bloomTo = 1; shake = 1; bloomedAt = performance.now();
        cam.tr = 4.4; cam.th = 2.2; cam.tlook = 1.5; cam.spin = 0.5;
        for (let i = 0; i < 3; i++) ripple(i === 1 ? 0xffffff : color.getHex(), 9 + i * 4, 0.3);
      }
      burst(target, Math.round(360 * strength), 9, color, 0.6, 4);
    },
    stop() {
      running = false;
      removeEventListener('resize', resize);
      scene.traverse(o => { o.geometry?.dispose(); for (const m of [].concat(o.material || [])) { m.map?.dispose(); m.dispose(); } });
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
