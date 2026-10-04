// The build-up of a summon, as a real 3D scene in the app's own theme:
// a lotus bud (the lotus is our points symbol) floats on a moonlit lake ringed by mountains while sakura petals
// are drawn toward it and a summoning circle turns on the water. The bud glows through the rarity colours, shooting
// stars fall from the sky into it (one per pull, each in its rarity colour), and it bursts into bloom with a pillar
// of light as the camera rushes in.
// The sky, the cherry trees, the lily pads and the rocks are painted pictures (frontend/assets/summon/, made by
// tools/make_summon_art.py). Everything else is textured with small canvases painted here. If a picture is missing,
// the simple drawn version of that thing is used instead.
import * as THREE from 'three';

const RARITY = { Common: '#9aa5b1', Rare: '#4ea8ff', Epic: '#b06bff', Legendary: '#ffb627', Mythic: '#ff3b5c', Unbound: 'rainbow' };
const TAU = Math.PI * 2;
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const rnd = (a, b) => a + Math.random() * (b - a);

function canvasTexture(w, h, paint, repeat = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  paint(c.getContext('2d'), w, h);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ---------------- painted textures ----------------
const glowTexture = () => canvasTexture(128, 128, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
});
const flareTexture = () => canvasTexture(256, 256, (g, w) => { // a star glint: a soft core with four long spikes and four short ones
  const c = w / 2;
  const gr = g.createRadialGradient(c, c, 0, c, c, c * 0.5);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
  g.translate(c, c);
  for (let i = 0; i < 8; i++) {
    const len = i % 2 ? c * 0.5 : c * 0.98, sp = g.createLinearGradient(0, 0, len, 0);
    sp.addColorStop(0, 'rgba(255,255,255,.95)'); sp.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = sp; g.beginPath(); g.moveTo(0, -3); g.lineTo(len, 0); g.lineTo(0, 3); g.fill();
    g.rotate(TAU / 8);
  }
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
const skyTexture = () => canvasTexture(1024, 512, (g, w, h) => { // dusk sky with a milky band of nebula
  const gr = g.createLinearGradient(0, 0, 0, h);
  gr.addColorStop(0, '#050720'); gr.addColorStop(0.28, '#171250'); gr.addColorStop(0.42, '#4f2a80'); gr.addColorStop(0.485, '#d977b0'); gr.addColorStop(0.5, '#ffb0cf'); gr.addColorStop(1, '#ffb0cf');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 260; i++) { // nebula: many faint blobs along a slanted band
    const x = Math.random() * w, y = h * 0.08 + (x / w) * h * 0.2 + rnd(-1, 1) * h * 0.09, r = rnd(20, 90);
    const b = g.createRadialGradient(x, y, 0, x, y, r), hue = rnd(230, 320);
    b.addColorStop(0, `hsla(${hue},80%,70%,.07)`); b.addColorStop(1, 'hsla(0,0%,0%,0)');
    g.fillStyle = b; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // soften it: layering many faint blobs leaves speckle, which shows up as a mesh pattern when stretched over the sky
  const copy = document.createElement('canvas'); copy.width = w; copy.height = h;
  copy.getContext('2d').drawImage(g.canvas, 0, 0);
  g.globalCompositeOperation = 'source-over'; g.filter = 'blur(4px)'; g.drawImage(copy, 0, 0); g.filter = 'none';
});
const mountainTexture = () => canvasTexture(2048, 256, (g, w, h) => { // three ranges of hills fading into the haze
  for (const [base, amp, col, seed] of [[0.5, 60, 'rgba(120,70,150,.55)', 1.3], [0.62, 46, 'rgba(70,40,110,.8)', 4.1], [0.76, 34, 'rgba(34,20,70,.95)', 7.7]]) {
    g.fillStyle = col; g.beginPath(); g.moveTo(0, h);
    for (let x = 0; x <= w; x += 4) {
      const a = x / w * TAU; // whole waves only, so the two ends join up
      g.lineTo(x, h * base - (Math.sin(a * 3 + seed) * 0.5 + Math.sin(a * 7 + seed * 2) * 0.3 + Math.sin(a * 17 + seed * 3) * 0.14 + Math.sin(a * 41 + seed) * 0.06) * amp);
    }
    g.lineTo(w, h); g.fill();
  }
}, true);
const cloudTexture = () => canvasTexture(256, 128, (g, w, h) => {
  for (let i = 0; i < 40; i++) {
    const x = rnd(0.2, 0.8) * w, y = rnd(0.4, 0.65) * h, r = rnd(14, 44), b = g.createRadialGradient(x, y, 0, x, y, r);
    b.addColorStop(0, 'rgba(255,255,255,.22)'); b.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = b; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
});
const moonTexture = () => canvasTexture(256, 256, (g, w) => {
  const c = w / 2;
  g.fillStyle = '#f6e9ee'; g.beginPath(); g.arc(c, c, c * 0.92, 0, TAU); g.fill();
  for (let i = 0; i < 16; i++) { // faint seas and craters
    const a = Math.random() * TAU, d = Math.random() * c * 0.7, r = rnd(6, 26);
    g.fillStyle = `rgba(170,140,190,${rnd(0.22, 0.45)})`; g.beginPath(); g.arc(c + Math.cos(a) * d, c + Math.sin(a) * d, r, 0, TAU); g.fill();
  }
  const rim = g.createRadialGradient(c, c, c * 0.6, c, c, c * 0.92);
  rim.addColorStop(0, 'rgba(255,255,255,0)'); rim.addColorStop(1, 'rgba(255,190,220,.35)');
  g.fillStyle = rim; g.beginPath(); g.arc(c, c, c * 0.92, 0, TAU); g.fill();
});
const petalTexture = () => canvasTexture(128, 256, (g, w, h) => { // a lotus petal: creamy at the base, blushing to pink at the tip, with fine veins
  const gr = g.createLinearGradient(0, h, 0, 0);
  gr.addColorStop(0, '#fff6d8'); gr.addColorStop(0.25, '#fff0f4'); gr.addColorStop(0.7, '#ffb9d6'); gr.addColorStop(1, '#ff6fae');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let i = -9; i <= 9; i++) { // veins fanning out from the base
    g.strokeStyle = `rgba(214,84,146,${0.1 + 0.1 * (Math.abs(i) % 2)})`; g.lineWidth = i % 3 ? 0.7 : 1.3;
    g.beginPath(); g.moveTo(w / 2 + i * 1.5, h); g.bezierCurveTo(w / 2 + i * 5, h * 0.6, w / 2 + i * 7, h * 0.3, w / 2 + i * 3.4, 0); g.stroke();
  }
  const sheen = g.createLinearGradient(0, 0, w, 0); // a soft highlight down the middle, shade at the edges
  sheen.addColorStop(0, 'rgba(190,60,130,.28)'); sheen.addColorStop(0.5, 'rgba(255,255,255,.3)'); sheen.addColorStop(1, 'rgba(190,60,130,.28)');
  g.fillStyle = sheen; g.fillRect(0, 0, w, h);
});
const padTexture = () => canvasTexture(256, 256, (g, w) => { // a lily pad: deep green with pale veins and a darker rim
  const c = w / 2, gr = g.createRadialGradient(c, c, 0, c, c, c);
  gr.addColorStop(0, '#5fb08a'); gr.addColorStop(0.7, '#2f7a62'); gr.addColorStop(1, '#16463c');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
  g.strokeStyle = 'rgba(190,240,210,.35)'; g.lineWidth = 1.5;
  for (let i = 0; i < 22; i++) { const a = i * TAU / 22; g.beginPath(); g.moveTo(c, c); g.quadraticCurveTo(c + Math.cos(a + 0.12) * c * 0.5, c + Math.sin(a + 0.12) * c * 0.5, c + Math.cos(a) * c, c + Math.sin(a) * c); g.stroke(); }
});
const waterTexture = () => canvasTexture(512, 512, (g, w) => { // the lake: dark and clear near the flower, picking up the pink of the horizon far away
  const c = w / 2, gr = g.createRadialGradient(c, c, 0, c, c, c);
  gr.addColorStop(0, '#0d0a2c'); gr.addColorStop(0.12, '#161046'); gr.addColorStop(0.4, '#4a2a7c'); gr.addColorStop(0.75, '#c56aa6'); gr.addColorStop(1, '#ffb0cf');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
});
const shimmerTexture = () => canvasTexture(512, 512, (g, w) => { // little glints of light on the wavelets
  for (let i = 0; i < 420; i++) {
    g.fillStyle = `rgba(255,255,255,${rnd(0.1, 0.6)})`;
    g.beginPath(); g.ellipse(Math.random() * w, Math.random() * w, rnd(3, 16), rnd(0.5, 1.4), 0, 0, TAU); g.fill();
  }
}, true);
const circleTexture = () => canvasTexture(1024, 1024, (g, w) => { // the summoning circle: rings, runes, a lotus rosette and a star
  const c = w / 2;
  g.translate(c, c); g.strokeStyle = g.fillStyle = '#fff'; g.lineCap = 'round';
  const ring = (r, lw) => { g.lineWidth = lw; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); };
  ring(500, 6); ring(482, 2); ring(410, 3); ring(300, 2); ring(292, 5); ring(150, 3);
  for (let i = 0; i < 72; i++) { g.save(); g.rotate(i * TAU / 72); g.lineWidth = i % 6 ? 2 : 5; g.beginPath(); g.moveTo(0, -482); g.lineTo(0, i % 6 ? -466 : -448); g.stroke(); g.restore(); } // tick marks
  g.font = '700 34px serif'; g.textAlign = 'center';
  const runes = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
  for (let i = 0; i < 36; i++) { g.save(); g.rotate(i * TAU / 36); g.fillText(runes[i % runes.length], 0, -424); g.restore(); } // a band of runes
  for (let i = 0; i < 12; i++) { // lotus petals around the middle ring
    g.save(); g.rotate(i * TAU / 12); g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, -300); g.bezierCurveTo(46, -340, 40, -392, 0, -408); g.bezierCurveTo(-40, -392, -46, -340, 0, -300); g.stroke();
    g.beginPath(); g.arc(0, -352, 5, 0, TAU); g.fill(); g.restore();
  }
  for (const turn of [0, TAU / 16]) { // two eight-pointed stars
    g.lineWidth = 2.5; g.beginPath();
    for (let i = 0; i <= 8; i++) { const a = turn + i * 3 * TAU / 8; g.lineTo(Math.cos(a) * 292, Math.sin(a) * 292); }
    g.stroke();
  }
  for (let i = 0; i < 8; i++) { g.save(); g.rotate(i * TAU / 8); g.beginPath(); g.arc(0, -150, 9, 0, TAU); g.fill(); g.lineWidth = 2; g.beginPath(); g.arc(0, -221, 22, 0, TAU); g.stroke(); g.restore(); }
});
const sakuraTexture = flip => canvasTexture(64, 64, (g, w) => { // one sakura petal, with the little notch at its tip
  g.translate(w / 2, w / 2); g.rotate(flip ? 2.2 : -0.6);
  const gr = g.createLinearGradient(0, 26, 0, -26);
  gr.addColorStop(0, '#ff8fbd'); gr.addColorStop(1, '#fff0f6');
  g.fillStyle = gr; g.beginPath(); g.moveTo(0, 28); g.bezierCurveTo(24, 10, 20, -22, 6, -27); g.lineTo(0, -19); g.lineTo(-6, -27); g.bezierCurveTo(-20, -22, -24, 10, 0, 28); g.fill();
});

const blossomTexture = () => canvasTexture(128, 128, (g, w) => { // a puff of cherry blossom: lots of little five-petal flowers
  for (let i = 0; i < 90; i++) {
    const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * w * 0.42, x = w / 2 + Math.cos(a) * d, y = w / 2 + Math.sin(a) * d, r = rnd(3, 7);
    g.fillStyle = `hsla(${rnd(325, 345)},100%,${rnd(78, 94)}%,${rnd(0.55, 0.95)})`;
    for (let k = 0; k < 5; k++) { g.beginPath(); g.arc(x + Math.cos(k * TAU / 5) * r * 0.6, y + Math.sin(k * TAU / 5) * r * 0.6, r * 0.55, 0, TAU); g.fill(); }
    g.fillStyle = 'rgba(255,214,120,.9)'; g.beginPath(); g.arc(x, y, r * 0.22, 0, TAU); g.fill();
  }
});
const auroraTexture = () => canvasTexture(256, 128, (g, w, h) => { // curtains of light: bright streaks that fade out above and below
  for (let x = 0; x < w; x++) {
    const a = 0.25 + 0.75 * Math.pow(Math.abs(Math.sin(x * 0.09) * Math.sin(x * 0.023 + 1)), 0.7), top = h * rnd(0.05, 0.3);
    const gr = g.createLinearGradient(0, top, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.55, `rgba(255,255,255,${a})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(x, top, 1, h - top);
  }
}, true);

/** One lotus petal as a smooth curved surface: a pointed oval, cupped toward the heart of the flower, its tip flicking outward. */
function petalGeometry(len, wid) {
  const NV = 16, NU = 8, pos = [], uv = [], idx = [];
  for (let j = 0; j <= NV; j++) {
    const v = j / NV, half = wid * Math.pow(Math.sin(Math.PI * Math.pow(v, 0.72)), 0.85);
    for (let i = 0; i <= NU; i++) {
      const u = i / NU * 2 - 1;
      pos.push(u * half, v * len, -u * u * half * 0.55 - v * v * len * 0.2 + Math.pow(Math.max(0, v - 0.72), 2) * len * 1.5);
      uv.push(u * 0.5 + 0.5, v);
    }
  }
  for (let j = 0; j < NV; j++) for (let i = 0; i < NU; i++) {
    const a = j * (NU + 1) + i, b = a + NU + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

const RINGS = [ // from the heart outward: how many petals, their size, how far they lean when closed and when open
  { n: 5, len: 0.85, wid: 0.3, r: 0.07, closed: 0.05, open: 0.38, turn: 0 },
  { n: 8, len: 1.08, wid: 0.36, r: 0.11, closed: 0.1, open: 0.72, turn: 0.3 },
  { n: 10, len: 1.3, wid: 0.42, r: 0.16, closed: 0.17, open: 1.04, turn: 0.1 },
  { n: 12, len: 1.48, wid: 0.48, r: 0.21, closed: 0.25, open: 1.36, turn: 0.4 },
];

const ART = 'assets/summon/';
/** Fetches the painted pictures ahead of time (called when the app starts), so the scene opens with them in place. */
export function preloadSummonArt() {
  for (const n of ['sky', 'tree1', 'tree2', 'lilypad', 'rocks']) new Image().src = `${ART}${n}.webp`;
}
const paintedTexture = (name, onLoad) => new THREE.TextureLoader().load(`${ART}${name}.webp`, tex => { tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; onLoad(tex); }, undefined, () => {});

/** Starts the scene inside `overlay`. Returns the controls the cutscene uses. */
export function startScene(overlay) {
  const canvas = document.createElement('canvas');
  canvas.className = 'cut-3d';
  overlay.prepend(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x9a5a9c, 0.02);
  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 400);
  const resize = () => {
    renderer.setPixelRatio(Math.min(devicePixelRatio, 1600 / innerWidth));
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  };
  resize();
  addEventListener('resize', resize);

  const glow = glowTexture(), flare = flareTexture(), trail = trailTexture();
  const additive = (extra = {}) => ({ transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, ...extra });
  const color = new THREE.Color(RARITY.Common), tint = new THREE.Color();
  let rarity = 'Common';

  // --- light: soft dusk light from the sky, moonlight, and the flower's own glow ---
  scene.add(new THREE.HemisphereLight(0xffd6ea, 0x2a1a5a, 1.5));
  const moonLight = new THREE.DirectionalLight(0xfff0e0, 1.6);
  moonLight.position.set(-6, 8, -9);
  scene.add(moonLight);
  const heart = new THREE.PointLight(0xffffff, 12, 14, 1.6);
  heart.position.y = 0.9;
  scene.add(heart);

  // --- sky: painted dome, bright stars, the moon, drifting clouds, mountains around the lake ---
  const dome = new THREE.Mesh(new THREE.SphereGeometry(200, 32, 20), new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false }));
  scene.add(dome);
  const drawnSky = []; // the drawn stand-ins (hills, clouds, aurora, small stars) step aside once the painted sky has loaded
  const starField = (n, size) => {
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, up = Math.acos(rnd(0.07, 0.99)); p.set([Math.sin(up) * Math.cos(a) * 160, Math.cos(up) * 160, Math.sin(up) * Math.sin(a) * 160], i * 3); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size, map: size > 2 ? flare : glow, color: 0xffffff, ...additive() }));
    scene.add(pts);
    return pts;
  };
  const starsSmall = starField(1300, 1.2), starsBig = starField(70, 4.5);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: moonTexture(), fog: false }));
  moon.position.set(-70, 62, -110); moon.scale.setScalar(26);
  const moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffd9ec, ...additive({ opacity: 0.4 }) }));
  moonHalo.position.copy(moon.position); moonHalo.scale.setScalar(90);
  moonHalo.renderOrder = -2; moon.renderOrder = -1; // the halo sits behind the moon, so its face stays visible
  scene.add(moonHalo, moon);
  const cloudMap = cloudTexture(), clouds = [];
  for (let i = 0; i < 12; i++) {
    const cl = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudMap, color: i % 2 ? 0xffc4dc : 0xcbb4ff, transparent: true, opacity: 0.5, depthWrite: false, fog: false }));
    const a = i * TAU / 12 + rnd(-0.2, 0.2);
    cl.position.set(Math.cos(a) * 150, rnd(14, 46), Math.sin(a) * 150); cl.scale.set(rnd(70, 120), rnd(26, 40), 1);
    clouds.push({ cl, a, y: cl.position.y, s: rnd(0.004, 0.012) });
    drawnSky.push(cl);
    scene.add(cl);
  }
  const hillMap = mountainTexture();
  hillMap.wrapT = THREE.ClampToEdgeWrapping; // (wrapping top-to-bottom drew a thin line across the sky)
  const hills = new THREE.Mesh(new THREE.CylinderGeometry(170, 170, 46, 64, 1, true), new THREE.MeshBasicMaterial({ map: hillMap, transparent: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  hills.position.y = 11;
  scene.add(hills);
  drawnSky.push(hills, starsSmall);
  paintedTexture('sky', tex => { // the painting is wrapped round the sky twice, mirrored, so it has no seam; its bottom edge is the horizon
    tex.wrapS = THREE.MirroredRepeatWrapping; tex.repeat.set(2, 1);
    dome.geometry.dispose();
    dome.geometry = new THREE.SphereGeometry(200, 48, 24, 0, TAU, 0, Math.PI / 2 + 0.15); // (reaches a little below the horizon, so the mountains sit low)
    dome.material.map.dispose(); dome.material.map = tex; dome.material.needsUpdate = true;
    for (const o of drawnSky) o.visible = false;
  });

  // --- the lake: a see-through surface (so the flower's reflection shows), with two layers of moving glints ---
  const water = new THREE.Mesh(new THREE.CircleGeometry(190, 64), new THREE.MeshBasicMaterial({ map: waterTexture(), transparent: true, opacity: 0.86, fog: false }));
  water.rotation.x = -Math.PI / 2;
  scene.add(water);
  const shimmers = [[9, 0.14], [17, 0.09]].map(([rep, opacity], i) => {
    const map = shimmerTexture(); map.repeat.set(rep, rep);
    const m = new THREE.Mesh(new THREE.CircleGeometry(150, 48), new THREE.MeshBasicMaterial({ map, ...additive({ opacity }) }));
    m.rotation.x = -Math.PI / 2; m.rotation.z = i * 1.1; m.position.y = 0.01 + i * 0.005;
    scene.add(m);
    return map;
  });
  const waterGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: glow, ...additive({ opacity: 0.6 }) })); // the flower's light on the water
  waterGlow.rotation.x = -Math.PI / 2; waterGlow.position.y = 0.02;
  scene.add(waterGlow);

  // --- the summoning circle on the water ---
  const circleMap = circleTexture();
  const circleMat = new THREE.MeshBasicMaterial({ map: circleMap, ...additive({ opacity: 0 }) });
  const circle = new THREE.Mesh(new THREE.PlaneGeometry(11, 11), circleMat);
  circle.rotation.x = -Math.PI / 2; circle.position.y = 0.035;
  const circleInner = new THREE.Mesh(new THREE.PlaneGeometry(5.4, 5.4), new THREE.MeshBasicMaterial({ map: circleMap, color: 0xffffff, ...additive({ opacity: 0 }) }));
  circleInner.rotation.x = -Math.PI / 2; circleInner.position.y = 0.045;
  scene.add(circle, circleInner);

  // --- the lotus (and its reflection, a mirrored copy under the surface) ---
  const petalMap = petalTexture();
  const petalMat = new THREE.MeshStandardMaterial({ map: petalMap, side: THREE.DoubleSide, roughness: 0.5, metalness: 0, emissiveMap: petalMap, emissive: 0xffffff, emissiveIntensity: 0.35 });
  const mirrorMat = new THREE.MeshBasicMaterial({ map: petalMap, side: THREE.DoubleSide, transparent: true, opacity: 0.4, depthWrite: false });
  const geos = RINGS.map(r => petalGeometry(r.len, r.wid));
  const petals = [];
  const buildLotus = material => {
    const group = new THREE.Group();
    RINGS.forEach((ring, k) => {
      for (let i = 0; i < ring.n; i++) {
        const spoke = new THREE.Group(), hinge = new THREE.Group();
        spoke.rotation.y = ring.turn + i * TAU / ring.n;
        hinge.position.z = ring.r;
        hinge.add(new THREE.Mesh(geos[k], material));
        spoke.add(hinge);
        group.add(spoke);
        petals.push({ hinge, ring, phase: (i * 2.4 + k) % TAU });
      }
    });
    return group;
  };
  const lotus = buildLotus(petalMat);
  lotus.position.y = 0.22; lotus.scale.setScalar(1.25);
  // the heart of the flower: a seed pod ringed with golden stamens
  const gold = new THREE.MeshStandardMaterial({ color: 0xffd76a, emissive: 0xffb627, emissiveIntensity: 0.9, roughness: 0.4 });
  const pod = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.07, 0.2, 16), new THREE.MeshStandardMaterial({ color: 0xcfe07a, emissive: 0x7a8a2a, emissiveIntensity: 0.6, roughness: 0.6 }));
  pod.position.y = 0.16;
  lotus.add(pod);
  for (let i = 0; i < 28; i++) {
    const a = i * TAU / 28, lean = 0.35 + (i % 3) * 0.12, stem = new THREE.Group();
    const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.3, 5), gold); stalk.position.y = 0.15;
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), gold); tip.position.y = 0.31;
    stem.add(stalk, tip); stem.rotation.set(lean * Math.cos(a), 0, lean * Math.sin(a)); stem.position.y = 0.1;
    lotus.add(stem);
  }
  const mirror = buildLotus(mirrorMat);
  mirror.position.y = -0.22; mirror.scale.set(1.25, -1.25, 1.25);
  scene.add(lotus, mirror);

  // lily pads: one under the flower and a scatter across the lake
  const padMap = padTexture();
  const padMat = new THREE.MeshStandardMaterial({ map: padMap, roughness: 0.75, transparent: true, opacity: 0.94 });
  const pads = [];
  for (const [x, z, r, turn] of [[0, 0, 1.45, 0.4], [3.4, 1.6, 0.8, 2], [-3, 2.8, 0.62, 4.1], [-4.6, -1.9, 0.95, 1.2], [2.3, -3.8, 0.7, 5.2], [6.2, -1.2, 0.55, 3], [-1.1, 5.4, 0.85, 0.2], [5.1, 4.6, 0.6, 2.6], [-6.6, 3.2, 0.5, 5.9]]) {
    const pad = new THREE.Mesh(new THREE.CircleGeometry(r, 36, 0.22, TAU - 0.44), padMat); // (the gap is the pad's notch)
    pads.push([pad, r]);
    pad.rotation.x = -Math.PI / 2; pad.rotation.z = turn; pad.position.set(x, 0.025, z);
    scene.add(pad);
  }

  // --- scenery around the lake: cherry trees on little islands, a torii gate, lanterns, an aurora ---
  const blossom = blossomTexture();
  const bark = new THREE.MeshStandardMaterial({ color: 0x4a2c2a, roughness: 0.9 }), moss = new THREE.MeshStandardMaterial({ color: 0x2f6a4a, roughness: 0.9 });
  const TREES = [[0.4, 18, 1.2], [1.7, 20, 1.5], [2.9, 17.5, 1.0], [4.0, 22, 1.6], [5.2, 19, 1.25], [0.95, 27, 1.9], [3.5, 29, 2.0]]; // angle, distance, size
  const drawnTrees = new THREE.Group();
  scene.add(drawnTrees);
  for (const [a, d, size] of TREES) {
    const tree = new THREE.Group();
    const islet = new THREE.Mesh(new THREE.SphereGeometry(2.1, 18, 10), moss); islet.scale.set(1, 0.16, 1);
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.24, 2.4, 8), bark); trunk.position.y = 1.2; trunk.rotation.z = rnd(-0.15, 0.15);
    tree.add(islet, trunk);
    for (const side of [-1, 1]) { const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.09, 1.5, 6), bark); branch.position.set(side * 0.45, 2.3, 0); branch.rotation.z = -side * 0.9; tree.add(branch); }
    for (let i = 0; i < 16; i++) { // the canopy: overlapping puffs of blossom
      const puff = new THREE.Sprite(new THREE.SpriteMaterial({ map: blossom, color: i % 3 ? 0xffffff : 0xffd0e4, transparent: true, depthWrite: false }));
      const pa = Math.random() * TAU, pr = Math.sqrt(Math.random()) * 1.5;
      puff.position.set(Math.cos(pa) * pr, 2.5 + rnd(-0.3, 1.2), Math.sin(pa) * pr); puff.scale.setScalar(rnd(1.5, 2.4));
      tree.add(puff);
    }
    tree.position.set(Math.cos(a) * d, 0, Math.sin(a) * d); tree.scale.setScalar(size);
    drawnTrees.add(tree);
  }
  // painted pictures standing upright and always facing the camera, each with a faint reflection on the water
  const standing = (tex, x, z, height, sink = 0.05) => {
    const width = height * tex.image.width / tex.image.height;
    const pic = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, alphaTest: 0.35 }));
    pic.center.set(0.5, sink); pic.scale.set(width, height, 1); pic.position.set(x, 0, z);
    const mirrored = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.2, depthWrite: false }));
    mirrored.center.set(0.5, sink); mirrored.scale.set(width, -height * 0.8, 1); mirrored.position.set(x, 0.02, z);
    scene.add(mirrored, pic);
  };
  let treesLoaded = 0;
  ['tree1', 'tree2'].forEach((name, k) => paintedTexture(name, tex => {
    if (++treesLoaded === 1) drawnTrees.visible = false;
    TREES.forEach(([a, d, size], i) => { if (i % 2 === k) standing(tex, Math.cos(a) * d, Math.sin(a) * d, 5.2 * size, 0.07); });
  }));
  paintedTexture('rocks', tex => { // rocks and reeds dotted around the near water
    for (const [a, d, hgt] of [[0.1, 14.2, 2.2], [1.25, 15.5, 2.6], [2.35, 14, 2.0], [3.3, 16.4, 2.8], [4.55, 14.6, 2.3], [5.6, 16.8, 2.7], [0.75, 21, 3.0], [3.95, 23, 3.2]] /* (all beyond the camera's path) */) standing(tex, Math.cos(a) * d, Math.sin(a) * d, hgt, 0.1);
  });
  paintedTexture('lilypad', tex => { // each drawn pad becomes the painted one
    const painted = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7, alphaTest: 0.4 });
    for (const [pad, r] of pads) { pad.geometry.dispose(); pad.geometry = new THREE.PlaneGeometry(r * 2.15, r * 2.15); pad.material = painted; }
  });
  const grain = canvasTexture(64, 256, (g, w, h) => { // weathered lacquer: lighter and darker streaks down the grain
    g.fillStyle = '#fff'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(${Math.random() < 0.5 ? '70,10,10' : '255,200,180'},${rnd(0.05, 0.3)})`; g.fillRect(Math.random() * w, Math.random() * h, rnd(1, 3), rnd(20, 120)); }
  }, true);
  const red = new THREE.MeshStandardMaterial({ map: grain, color: 0xd6402f, emissive: 0x5a1208, emissiveIntensity: 0.5, roughness: 0.6 });
  const torii = new THREE.Group(); // a shrine gate standing in the water
  for (const x of [-2.6, 2.6]) { const post = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 6.4, 12), red); post.position.set(x, 3.2, 0); torii.add(post); }
  const beamTop = new THREE.Mesh(new THREE.BoxGeometry(8, 0.5, 0.7), new THREE.MeshStandardMaterial({ color: 0x1c1420, roughness: 0.7 })); beamTop.position.y = 6.6;
  const beamRed = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.42, 0.55), red); beamRed.position.y = 6.15;
  const beamLow = new THREE.Mesh(new THREE.BoxGeometry(6, 0.34, 0.4), red); beamLow.position.y = 4.9;
  torii.add(beamTop, beamRed, beamLow);
  torii.position.set(Math.cos(3.75) * 24, 0, Math.sin(3.75) * 24); torii.lookAt(0, 0, 0);
  scene.add(torii);
  const paper = canvasTexture(64, 96, (g, w, h) => { // a paper lantern: warm light through paper, dark wooden frame and ribs
    const gr = g.createRadialGradient(w / 2, h * 0.55, 2, w / 2, h * 0.55, h * 0.6);
    gr.addColorStop(0, '#fff6d0'); gr.addColorStop(0.5, '#ffc56a'); gr.addColorStop(1, '#e8742c');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(120,50,20,.45)'; g.lineWidth = 1; for (let y = 14; y < h - 8; y += 9) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.fillStyle = '#3a1c12'; g.fillRect(0, 0, w, 8); g.fillRect(0, h - 8, w, 8); g.fillRect(0, 0, 4, h); g.fillRect(w - 4, 0, 4, h);
    g.fillStyle = 'rgba(190,40,60,.8)'; g.beginPath(); g.arc(w / 2, h * 0.52, 9, 0, TAU); g.fill(); // a little crest
  });
  const lanternMat = new THREE.MeshBasicMaterial({ map: paper }), lanternGeo = new THREE.BoxGeometry(0.24, 0.34, 0.24);
  const lanterns = Array.from({ length: 34 }, (_, i) => { // paper lanterns: most float on the water, some rise into the sky
    const sky = i >= 22, a = Math.random() * TAU, d = sky ? rnd(8, 34) : rnd(3.5, 17);
    const g = new THREE.Group(), box = new THREE.Mesh(lanternGeo, lanternMat);
    const light = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffa24a, ...additive({ opacity: 0.7 }) })); light.scale.setScalar(1.3);
    g.add(box, light); g.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    scene.add(g);
    return { g, sky, y: sky ? rnd(2, 26) : 0.16, p: Math.random() * TAU, s: rnd(0.25, 0.6) };
  });
  const auroraMaps = [0x7affd6, 0xff9ad6].map((c, i) => {
    const map = auroraTexture(); map.repeat.set(2, 1);
    const ribbon = new THREE.Mesh(new THREE.CylinderGeometry(175, 175, 70, 48, 1, true, i * 2.6 + 0.4, 1.7), new THREE.MeshBasicMaterial({ map, color: c, side: THREE.BackSide, ...additive({ opacity: 0.22 }) }));
    ribbon.position.y = 78 + i * 10;
    scene.add(ribbon);
    drawnSky.push(ribbon);
    return map;
  });

  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: flare, color: 0xfff1c9, ...additive() }));
  core.position.y = 0.78;
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, ...additive({ opacity: 0.5 }) })); // big soft light in the rarity colour
  halo.position.y = 1.2;
  scene.add(core, halo);

  // --- pillar of light and fanning rays (on at the bloom) ---
  const pillarTex = canvasTexture(64, 256, (g, w, h) => { // light that thins out as it climbs, with faint streaks
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.7, 'rgba(255,255,255,.65)'); gr.addColorStop(1, 'rgba(255,255,255,1)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 14; i++) { g.fillStyle = `rgba(0,0,0,${rnd(0.15, 0.5)})`; g.fillRect(Math.random() * w, 0, rnd(1, 4), h); }
  }, true);
  const pillarMat = new THREE.MeshBasicMaterial({ map: pillarTex, side: THREE.DoubleSide, ...additive({ opacity: 0 }) });
  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 0.75, 80, 32, 1, true), pillarMat);
  pillar.position.y = 40;
  const pillarCore = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.22, 80, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide, ...additive({ opacity: 0 }) }));
  pillarCore.position.y = 40;
  const rays = new THREE.Group();
  const rayMat = new THREE.MeshBasicMaterial({ map: trail, side: THREE.DoubleSide, ...additive({ opacity: 0 }) });
  for (let i = 0; i < 9; i++) {
    const geo = new THREE.PlaneGeometry(rnd(0.5, 1.3), rnd(9, 16)); geo.translate(0, -geo.parameters.height / 2, 0);
    const ray = new THREE.Mesh(geo, rayMat), spoke = new THREE.Group();
    ray.rotation.z = Math.PI + rnd(0.25, 0.7); // from the heart, up and outward
    spoke.rotation.y = i * TAU / 9 + rnd(-0.2, 0.2); spoke.add(ray); rays.add(spoke);
  }
  rays.position.y = 0.8;
  scene.add(pillar, pillarCore, rays);

  // --- sakura petals drawn in toward the flower, and fireflies over the water ---
  const N_PETALS = 280;
  const drift = Array.from({ length: N_PETALS }, () => ({ a: Math.random() * TAU, d: rnd(1, 15), y: rnd(0.3, 6.3), s: rnd(0.4, 1.4) }));
  const driftGeos = [0, 1].map(k => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N_PETALS / 2 * 3), 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: k ? 0.3 : 0.4, map: sakuraTexture(k), transparent: true, alphaTest: 0.05, depthWrite: false }));
    pts.frustumCulled = false;
    scene.add(pts);
    return geo;
  });
  const flies = Array.from({ length: 46 }, () => ({ x: rnd(-13, 13), z: rnd(-13, 13), y: rnd(0.2, 1.6), p: Math.random() * TAU, s: rnd(0.3, 0.9) }));
  const flyGeo = new THREE.BufferGeometry();
  flyGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(flies.length * 3), 3));
  const flyMat = new THREE.PointsMaterial({ size: 0.28, map: glow, color: 0xfff3a8, ...additive() });
  scene.add(new THREE.Points(flyGeo, flyMat));

  // --- sparks (bursts) ---
  const N_SPARKS = 1100;
  const sparkPos = new Float32Array(N_SPARKS * 3).fill(-999), sparkCol = new Float32Array(N_SPARKS * 3);
  const sparks = Array.from({ length: N_SPARKS }, () => ({ life: 0, v: new THREE.Vector3(), g: 0 }));
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPos, 3));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sparkCol, 3));
  const sparkPoints = new THREE.Points(sparkGeo, new THREE.PointsMaterial({ size: 0.34, map: flare, vertexColors: true, ...additive() }));
  sparkPoints.frustumCulled = false;
  scene.add(sparkPoints);
  let nextSpark = 0;
  const burst = (at, n, speed, c, up = 0.4, gravity = 3) => {
    for (let i = 0; i < n; i++) {
      const k = nextSpark = (nextSpark + 1) % N_SPARKS, s = sparks[k];
      const a = Math.random() * TAU, el = (Math.random() - 0.5 + up) * Math.PI * 0.9, sp = rnd(0.3, 1.3) * speed;
      s.v.set(Math.cos(a) * Math.cos(el) * sp, Math.sin(el) * sp, Math.sin(a) * Math.cos(el) * sp);
      s.life = rnd(0.7, 1.6); s.g = gravity;
      sparkPos.set([at.x, at.y, at.z], k * 3);
      sparkCol.set(Math.random() < 0.3 ? [1, 1, 1] : [c.r, c.g, c.b], k * 3);
    }
  };

  // --- ripples on the water ---
  const ringGeo = new THREE.RingGeometry(0.955, 1, 72), ringGeoThin = new THREE.RingGeometry(0.985, 1, 72);
  const ripples = [];
  const ripple = (c, speed = 6, start = 0.4) => {
    for (const [geo, lag] of [[ringGeo, 0], [ringGeoThin, 0.55]]) { // a bold ring with a fine one chasing it
      const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide, ...additive() }));
      m.rotation.x = -Math.PI / 2; m.position.y = 0.05; m.scale.setScalar(Math.max(0.05, start - lag));
      scene.add(m);
      ripples.push({ m, speed, life: 1 });
    }
  };

  // --- shooting stars ---
  const trailGeo = new THREE.PlaneGeometry(1, 11);
  trailGeo.translate(0, -5.5, 0); // the head is at the top end
  let meteors = [];

  // --- camera and state ---
  const cam = { ang: 0.6, r: 13, h: 3.6, look: 1.2, tr: 7.4, th: 2.1, tlook: 1.2, spin: 0.22 };
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
    petalMat.color.set(0xffffff).lerp(color, 0.42); petalMat.emissive.copy(petalMat.color);
    mirrorMat.color.copy(petalMat.color);
    for (const m of [halo.material, waterGlow.material, pillarMat, rayMat, circleMat]) m.color.copy(color);
    heart.color.copy(color).lerp(tint.set(0xffffff), 0.35);

    charge = Math.min(1, charge + dt * 0.3);
    pulse *= Math.pow(0.02, dt);
    bloom += (bloomTo - bloom) * Math.min(1, dt * 4.5);
    if (lookDownAt && now > lookDownAt) { lookDownAt = 0; cam.tlook = 1.3; cam.tr = 8.4; cam.th = 2; }
    if (bloomedAt && now - bloomedAt > 1300) { bloomedAt = 0; cam.tr = 8.8; cam.th = 2.9; cam.tlook = 1.5; cam.spin = 0.16; }

    // lotus: the bud breathes, swells when struck, and opens at the bloom (its reflection follows)
    for (const p of petals) {
      const open = THREE.MathUtils.lerp(p.ring.closed, p.ring.open, bloom);
      p.hinge.rotation.x = open + Math.sin(t * 1.6 + p.phase) * 0.02 + (charge * 0.05 + pulse * 0.15) * (1 - bloom);
    }
    lotus.rotation.y = mirror.rotation.y = t * 0.12;
    const swell = 1 + pulse * 0.6;
    petalMat.emissiveIntensity = 0.3 + charge * 0.2 + pulse * 0.5 + bloom * 0.25;
    heart.intensity = (8 + charge * 14 + bloom * 30) * swell;
    core.scale.setScalar((1.6 + charge * 1.8 + bloom * 5) * swell); core.material.rotation = t * 0.3;
    halo.scale.setScalar((5 + charge * 4 + bloom * 9) * swell);
    halo.material.opacity = 0.3 + charge * 0.2 + pulse * 0.3;
    waterGlow.scale.setScalar((7 + charge * 4 + bloom * 12) * swell);

    // summoning circle: fades in as the bud charges, flares on every impact
    circleMat.opacity = Math.min(1, charge * 1.4) * (0.45 + pulse * 0.5 + bloom * 0.3);
    circleInner.material.opacity = circleMat.opacity * 0.8;
    circle.rotation.z = t * 0.18; circleInner.rotation.z = -t * 0.42;
    circle.scale.setScalar(0.6 + 0.4 * Math.min(1, charge * 2) + bloom * 0.25);

    // sky and lake
    starsSmall.rotation.y = t * 0.006; starsBig.rotation.y = t * 0.006;
    starsBig.material.opacity = 0.65 + 0.35 * Math.sin(t * 2.3);
    for (const c of clouds) { c.a += dt * c.s; c.cl.position.set(Math.cos(c.a) * 150, c.y, Math.sin(c.a) * 150); }
    for (const l of lanterns) { // lanterns bob on the water or drift up into the sky
      if (l.sky) { l.y += dt * l.s; if (l.y > 30) l.y = 1.5; }
      l.g.position.y = l.y + Math.sin(t * 1.3 + l.p) * (l.sky ? 0.3 : 0.035);
      l.g.rotation.y = t * 0.2 + l.p;
    }
    auroraMaps[0].offset.x = t * 0.006; auroraMaps[1].offset.x = -t * 0.004;
    shimmers[0].offset.x = t * 0.012; shimmers[0].offset.y = t * 0.005;
    shimmers[1].offset.x = -t * 0.009; shimmers[1].offset.y = t * 0.014;

    // pillar of light and rays
    pillarOn += ((bloomTo ? 1 : 0) - pillarOn) * Math.min(1, dt * 5);
    pillarMat.opacity = pillarOn * (0.5 + 0.12 * Math.sin(t * 9));
    pillarCore.material.opacity = pillarOn * 0.8;
    pillar.scale.x = pillar.scale.z = 1 + 0.08 * Math.sin(t * 7);
    pillar.rotation.y = t * 0.8; pillarTex.offset.y = -t * 0.6;
    rayMat.opacity = pillarOn * (0.3 + 0.12 * Math.sin(t * 5)); rays.rotation.y = -t * 0.25;

    // sakura petals: spiral inward while the bud charges, drift up and outward once it has bloomed
    for (let i = 0; i < N_PETALS; i++) {
      const p = drift[i];
      if (bloom < 0.5) {
        p.a += dt * p.s * (0.3 + charge * 1.6) / Math.max(0.6, p.d * 0.3);
        p.d -= dt * p.s * (0.3 + charge * 2.2);
        p.y += (0.9 - p.y) * dt * 0.25 * charge;
        if (p.d < 0.3) { p.d = rnd(8, 16); p.y = rnd(0.3, 6.3); }
      } else {
        p.a += dt * p.s * 0.25; p.d += dt * p.s * 1.4; p.y += dt * p.s * 1.1;
        if (p.d > 16 || p.y > 9) { p.d = rnd(0.5, 2.5); p.y = rnd(0.4, 1.4); }
      }
      driftGeos[i % 2].attributes.position.setXYZ(i >> 1, Math.cos(p.a) * p.d, p.y + Math.sin(t * p.s + i) * 0.18, Math.sin(p.a) * p.d);
    }
    driftGeos[0].attributes.position.needsUpdate = driftGeos[1].attributes.position.needsUpdate = true;
    flies.forEach((f, i) => flyGeo.attributes.position.setXYZ(i, f.x + Math.sin(t * f.s + f.p) * 0.9, f.y + Math.sin(t * f.s * 1.7 + f.p) * 0.3, f.z + Math.cos(t * f.s * 0.8 + f.p) * 0.9));
    flyGeo.attributes.position.needsUpdate = true;
    flyMat.opacity = 0.55 + 0.35 * Math.sin(t * 3.1);

    // shooting stars
    for (const m of meteors) {
      if (m.done || now < m.start) continue;
      const p = Math.min(1, (now - m.start) / m.time), e = p * p;
      const prev = m.head.position.clone();
      m.head.position.lerpVectors(m.from, target, e);
      m.head.position.x += Math.sin(p * Math.PI) * m.bend;
      m.head.visible = m.tail.visible = true;
      m.head.material.rotation = t * 3;
      const dir = m.head.position.clone().sub(prev);
      if (dir.lengthSq() > 1e-8) m.tail.quaternion.setFromUnitVectors(Y_AXIS, dir.normalize());
      m.tail.position.copy(m.head.position);
      if (RARITY[m.rarity] === 'rainbow') { m.head.material.color.copy(color); m.tailMat.color.copy(color); }
      burst(m.head.position, 2, 0.9, m.head.material.color, 0, 0.6); // glitter shed along the way
      if (p >= 1) {
        m.done = true; m.head.visible = m.tail.visible = false;
        pulse = 1; shake = Math.max(shake, 0.25);
        ripple(m.head.material.color.getHex(), 7);
        burst(target, 46, 4.5, m.head.material.color, 0.5);
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
        const head = new THREE.Sprite(new THREE.SpriteMaterial({ map: flare, color: c, ...additive() }));
        head.scale.setScalar(3.4);
        const tailMat = new THREE.MeshBasicMaterial({ map: trail, color: c, side: THREE.DoubleSide, ...additive() });
        const tail = new THREE.Group(), blade = new THREE.Mesh(trailGeo, tailMat), cross = new THREE.Mesh(trailGeo, tailMat);
        cross.rotation.y = Math.PI / 2; // two crossed sheets, so the tail shows from any side
        tail.add(blade, cross);
        head.visible = tail.visible = false;
        scene.add(head, tail);
        const a = cam.ang + Math.PI + (Math.random() - 0.5) * 1.6; // they come from the sky ahead of the camera
        return { rarity: r, head, tail, tailMat, start: now + i * gap, time, done: false, bend: (Math.random() - 0.5) * 6,
          from: new THREE.Vector3(Math.cos(a) * 34, rnd(26, 34), Math.sin(a) * 34), onHit: () => onHit(i) };
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
        cam.tr = 4.6; cam.th = 2.3; cam.tlook = 1.5; cam.spin = 0.5;
        for (let i = 0; i < 3; i++) ripple(i === 1 ? 0xffffff : color.getHex(), 9 + i * 4, 0.3);
      }
      burst(target, Math.round(420 * strength), 9, color, 0.6, 4);
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
