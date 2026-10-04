// The summon reveal in 3D: the character's real VRoid model drops in spinning, lands, strikes their signature pose
// and then idles (breathing, blinking, swaying) while the camera pulls back and drifts.
// Behind them, an effects layer themed to their personality (petals, sun rays, rune rings, orbs, floating blades).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { FALL, SIGNATURE, DEFAULT, blend, writePose } from './poses.js';

const TAU = Math.PI * 2;
const clamp01 = x => Math.max(0, Math.min(1, x));
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const easeOut = x => 1 - Math.pow(1 - clamp01(x), 3);

const LAND = 0.75;   // seconds after the entrance starts when the feet touch down
const FACING = -0.3; // final turn of the body, a little toward the name on the left

export class SummonStage {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'rv-3d';
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(26, 1, 0.1, 50);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.85));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(-1, 2, 3);
    this.scene.add(key);
    this.rim = new THREE.DirectionalLight(0xffffff, 2.6); // coloured light from behind, in the character's colour
    this.rim.position.set(2, 1.5, -2.5);
    this.scene.add(this.rim);
    this.clock = new THREE.Clock();
    this.model = null;
    this.running = false;
  }

  /** Loads a model ahead of time. Resolves to the model, or null if it is missing or broken. */
  async load(url) {
    try {
      const head = await fetch(url, { method: 'HEAD' });
      if (!head.ok) return null;
      const loader = new GLTFLoader();
      loader.register(parser => new VRMLoaderPlugin(parser));
      const gltf = await loader.loadAsync(url);
      const vrm = gltf.userData.vrm;
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.rotateVRM0(vrm);
      vrm.scene.traverse(o => { o.frustumCulled = false; });
      return vrm;
    } catch (e) {
      console.warn('[summon] model not available:', e.message);
      return null;
    }
  }

  /** Starts the entrance of a loaded model inside `holder`. onLand() fires when the feet touch down. */
  play(vrm, holder, { personality, color }, onLand) {
    this.clear();
    holder.appendChild(this.canvas);
    this.model = vrm;
    this.root = new THREE.Group();
    this.root.add(vrm.scene);
    this.scene.add(this.root);
    this.rim.color.set(color || '#ffffff');
    this.signature = SIGNATURE[personality] || SIGNATURE.cheerful;
    this.mood = personality === 'cheerful' || personality === 'rival' ? 'happy' : 'relaxed';
    vrm.update(0);
    const head = new THREE.Vector3();
    vrm.humanoid.getRawBoneNode('head').getWorldPosition(head);
    this.height = head.y + 0.18;
    if (vrm.lookAt) vrm.lookAt.target = this.camera;
    this.onLand = onLand;
    this.landed = false;
    this.nextBlink = 2.5;
    this.blinkStart = -1;
    this.resize();
    this.clock = new THREE.Clock();
    this.running = true;
    this.onResize = () => this.resize();
    addEventListener('resize', this.onResize);
    this.renderer.setAnimationLoop(() => this.frame());
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1600 / w));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.setViewOffset(w, h, -w * 0.15, 0, w, h); // puts the character right of centre, leaving the left for the name
    this.camera.updateProjectionMatrix();
  }

  frame() {
    if (!this.running) return;
    const now = performance.now(); // fast screens ask for 120+ frames a second; 60 looks the same for half the work
    if (now - (this.lastFrame || 0) < 15) return;
    this.lastFrame = now;
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;
    const vrm = this.model, H = this.height;

    // --- body: spin in from behind while dropping, squash on landing, then settle ---
    const spin = easeOut(t / 1.05);
    this.root.rotation.y = 2.7 + (FACING - 2.7) * spin + Math.sin(t * 0.5) * 0.04 * smooth(1.5, 3, t);
    const drop = t < LAND ? 0.55 * Math.pow(1 - t / LAND, 2) : 0;
    const squash = t >= LAND && t < LAND + 0.4 ? Math.sin(((t - LAND) / 0.4) * Math.PI) : 0; // knees bend on impact
    this.root.position.y = drop - squash * 0.09;
    if (!this.landed && t >= LAND) { this.landed = true; if (this.onLand) this.onLand(); }

    // --- pose: falling -> signature pose, with idle breathing on top ---
    const pose = blend(FALL, blend(DEFAULT, this.signature, smooth(LAND - 0.1, LAND + 0.75, t)), smooth(LAND - 0.35, LAND + 0.3, t));
    const breathe = Math.sin(t * 1.7), sway = Math.sin(t * 0.45);
    const add = (bone, x, y, z) => { pose[bone][0] += x; pose[bone][1] += y; pose[bone][2] += z; };
    add('spine', breathe * 0.02, 0, sway * 0.02);
    add('chest', breathe * 0.015, 0, 0);
    add('hips', 0, 0, -sway * 0.02);
    add('head', Math.sin(t * 0.9) * 0.02, Math.sin(t * 0.6) * 0.04, Math.sin(t * 0.7) * 0.03);
    add('leftUpperArm', 0, 0, breathe * 0.015); add('rightUpperArm', 0, 0, -breathe * 0.015);
    for (const side of ['left', 'right']) { add(side + 'UpperLeg', -squash * 0.55, 0, 0); add(side + 'LowerLeg', squash * 1.05, 0, 0); }
    writePose(vrm, pose);

    // --- face ---
    const em = vrm.expressionManager;
    if (em) {
      if (t > this.nextBlink) { this.blinkStart = t; this.nextBlink = t + 2 + Math.random() * 3.5; }
      const blink = this.blinkStart > 0 && t - this.blinkStart < 0.15 ? Math.sin(((t - this.blinkStart) / 0.15) * Math.PI) : 0;
      const smile = smooth(LAND, LAND + 0.8, t) * (this.mood === 'happy' ? 0.75 : 0.5);
      em.setValue(this.mood, smile);
      em.setValue('blink', this.mood === 'happy' && smile > 0.6 ? 0 : blink);
    }
    vrm.update(dt);

    // --- camera: starts close on the face from below, pulls back to a knee-up shot, then drifts ---
    const pull = easeOut(t / 1.9);
    const dist = (H * 0.98) / (2 * Math.tan(THREE.MathUtils.degToRad(13)));
    const drift = smooth(1.8, 4, t);
    const lookY = THREE.MathUtils.lerp(H * 0.9, H * 0.62, pull);
    this.camera.position.set(
      THREE.MathUtils.lerp(0.35, 0, pull) + Math.sin(t * 0.25) * 0.06 * drift,
      THREE.MathUtils.lerp(H * 0.72, H * 0.64, pull) + Math.sin(t * 0.31) * 0.015 * drift,
      THREE.MathUtils.lerp(dist * 0.42, dist, pull) - Math.sin(t * 0.2) * 0.05 * drift);
    this.camera.lookAt(0, lookY, 0);
    this.renderer.render(this.scene, this.camera);
  }

  /** Removes the current model (the stage itself can be reused for the next reveal). */
  clear() {
    this.running = false;
    this.renderer.setAnimationLoop(null);
    if (this.onResize) removeEventListener('resize', this.onResize);
    if (this.root) this.scene.remove(this.root);
    if (this.model) VRMUtils.deepDispose(this.model.scene);
    this.model = this.root = null;
    this.canvas.remove();
  }

  dispose() {
    this.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}

/** Frees a model that was loaded ahead of time but never shown. */
export function discardModel(vrm) {
  if (vrm) VRMUtils.deepDispose(vrm.scene);
}

// ---------------- Effects layer behind the character (2D canvas) ----------------
/** kind is the character's personality; color is their colour. Returns { land(), stop() }. */
export function startFx(canvas, kind, color) {
  const g = canvas.getContext('2d');
  let w, h, cx, cy, unit;
  const resize = () => {
    const scale = Math.min(1, 1440 / innerWidth);
    w = canvas.width = Math.round(innerWidth * scale); h = canvas.height = Math.round(innerHeight * scale);
    cx = w * 0.65; cy = h * 0.5; unit = Math.min(w, h);
  };
  resize();
  addEventListener('resize', resize);
  const r = Math.random;
  const many = (n, f) => Array.from({ length: n }, f);
  const orbit = many(kind === 'tsundere' ? 46 : 0, () => ({ a: r() * TAU, d: 0.18 + r() * 0.42, s: 0.3 + r() * 0.7, y: (r() - 0.5) * 0.9, sz: 4 + r() * 6, p: r() * TAU }));
  const sparkles = many(kind === 'cheerful' ? 60 : 26, () => ({ x: r(), y: r(), p: r() * TAU, sz: 1 + r() * 2.5 }));
  const orbs = many(kind === 'chill' ? 5 : 0, (_, i) => ({ x: [0.2, 0.42, 0.9, 0.06, 0.82][i], y: [0.3, 0.72, 0.62, 0.8, 0.2][i], rad: 0.09 + r() * 0.05, p: r() * TAU }));
  const blades = many(kind === 'rival' ? 7 : 0, () => ({ x: r(), y: r(), rot: r() * TAU, s: 0.6 + r() * 0.8, v: 0.02 + r() * 0.05, p: r() * TAU }));
  const pages = many(kind === 'sensei' ? 12 : 0, () => ({ a: r() * TAU, d: 0.3 + r() * 0.35, s: 0.1 + r() * 0.2, y: (r() - 0.5) * 0.8, p: r() * TAU }));
  const rings = [];  // shockwaves from the landing
  const sparks = []; // burst from the landing
  let running = true, last = 0;
  const t0 = performance.now();

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (now - last < 30) return; // ~30 frames per second is enough for a backdrop effect
    last = now;
    const t = (now - t0) / 1000;
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';
    g.strokeStyle = g.fillStyle = color;
    const appear = Math.min(1, t / 1.2);

    if (kind === 'cheerful') { // a slow wheel of sun rays behind her
      for (let i = 0; i < 16; i++) {
        const a = t * 0.12 + i * TAU / 16, len = unit * (i % 2 ? 0.75 : 1.1);
        const gr = g.createLinearGradient(cx, cy, cx + Math.cos(a) * len, cy + Math.sin(a) * len);
        gr.addColorStop(0, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.globalAlpha = 0.16 * appear; g.fillStyle = gr; g.beginPath(); g.moveTo(cx, cy);
        g.lineTo(cx + Math.cos(a - 0.07) * len, cy + Math.sin(a - 0.07) * len); g.lineTo(cx + Math.cos(a + 0.07) * len, cy + Math.sin(a + 0.07) * len); g.fill();
      }
    }
    if (kind === 'sensei') { // rune rings turning in opposite directions, with pages of light floating round
      for (const [rad, dir, n] of [[0.36, 0.25, 36], [0.27, -0.4, 18], [0.45, 0.12, 60]]) {
        g.globalAlpha = 0.5 * appear; g.lineWidth = 1.5; g.strokeStyle = color;
        g.beginPath(); g.ellipse(cx, cy, unit * rad, unit * rad, 0, 0, TAU); g.stroke();
        for (let i = 0; i < n; i++) { const a = t * dir + i * TAU / n, len = unit * (i % 3 ? 0.012 : 0.03); g.beginPath(); g.moveTo(cx + Math.cos(a) * unit * rad, cy + Math.sin(a) * unit * rad); g.lineTo(cx + Math.cos(a) * (unit * rad + len), cy + Math.sin(a) * (unit * rad + len)); g.stroke(); }
      }
      for (const p of pages) {
        const a = p.a + t * p.s, x = cx + Math.cos(a) * unit * p.d, y = cy + p.y * h * 0.5 + Math.sin(t + p.p) * 12;
        g.save(); g.translate(x, y); g.rotate(Math.sin(t * 0.8 + p.p) * 0.5); g.globalAlpha = (0.25 + 0.3 * Math.abs(Math.sin(a))) * appear; g.fillStyle = '#fff';
        g.fillRect(-unit * 0.016, -unit * 0.022, unit * 0.032, unit * 0.044); g.restore();
      }
    }
    for (const o of orbs) { // big soft orbs with a slow swirl inside
      const x = o.x * w + Math.sin(t * 0.3 + o.p) * 18, y = o.y * h + Math.cos(t * 0.25 + o.p) * 14, rad = unit * o.rad;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, 'rgba(255,255,255,.75)'); gr.addColorStop(0.45, color); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = 0.5 * appear; g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
      g.globalAlpha = 0.6 * appear; g.strokeStyle = '#fff'; g.lineWidth = 1.5;
      for (let k = 0; k < 3; k++) { g.beginPath(); g.arc(x, y, rad * (0.25 + k * 0.17), t * (1.2 - k * 0.3) + o.p + k, t * (1.2 - k * 0.3) + o.p + k + 2.2); g.stroke(); }
    }
    for (const b of blades) { // blades hanging in the air, slowly turning
      b.y -= b.v * 0.01; if (b.y < -0.2) b.y = 1.2;
      const x = b.x * w, y = b.y * h + Math.sin(t * 0.6 + b.p) * 10, len = unit * 0.16 * b.s;
      g.save(); g.translate(x, y); g.rotate(b.rot + Math.sin(t * 0.3 + b.p) * 0.25); g.globalAlpha = 0.5 * appear;
      const gr = g.createLinearGradient(0, -len, 0, len * 0.5); gr.addColorStop(0, '#fff'); gr.addColorStop(1, color);
      g.fillStyle = gr; g.beginPath(); g.moveTo(0, -len); g.lineTo(len * 0.07, len * 0.25); g.lineTo(-len * 0.07, len * 0.25); g.fill(); // blade
      g.fillStyle = color; g.fillRect(-len * 0.2, len * 0.25, len * 0.4, len * 0.04); g.fillRect(-len * 0.03, len * 0.29, len * 0.06, len * 0.22); // guard and grip
      g.restore();
    }
    for (const p of orbit) { // petals whirling around her
      const a = p.a + t * p.s, depth = Math.sin(a), x = cx + Math.cos(a) * unit * p.d, y = cy + p.y * h * 0.5 + Math.sin(t * 0.8 + p.p) * 14 - t * 6 % (h * 0.2);
      g.save(); g.translate(x, y); g.rotate(a * 2 + p.p); g.globalAlpha = (0.35 + 0.4 * (depth * 0.5 + 0.5)) * appear; g.fillStyle = depth > 0 ? '#fff0f6' : color;
      g.beginPath(); g.ellipse(0, 0, p.sz, p.sz * 0.5, 0, 0, TAU); g.fill(); g.restore();
    }
    g.fillStyle = '#fff';
    for (const s of sparkles) { // four-point glints
      const a = Math.max(0, Math.sin(t * 1.8 + s.p)); if (a < 0.05) continue;
      const x = s.x * w, y = s.y * h, len = s.sz * 4 * a;
      g.globalAlpha = a * appear; g.fillRect(x - len, y - 0.7, len * 2, 1.4); g.fillRect(x - 0.7, y - len, 1.4, len * 2);
    }
    for (let i = rings.length - 1; i >= 0; i--) {
      const ring = rings[i]; ring.r += unit * 0.03; ring.life -= 0.045;
      if (ring.life <= 0) { rings.splice(i, 1); continue; }
      g.globalAlpha = ring.life; g.strokeStyle = i % 2 ? '#fff' : color; g.lineWidth = 2 + ring.life * 8;
      g.beginPath(); g.ellipse(cx, h * 0.92, ring.r, ring.r * 0.28, 0, 0, TAU); g.stroke(); // flat on the ground under her feet
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.25; p.life -= 0.03;
      if (p.life <= 0) { sparks.splice(i, 1); continue; }
      g.globalAlpha = Math.min(1, p.life); g.fillStyle = p.col; g.beginPath(); g.arc(p.x, p.y, 2.5 * p.life + 0.5, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
  }
  requestAnimationFrame(frame);

  return {
    /** The landing: shockwaves along the ground and a fountain of sparks. */
    land() {
      for (let i = 0; i < 3; i++) rings.push({ r: unit * 0.04 * i, life: 1 });
      for (let i = 0; i < 90; i++) { const a = -Math.PI * r(), sp = (0.3 + r()) * unit * 0.022; sparks.push({ x: cx + (r() - 0.5) * unit * 0.2, y: h * 0.9, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.3, col: i % 3 ? color : '#fff' }); }
    },
    stop() { running = false; removeEventListener('resize', resize); },
  };
}
