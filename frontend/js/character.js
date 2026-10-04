// The 3D anime character: loads a VRoid .vrm model (or a cute placeholder if none exists yet),
// plays idle/emotion animations procedurally, blinks, lip-syncs and wears accessories.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { buildAccessory, DEFAULT_FACE } from './accessories.js';

const EMOTIONS = ['happy', 'angry', 'sad', 'surprised', 'relaxed'];
const MAX_YAW = 0.7;    // how far she can turn her head left/right (radians, ~40°)
const MAX_PITCH = 0.35; // how far she can look up/down (~20°)
const IDLE_LOOK_BACK = 4; // seconds without mouse movement before she looks back at you

export class Character {
  constructor(canvas, getMouthLevel) {
    this.getMouthLevel = getMouthLevel || (() => 0);
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);

    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 2.3);
    key.position.set(1, 2, 3);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0xffc0e0, 1.2);
    rim.position.set(-2, 2, -2);
    this.scene.add(rim);

    this.clock = new THREE.Clock();
    this.vrm = null;
    this.root = null;
    this.head = null;
    this.accBasis = new THREE.Quaternion();
    this.height = 1.6;
    this.mouth = 0;
    this.emotion = 'neutral';
    this.emotionUntil = 0;
    this.weights = Object.fromEntries(EMOTIONS.map(e => [e, 0]));
    this.nextBlink = 2;
    this.blinkStart = -1;
    this.accGroup = new THREE.Group();
    this.equipped = [];
    this.face = DEFAULT_FACE; // eye positions in accessory space (used by glasses)

    // View: menus cover the right side of the screen, so the character slides over to stay centred in what's left.
    this.shift = 0; this.shiftTarget = 0;
    // Dressing room: drag to turn the character around, and zoom between full body (0) and close-up (1).
    this.dragRotate = false;
    this.drag = null;
    this.spin = 0;
    this.zoom = 0; this.zoomTarget = 0;

    // Cursor tracking: she turns her head (and eyes, on VRM models) toward the mouse.
    this.followCursor = true;
    this.cursor = null;            // {x, y} in normalized device coords, or null when the mouse is away
    this.lastMouseMove = -99;
    this.look = { yaw: 0, pitch: 0 }; // smoothed head angles
    this.lookTarget = new THREE.Object3D(); // what the VRM eyes look at
    this.scene.add(this.lookTarget);
    this.raycaster = new THREE.Raycaster();
    window.addEventListener('pointermove', e => {
      const r = canvas.getBoundingClientRect();
      this.cursor = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
      this.lastMouseMove = this.clock.elapsedTime;
      if (this.drag) {
        const dx = e.clientX - this.drag.x;
        if (Math.abs(dx) > 4) this.drag.moved = true;
        if (this.drag.moved) { this.spin = this.drag.spin + dx * 0.012; canvas.style.cursor = 'grabbing'; return; }
      }
      if (e.target === canvas) canvas.style.cursor = this.hitTest(this.cursor) ? 'pointer' : this.dragRotate ? 'grab' : '';
    });

    // Poking: click her body for a reaction, click her head for a headpat.
    this.onPoke = null; // set by app.js: (zone: 'head' | 'body') => void
    this.pokeAt = -99;
    this.blush = 0;
    this.blushUntil = 0;
    this.waveUntil = 0;
    this.waveAmt = 0;
    canvas.addEventListener('pointerdown', e => {
      const r = canvas.getBoundingClientRect();
      const ndc = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
      if (this.dragRotate) { this.drag = { x: e.clientX, spin: this.spin, moved: false, ndc }; return; } // poke on release if it wasn't a drag
      this.poke(ndc);
    });
    window.addEventListener('pointerup', () => {
      const d = this.drag;
      this.drag = null;
      if (d && !d.moved) this.poke(d.ndc);
    });
    document.addEventListener('pointerleave', () => { this.cursor = null; });
    document.addEventListener('mouseout', e => { if (!e.relatedTarget) this.cursor = null; });

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.update());
  }

  poke(ndc) {
    const zone = this.hitTest(ndc);
    if (!zone) return;
    this.pokeAt = this.clock.elapsedTime;
    if (zone === 'head') this.setBlush(2.5);
    if (this.onPoke) this.onPoke(zone);
  }

  /** px = how many pixels on the right are covered by a menu. */
  setShift(px) { this.shiftTarget = px; }

  /** Dressing room mode: drag to rotate. Turning it off makes the character face forward again. */
  setDressing(on) { this.dragRotate = on; if (!on) { this.drag = null; this.zoomTarget = 0; } }

  /** 'full' body or 'face' close-up. */
  setFraming(view) { this.zoomTarget = view === 'face' ? 1 : 0; }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Shift the view so the character is centered in the space left of the open menu
    const p = Math.round(this.shift);
    this.camera.setViewOffset(w + p, h, p, 0, w, h);
    this.camera.updateProjectionMatrix();
  }

  frameCamera() {
    const h = this.height, z = this.zoom;
    const half = Math.tan(THREE.MathUtils.degToRad(15));
    const fullDist = (h * 1.4) / (2 * half), faceDist = 0.8 / (2 * half);
    const y = THREE.MathUtils.lerp(h * 0.56, h - 0.16, z);
    this.camera.position.set(0, y + 0.02 * h * (1 - z), THREE.MathUtils.lerp(fullDist, faceDist, z));
    this.camera.lookAt(0, y, 0);
  }

  clear() {
    if (this.root) {
      this.scene.remove(this.root);
      if (this.vrm) VRMUtils.deepDispose(this.vrm.scene);
    }
    this.vrm = null;
    this.root = null;
    this.head = null;
  }

  /** Loads a .vrm file. Falls back to a placeholder if the file is missing. Returns true if VRM loaded. */
  async load(url, color = '#ff7eb6') {
    this.clear();
    let ok = false;
    try {
      const head = await fetch(url, { method: 'HEAD' });
      if (!head.ok) throw new Error('missing model');
      const loader = new GLTFLoader();
      loader.register(parser => new VRMLoaderPlugin(parser));
      const gltf = await loader.loadAsync(url);
      const vrm = gltf.userData.vrm;
      VRMUtils.removeUnnecessaryVertices(gltf.scene);
      VRMUtils.rotateVRM0(vrm);
      vrm.scene.traverse(o => { o.frustumCulled = false; });
      this.vrm = vrm;
      this.root = new THREE.Group(); // wrapper so our idle sway doesn't undo rotateVRM0
      this.root.add(vrm.scene);
      this.head = vrm.humanoid.getRawBoneNode('head');
      if (vrm.lookAt) vrm.lookAt.target = this.lookTarget;
      this.scene.add(this.root);
      vrm.update(0);
      const p = new THREE.Vector3();
      this.head.getWorldPosition(p);
      this.height = p.y + 0.18;
      // Work out which way is "up" and "forward" inside the head bone, so accessories sit correctly
      const q = new THREE.Quaternion();
      this.head.getWorldQuaternion(q);
      q.invert();
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      const x = new THREE.Vector3().crossVectors(up, fwd).normalize();
      this.accBasis.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, up, fwd));
      this.face = this.measureFace(vrm);
      ok = true;
    } catch (e) {
      console.info('[character] using placeholder:', e.message);
      this.buildPlaceholder(color);
    }
    this.frameCamera();
    this.attachAccessories();
    return ok;
  }

  /** Finds the eyes on a VRM model, in accessory space, so glasses sit on the face. */
  measureFace(vrm) {
    const l = vrm.humanoid.getRawBoneNode('leftEye');
    const r = vrm.humanoid.getRawBoneNode('rightEye');
    if (!l || !r) return DEFAULT_FACE;
    const toAcc = node => {
      const p = new THREE.Vector3();
      node.getWorldPosition(p);
      this.head.worldToLocal(p);
      return p.applyQuaternion(this.accBasis.clone().invert());
    };
    const a = toAcc(l), b = toAcc(r);
    const eyeX = Math.abs(a.x - b.x) / 2;
    if (!(eyeX > 0.01 && eyeX < 0.1)) return DEFAULT_FACE; // weird rig, keep the defaults
    // eye bones sit inside the eyeball, so push the frames forward to the face surface
    return { eyeX, eyeY: (a.y + b.y) / 2, frontZ: Math.max(a.z, b.z) + 0.035 };
  }

  /** Chibi anime schoolgirl built from simple shapes, shown until a real VRoid .vrm model is added. */
  buildPlaceholder(color) {
    const g = new THREE.Group();
    const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.65, ...extra });
    const skin = mat('#ffe6d8');
    const hairMat = mat(color, { roughness: 0.5 });
    const navy = mat('#27305e');
    const white = mat('#fbfbff');
    const red = mat('#e8344e');
    const mesh = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); return o; };

    // ---- legs, knee socks, shoes ----
    for (const s of [-1, 1]) {
      g.add(mesh(new THREE.CapsuleGeometry(0.042, 0.26, 6, 12), skin, s * 0.065, 0.24));
      g.add(mesh(new THREE.CylinderGeometry(0.047, 0.044, 0.17, 16), navy, s * 0.065, 0.13));
      const shoe = mesh(new THREE.SphereGeometry(0.055, 16, 12), mat('#4a2e2a'), s * 0.065, 0.035, 0.02);
      shoe.scale.set(1, 0.6, 1.5);
      g.add(shoe);
    }
    // ---- pleated skirt (flat shading makes the pleats) ----
    const skirt = mesh(new THREE.CylinderGeometry(0.125, 0.23, 0.17, 14, 1), mat('#27305e', { flatShading: true }), 0, 0.44);
    g.add(skirt);
    // ---- blouse / torso ----
    const torso = mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.26, 20), white, 0, 0.64);
    g.add(torso);
    // sailor collar: navy cape over the shoulders with a white stripe
    const collar = mesh(new THREE.CylinderGeometry(0.075, 0.165, 0.09, 24, 1, true), mat('#27305e', { side: THREE.DoubleSide }), 0, 0.735);
    g.add(collar);
    const stripe = mesh(new THREE.TorusGeometry(0.155, 0.006, 6, 32), white, 0, 0.7);
    stripe.rotation.x = Math.PI / 2;
    g.add(stripe);
    // red ribbon bow on the chest
    const bow = new THREE.Group();
    bow.position.set(0, 0.69, 0.135);
    for (const s of [-1, 1]) {
      const loop = mesh(new THREE.ConeGeometry(0.032, 0.06, 8), red, s * 0.032, 0);
      loop.rotation.z = s * Math.PI / 2;
      bow.add(loop);
      const tail = mesh(new THREE.BoxGeometry(0.022, 0.07, 0.008), red, s * 0.016, -0.045);
      tail.rotation.z = s * 0.25;
      bow.add(tail);
    }
    bow.add(mesh(new THREE.SphereGeometry(0.016, 10, 10), red));
    g.add(bow);
    // neck
    g.add(mesh(new THREE.CylinderGeometry(0.035, 0.04, 0.08, 12), skin, 0, 0.8));
    // ---- arms (pivot at the shoulder so they can swing) ----
    const arms = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.125, 0.74, 0);
      pivot.rotation.z = s * 0.18;
      const sleeve = mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 14), white, 0, -0.04);
      const cuff = mesh(new THREE.TorusGeometry(0.049, 0.007, 6, 18), navy, 0, -0.088);
      cuff.rotation.x = Math.PI / 2;
      const arm = mesh(new THREE.CapsuleGeometry(0.032, 0.17, 6, 12), skin, 0, -0.17);
      pivot.add(sleeve, cuff, arm);
      pivot.userData.side = s;
      arms.push(pivot);
      g.add(pivot);
    }

    // ---- head ----
    const headG = new THREE.Group();
    headG.position.y = 1.08;
    headG.add(mesh(new THREE.SphereGeometry(0.3, 32, 32), skin));
    // hair: back volume, long back hair, bangs, side locks, twin tails
    // ---- hair ----
    // a tapered strand shape (thin at the root, fuller in the middle, pointed tip), hanging down from its origin
    const strand = (len, r) => new THREE.LatheGeometry([
      [0.001, 0], [r * 0.55, -len * 0.06], [r * 0.95, -len * 0.3], [r, -len * 0.5],
      [r * 0.75, -len * 0.75], [r * 0.3, -len * 0.94], [0.001, -len],
    ].map(([x, y]) => new THREE.Vector2(x, y)), 18);
    // shell: covers the whole head except a face-shaped opening at the front
    const shell = mesh(new THREE.SphereGeometry(0.322, 40, 28, Math.PI * 0.75, Math.PI * 1.5, 0, Math.PI * 0.8), hairMat, 0, 0.025, -0.03);
    const crown = mesh(new THREE.SphereGeometry(0.322, 40, 14, 0, Math.PI * 2, 0, Math.PI * 0.36), hairMat, 0, 0.025, -0.03);
    headG.add(shell, crown);
    // bangs: a full fringe of strands across the forehead and temples
    for (let i = -5; i <= 5; i++) {
      const a = i * 0.155;
      const len = 0.2 + (Math.abs(i) >= 4 ? 0.08 : 0) - (i % 2 ? 0.025 : 0); // longer at the temples, uneven tips
      const bang = mesh(strand(len, 0.05), hairMat, Math.sin(a) * 0.285, 0.25, Math.cos(a) * 0.285 - 0.03);
      bang.rotation.order = 'YXZ';
      bang.rotation.y = a;
      bang.rotation.x = -0.32; // lean the tips forward onto the forehead
      bang.rotation.z = -i * 0.035;
      bang.scale.set(1.15, 1, 0.45); // flat locks instead of round tubes
      headG.add(bang);
    }
    // side locks framing the cheeks
    for (const s of [-1, 1]) {
      const lock = mesh(strand(0.36, 0.055), hairMat, s * 0.255, 0.12, 0.1);
      lock.rotation.z = s * 0.08;
      lock.rotation.x = 0.06;
      headG.add(lock);
    }
    // short layered hair at the back of the neck
    for (let i = -3; i <= 3; i++) {
      const a = Math.PI + i * 0.3;
      const nape = mesh(strand(0.3, 0.08), hairMat, Math.sin(a) * 0.25, -0.02, Math.cos(a) * 0.25 - 0.03);
      nape.rotation.order = 'YXZ';
      nape.rotation.y = a;
      nape.rotation.x = -0.12;
      headG.add(nape);
    }
    // twin tails tied high at the back of the head, sweeping out and down
    const tails = [];
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * 0.22, 0.17, -0.17);
      const tie = mesh(new THREE.SphereGeometry(0.035, 14, 14), red);
      tie.scale.set(1, 1, 0.7);
      pivot.add(tie);
      const tail = mesh(strand(0.52, 0.095), hairMat, s * 0.03, 0, -0.01);
      tail.rotation.z = s * 0.3; // flare outward a little
      pivot.add(tail);
      pivot.userData.side = s;
      tails.push(pivot);
      headG.add(pivot);
    }

    // big anime eyes
    const eyes = [];
    const blushes = [];
    for (const s of [-1, 1]) {
      const eyeGeo = new THREE.SphereGeometry(0.06, 20, 20);
      eyeGeo.scale(0.8, 1.25, 1);
      const eye = mesh(eyeGeo, mat('#3b2457', { roughness: 0.3 }), s * 0.11, -0.01, 0.275);
      eye.scale.z = 0.4;
      const iris = mesh(new THREE.SphereGeometry(0.03, 16, 16), mat('#9b6bff', { emissive: '#3b1a80', emissiveIntensity: 0.4 }), 0, -0.022, 0.03);
      iris.scale.set(1.1, 1, 0.5);
      const shine = mesh(new THREE.SphereGeometry(0.017, 10, 10), new THREE.MeshBasicMaterial({ color: 'white' }), 0.018 * -s, 0.03, 0.05);
      const shine2 = mesh(new THREE.SphereGeometry(0.008, 8, 8), new THREE.MeshBasicMaterial({ color: 'white' }), 0.015 * s, -0.035, 0.05);
      eye.add(iris, shine, shine2);
      const lash = mesh(new THREE.BoxGeometry(0.11, 0.012, 0.01), mat('#2a1f3d'), 0, 0.078, 0.02);
      lash.rotation.z = s * -0.12;
      eye.add(lash);
      eyes.push(eye);
      headG.add(eye);
      const blush = mesh(new THREE.CircleGeometry(0.035, 16), new THREE.MeshBasicMaterial({ color: '#ff9fb8', transparent: true, opacity: 0.6 }), s * 0.17, -0.085, 0.252);
      blush.lookAt(s * 0.6, -0.3, 1.5);
      blushes.push(blush);
      headG.add(blush);
    }
    const brows = [];
    for (const s of [-1, 1]) {
      const brow = mesh(new THREE.BoxGeometry(0.07, 0.01, 0.01), mat('#5a3a5e'), s * 0.11, 0.1, 0.285);
      brows.push(brow);
      headG.add(brow);
    }
    const mouth = mesh(new THREE.SphereGeometry(0.03, 16, 16), mat('#c2405a'), 0, -0.135, 0.272);
    mouth.scale.set(1, 0.2, 0.3);
    headG.add(mouth);

    const anchor = new THREE.Group(); // where accessories attach (scaled to the big chibi head)
    anchor.position.set(0, 0.02, 0);
    anchor.scale.setScalar(1.5);
    headG.add(anchor);
    g.add(headG);
    this.ph = { headG, eyes, brows, mouth, body: torso, blushes, arms, tails };
    this.root = g;
    this.head = anchor;
    this.accBasis.identity();
    // eyes are at headG (±0.11, -0.01, 0.275); anchor is at y 0.02 and scaled 1.5x
    this.face = { eyeX: 0.11 / 1.5, eyeY: -0.03 / 1.5, frontZ: 0.33 / 1.5 };
    this.height = 1.45;
    this.scene.add(g);
  }

  setAccessories(ids) {
    this.equipped = ids || [];
    this.attachAccessories();
  }

  attachAccessories() {
    this.accGroup.removeFromParent();
    this.accGroup.clear();
    for (const id of this.equipped) {
      const a = buildAccessory(id, this.face);
      if (a) this.accGroup.add(a);
    }
    this.accGroup.quaternion.copy(this.accBasis);
    if (this.head) this.head.add(this.accGroup);
  }

  /** emotion: happy | angry | sad | surprised | relaxed | neutral */
  setEmotion(emotion, seconds = 4) {
    this.emotion = EMOTIONS.includes(emotion) ? emotion : 'neutral';
    this.emotionUntil = this.clock.elapsedTime + seconds;
  }

  update() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;
    if (t > this.emotionUntil) this.emotion = 'neutral';
    for (const e of EMOTIONS) {
      const target = this.emotion === e ? 1 : 0;
      this.weights[e] += (target - this.weights[e]) * Math.min(1, dt * 6);
    }
    const target = this.getMouthLevel();
    this.mouth += (target - this.mouth) * Math.min(1, dt * 25);

    // blinking
    let blink = 0;
    if (t > this.nextBlink) { this.blinkStart = t; this.nextBlink = t + 2 + Math.random() * 4; }
    if (this.blinkStart > 0 && t - this.blinkStart < 0.15) blink = Math.sin(((t - this.blinkStart) / 0.15) * Math.PI);

    // glide the view when a menu opens/closes or the dressing room zooms
    if (Math.abs(this.shiftTarget - this.shift) > 0.5) { this.shift += (this.shiftTarget - this.shift) * Math.min(1, dt * 7); this.resize(); }
    if (Math.abs(this.zoomTarget - this.zoom) > 0.002) { this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, dt * 5); this.frameCamera(); }
    if (!this.dragRotate) this.spin += (0 - this.spin) * Math.min(1, dt * 5);

    this.updateLook(dt, t);
    const w = this.weights;
    if (this.root) {
      // whole-body motion: happy bounce, surprised hop, angry shake
      this.root.position.y = Math.abs(Math.sin(t * 6)) * 0.04 * w.happy + Math.max(0, Math.sin(t * 9)) * 0.03 * w.surprised;
      this.root.position.x = Math.sin(t * 40) * 0.01 * w.angry;
      this.root.rotation.y = Math.sin(t * 0.5) * 0.06 + this.spin;
      // squish when poked: quick squash and stretch that settles in ~0.6s
      const since = t - this.pokeAt;
      const squish = since < 0.6 ? Math.sin(since * 22) * Math.exp(-since * 7) * 0.12 : 0;
      this.root.scale.set(1 + squish * 0.6, 1 - squish, 1 + squish * 0.6);
    }
    this.blush += ((t < this.blushUntil ? 1 : 0) - this.blush) * Math.min(1, dt * 5);
    this.waveAmt += ((t < this.waveUntil ? 1 : 0) - this.waveAmt) * Math.min(1, dt * 6);
    if (this.vrm) this.poseVRM(t, dt, blink);
    else if (this.ph) this.posePlaceholder(t, blink);

    for (const a of this.accGroup.children) a.traverse(o => { if (o.userData.spin) o.rotation.z = t; });
    this.renderer.render(this.scene, this.camera);
  }

  /** Returns 'head', 'body' or null for a point on screen (normalized device coords). */
  hitTest(ndc) {
    if (!this.root) return null;
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = this.raycaster.intersectObject(this.root, true).find(h => h.object.visible);
    if (!hit) return null;
    const headPos = new THREE.Vector3();
    if (this.head) this.head.getWorldPosition(headPos);
    // VRM head bones sit at the base of the skull; the chibi anchor sits in the middle of its big head
    const headStart = this.vrm ? headPos.y - 0.02 : headPos.y - 0.32;
    return hit.point.y >= headStart ? 'head' : 'body';
  }

  /** Waves hello with her right arm for a few seconds. */
  wave(seconds = 2.5) {
    this.waveUntil = this.clock.elapsedTime + seconds;
  }

  /** Rosy cheeks for a few seconds (chibi placeholder; VRM models use their happy face). */
  setBlush(seconds = 2.5) {
    this.blushUntil = this.clock.elapsedTime + seconds;
  }

  /** Works out where the cursor is in 3D and smoothly turns the head toward it. */
  updateLook(dt, t) {
    const headPos = new THREE.Vector3(0, this.height * 0.85, 0);
    if (this.head) this.head.getWorldPosition(headPos);
    const active = this.followCursor && this.cursor && t - this.lastMouseMove < IDLE_LOOK_BACK;
    const goal = new THREE.Vector3();
    if (active) {
      // Point under the cursor on an imaginary wall a little in front of her face
      this.raycaster.setFromCamera(this.cursor, this.camera);
      const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -(headPos.z + 0.8));
      if (!this.raycaster.ray.intersectPlane(plane, goal)) goal.copy(this.camera.position);
    } else {
      goal.copy(this.camera.position); // look back at the user
    }
    const d = goal.clone().sub(headPos);
    const yaw = THREE.MathUtils.clamp(Math.atan2(d.x, d.z), -MAX_YAW, MAX_YAW);
    const pitch = THREE.MathUtils.clamp(-Math.atan2(d.y, Math.hypot(d.x, d.z)), -MAX_PITCH, MAX_PITCH);
    const k = Math.min(1, dt * (active ? 8 : 2.5)); // snappy when following, lazy when returning
    this.look.yaw += (yaw - this.look.yaw) * k;
    this.look.pitch += (pitch - this.look.pitch) * k;
    this.lookTarget.position.lerp(goal, k);
  }

  poseVRM(t, dt, blink) {
    const w = this.weights;
    const hum = this.vrm.humanoid;
    const b = name => hum.getNormalizedBoneNode(name);
    const set = (name, x, y, z) => { const n = b(name); if (n) n.rotation.set(x, y, z); };

    const breathe = Math.sin(t * 1.6);
    const armDown = 1.32 - w.angry * 0.08 - w.happy * 0.2 + w.sad * 0.1;
    const elbow = 0.25 + w.angry * 0.9 + w.happy * 0.3;
    set('leftUpperArm', 0, 0, -armDown + breathe * 0.02);
    set('rightUpperArm', 0, 0, armDown - breathe * 0.02);
    set('leftLowerArm', 0, -elbow, 0);
    set('rightLowerArm', 0, elbow, 0);
    if (this.waveAmt > 0.01) { // wave: raise the right arm and swing the forearm
      const wv = this.waveAmt;
      set('rightUpperArm', 0, 0, armDown * (1 - wv) - 1.0 * wv);
      set('rightLowerArm', 0, elbow * (1 - wv) + 0.2 * wv, wv * (-0.6 + Math.sin(t * 12) * 0.45));
    }
    const sway = Math.sin(t * 0.35); // slow weight shift from one leg to the other
    set('hips', 0, sway * 0.05, sway * 0.02);
    set('spine', 0.02 * breathe + w.angry * 0.08 + w.sad * 0.1, -sway * 0.03, -sway * 0.02);
    set('chest', 0.015 * breathe, 0, 0);
    const talkNod = this.mouth * 0.06 * Math.sin(t * 7);
    const { yaw, pitch } = this.look; // split the turn between neck (40%) and head (60%) so it looks natural
    set('neck', w.sad * 0.15 + pitch * 0.4, yaw * 0.4, Math.sin(t * 0.8) * 0.03);
    set('head', talkNod + w.sad * 0.15 - w.surprised * 0.1 + pitch * 0.6,
      yaw * 0.6 + Math.sin(t * 25) * 0.05 * w.angry, Math.sin(t * 0.7) * 0.05 + w.happy * 0.1);

    const em = this.vrm.expressionManager;
    if (em) {
      for (const e of EMOTIONS) em.setValue(e, w[e] * (e === 'surprised' ? 0.8 : 1));
      em.setValue('aa', Math.min(1, this.mouth * 1.2));
      em.setValue('blink', w.happy > 0.5 ? 0 : blink);
    }
    this.vrm.update(dt);
  }

  posePlaceholder(t, blink) {
    const { headG, eyes, brows, mouth, arms, tails } = this.ph;
    const w = this.weights;
    // arms: gentle sway, raised when happy, fists down when angry
    for (const a of arms) {
      const sd = a.userData.side;
      a.rotation.z = sd * (0.18 + Math.sin(t * 1.6) * 0.03 + w.happy * (0.9 + Math.sin(t * 10) * 0.15) - w.angry * 0.1);
      a.rotation.x = -w.angry * 0.25 + w.sad * 0.1;
      if (sd === 1 && this.waveAmt > 0.01) { // wave hello: arm up, swinging side to side
        a.rotation.z += (2.6 + Math.sin(t * 12) * 0.35 - a.rotation.z) * this.waveAmt;
        a.rotation.x *= 1 - this.waveAmt;
      }
    }
    // twin tails swing a little, more when she moves
    for (const tl of tails) {
      const sd = tl.userData.side;
      tl.rotation.z = sd * (Math.sin(t * 2.2 + sd) * 0.06 + w.happy * Math.sin(t * 12) * 0.12) - this.look.yaw * 0.25;
      tl.rotation.x = Math.sin(t * 1.7) * 0.04;
    }
    headG.rotation.z = Math.sin(t * 0.7) * 0.05 + w.happy * 0.12;
    headG.rotation.x = this.mouth * 0.08 * Math.sin(t * 7) + w.sad * 0.25 + this.look.pitch * 0.8;
    headG.rotation.y = Math.sin(t * 25) * 0.06 * w.angry + this.look.yaw * 0.8;
    const eyeOpen = Math.max(0.08, 1 - blink - w.happy * 0.7);
    eyes.forEach(e => e.scale.set(1, eyeOpen * (1 + w.surprised * 0.4), 0.4));
    brows.forEach((br, i) => {
      const s = i === 0 ? -1 : 1;
      br.rotation.z = s * (-w.angry * 0.5 + w.sad * 0.4);
      br.position.y = 0.075 + w.surprised * 0.03;
    });
    mouth.scale.set(1 + w.happy * 0.5, 0.2 + this.mouth * 1.6 + w.surprised * 0.6, 0.3);
    for (const b of this.ph.blushes) {
      b.material.opacity = 0.6 + this.blush * 0.35;
      b.material.color.set(this.blush > 0.3 ? '#ff6f9a' : '#ff9fb8');
      b.scale.setScalar(1 + this.blush * 0.7);
    }
  }
}
