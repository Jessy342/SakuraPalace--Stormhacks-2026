// The 3D anime character: loads a VRoid .vrm model (or a cute placeholder if none exists yet),
// plays idle/emotion animations procedurally, blinks, lip-syncs and wears accessories.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { buildAccessory } from './accessories.js';

const EMOTIONS = ['happy', 'angry', 'sad', 'surprised', 'relaxed'];
const PANEL_SPACE = 460; // pixels covered by the right panel; the character is centered in the rest

export class Character {
  constructor(canvas, getMouthLevel) {
    this.getMouthLevel = getMouthLevel || (() => 0);
    this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 50);

    this.scene.add(new THREE.AmbientLight(0xffffff, 1.6));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
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

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.update());
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Shift the view so the character is centered in the space left of the panel
    const p = Math.min(PANEL_SPACE, w * 0.4);
    this.camera.setViewOffset(w + p, h, p, 0, w, h);
    this.camera.updateProjectionMatrix();
  }

  frameCamera() {
    const h = this.height;
    const dist = (h * 1.4) / (2 * Math.tan(THREE.MathUtils.degToRad(15)));
    this.camera.position.set(0, h * 0.58, dist);
    this.camera.lookAt(0, h * 0.56, 0);
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
      if (vrm.lookAt) vrm.lookAt.target = this.camera;
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
      ok = true;
    } catch (e) {
      console.info('[character] using placeholder:', e.message);
      this.buildPlaceholder(color);
    }
    this.frameCamera();
    this.attachAccessories();
    return ok;
  }

  buildPlaceholder(color) {
    const g = new THREE.Group();
    const mat = c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6 });
    const skin = mat('#ffe3d3');
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.45, 8, 16), mat(color));
    body.position.y = 0.55;
    const legs = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.3, 8, 16), mat('#3b2a4a'));
    legs.position.y = 0.2;
    const headG = new THREE.Group();
    headG.position.y = 1.08;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.3, 32, 32), skin);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.32, 32, 32, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(color));
    hair.position.set(0, 0.03, -0.02);
    const eyes = [];
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045, 16, 16), mat('#2a1f3d'));
      eye.position.set(s * 0.1, 0.0, 0.27);
      eye.scale.z = 0.4;
      const shine = new THREE.Mesh(new THREE.SphereGeometry(0.014), new THREE.MeshBasicMaterial({ color: 'white' }));
      shine.position.set(0.015, 0.015, 0.03);
      eye.add(shine);
      eyes.push(eye);
      headG.add(eye);
      const blush = new THREE.Mesh(new THREE.CircleGeometry(0.035, 16), new THREE.MeshBasicMaterial({ color: '#ff9fb8', transparent: true, opacity: 0.6 }));
      blush.position.set(s * 0.16, -0.07, 0.255);
      headG.add(blush);
    }
    const brows = [];
    for (const s of [-1, 1]) {
      const brow = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.012, 0.01), mat('#2a1f3d'));
      brow.position.set(s * 0.1, 0.075, 0.275);
      brows.push(brow);
      headG.add(brow);
    }
    const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.035, 16, 16), mat('#a8324a'));
    mouth.position.set(0, -0.12, 0.27);
    mouth.scale.set(1, 0.2, 0.3);
    headG.add(head, hair, mouth);
    const anchor = new THREE.Group(); // where accessories attach (scaled to the big chibi head)
    anchor.position.set(0, 0.02, 0);
    anchor.scale.setScalar(1.5);
    headG.add(anchor);
    g.add(body, legs, headG);
    this.ph = { headG, eyes, brows, mouth, body };
    this.root = g;
    this.head = anchor;
    this.accBasis.identity();
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
      const a = buildAccessory(id);
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

    const w = this.weights;
    if (this.root) {
      // whole-body motion: happy bounce, surprised hop, angry shake
      this.root.position.y = Math.abs(Math.sin(t * 6)) * 0.04 * w.happy + Math.max(0, Math.sin(t * 9)) * 0.03 * w.surprised;
      this.root.position.x = Math.sin(t * 40) * 0.01 * w.angry;
      this.root.rotation.y = Math.sin(t * 0.5) * 0.06;
    }
    if (this.vrm) this.poseVRM(t, dt, blink);
    else if (this.ph) this.posePlaceholder(t, blink);

    for (const a of this.accGroup.children) a.traverse(o => { if (o.userData.spin) o.rotation.z = t; });
    this.renderer.render(this.scene, this.camera);
  }

  poseVRM(t, dt, blink) {
    const w = this.weights;
    const hum = this.vrm.humanoid;
    const b = name => hum.getNormalizedBoneNode(name);
    const set = (name, x, y, z) => { const n = b(name); if (n) n.rotation.set(x, y, z); };

    const breathe = Math.sin(t * 1.6);
    const armDown = 1.2 - w.angry * 0.08 - w.happy * 0.2 + w.sad * 0.1;
    const elbow = 0.25 + w.angry * 0.9 + w.happy * 0.3;
    set('leftUpperArm', 0, 0, -armDown + breathe * 0.02);
    set('rightUpperArm', 0, 0, armDown - breathe * 0.02);
    set('leftLowerArm', 0, -elbow, 0);
    set('rightLowerArm', 0, elbow, 0);
    set('spine', 0.02 * breathe + w.angry * 0.08 + w.sad * 0.1, 0, 0);
    set('chest', 0.015 * breathe, 0, 0);
    const talkNod = this.mouth * 0.06 * Math.sin(t * 7);
    set('neck', w.sad * 0.15, 0, Math.sin(t * 0.8) * 0.03);
    set('head', talkNod + w.sad * 0.15 - w.surprised * 0.1, Math.sin(t * 25) * 0.05 * w.angry, Math.sin(t * 0.7) * 0.05 + w.happy * 0.1);

    const em = this.vrm.expressionManager;
    if (em) {
      for (const e of EMOTIONS) em.setValue(e, w[e] * (e === 'surprised' ? 0.8 : 1));
      em.setValue('aa', Math.min(1, this.mouth * 1.2));
      em.setValue('blink', w.happy > 0.5 ? 0 : blink);
    }
    this.vrm.update(dt);
  }

  posePlaceholder(t, blink) {
    const { headG, eyes, brows, mouth } = this.ph;
    const w = this.weights;
    headG.rotation.z = Math.sin(t * 0.7) * 0.05 + w.happy * 0.12;
    headG.rotation.x = this.mouth * 0.08 * Math.sin(t * 7) + w.sad * 0.25;
    headG.rotation.y = Math.sin(t * 25) * 0.06 * w.angry;
    const eyeOpen = Math.max(0.08, 1 - blink - w.happy * 0.7);
    eyes.forEach(e => e.scale.set(1, eyeOpen * (1 + w.surprised * 0.4), 0.4));
    brows.forEach((br, i) => {
      const s = i === 0 ? -1 : 1;
      br.rotation.z = s * (-w.angry * 0.5 + w.sad * 0.4);
      br.position.y = 0.075 + w.surprised * 0.03;
    });
    mouth.scale.set(1 + w.happy * 0.5, 0.2 + this.mouth * 1.6 + w.surprised * 0.6, 0.3);
  }
}
