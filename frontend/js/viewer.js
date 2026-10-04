// A small 3D viewer for the Characters screen: shows the picked character's model standing idle,
// and lets you turn them around by dragging.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
import { REST, DEFAULT, blend, writePose } from './poses.js';

export class ModelViewer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'viewer';
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.scene = new THREE.Scene();
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.95));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(1, 2, 3);
    this.scene.add(key);
    this.camera = new THREE.PerspectiveCamera(24, 1, 0.1, 50);
    this.clock = new THREE.Clock();
    this.id = null;     // which character is (being) shown
    this.vrm = null;
    this.yaw = 0;
    this.turn = 0;      // goes up with every request, so a slow load never replaces a newer pick
    // drag to rotate
    let last = null;
    this.canvas.addEventListener('pointerdown', e => { last = e.clientX; this.canvas.setPointerCapture(e.pointerId); this.canvas.classList.add('dragging'); });
    this.canvas.addEventListener('pointermove', e => { if (last === null) return; this.yaw += (e.clientX - last) * 0.014; last = e.clientX; });
    const end = () => { last = null; this.canvas.classList.remove('dragging'); };
    this.canvas.addEventListener('pointerup', end);
    this.canvas.addEventListener('pointercancel', end);
  }

  /** Shows character `id` (model at `url`) inside `holder`. The holder gets the class "live" once the model is ready. */
  async show(holder, id, url, personality) {
    holder.appendChild(this.canvas);
    this.holder = holder;
    this.fit();
    if (id === this.id) { if (this.vrm) holder.classList.add('live'); return; } // same character: just re-attach
    const turn = ++this.turn;
    this.clearModel();
    this.id = id;
    try {
      const loader = new GLTFLoader();
      loader.register(parser => new VRMLoaderPlugin(parser));
      const gltf = await loader.loadAsync(url);
      const vrm = gltf.userData.vrm;
      if (turn !== this.turn) { VRMUtils.deepDispose(vrm.scene); return; }
      VRMUtils.rotateVRM0(vrm);
      vrm.scene.traverse(o => { o.frustumCulled = false; });
      this.vrm = vrm;
      this.personality = personality;
      this.root = new THREE.Group();
      this.root.add(vrm.scene);
      this.scene.add(this.root);
      this.yaw = -0.25;
      vrm.update(0);
      const head = vrm.humanoid.getRawBoneNode('head').getWorldPosition(new THREE.Vector3());
      const H = head.y + 0.18, span = H * 0.66; // from the knees to just above the head
      this.camera.position.set(0, H * 0.7, span / (2 * Math.tan(THREE.MathUtils.degToRad(12))));
      this.camera.lookAt(0, H * 0.7, 0);
      this.nextBlink = 2; this.blinkStart = -1;
      this.holder.classList.add('live');
      this.renderer.setAnimationLoop(() => this.frame());
    } catch (e) { console.warn('[viewer] model not available:', e.message); }
  }

  fit() {
    const w = this.holder.clientWidth || 300, h = this.holder.clientHeight || 300;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  frame() {
    const now = performance.now();
    if (now - (this.last || 0) < 15) return; // 60 frames a second is plenty
    this.last = now;
    if (!this.vrm || !this.canvas.isConnected) return;
    const dt = Math.min(this.clock.getDelta(), 0.1), t = this.clock.elapsedTime;
    const pose = blend(DEFAULT, REST[this.personality] || DEFAULT, 1);
    const breathe = Math.sin(t * 1.6), sway = Math.sin(t * 0.4);
    pose.spine[0] += breathe * 0.02; pose.chest[0] += breathe * 0.015; pose.hips[2] += sway * 0.02; pose.spine[2] -= sway * 0.02;
    pose.head[1] += Math.sin(t * 0.6) * 0.05; pose.head[2] += Math.sin(t * 0.7) * 0.03;
    writePose(this.vrm, pose);
    const em = this.vrm.expressionManager;
    if (em) {
      if (t > this.nextBlink) { this.blinkStart = t; this.nextBlink = t + 2 + Math.random() * 4; }
      em.setValue('blink', this.blinkStart > 0 && t - this.blinkStart < 0.15 ? Math.sin(((t - this.blinkStart) / 0.15) * Math.PI) : 0);
      em.setValue('relaxed', 0.3);
    }
    this.root.rotation.y = this.yaw;
    this.vrm.update(dt);
    this.renderer.render(this.scene, this.camera);
  }

  clearModel() {
    this.renderer.setAnimationLoop(null);
    if (this.root) this.scene.remove(this.root);
    if (this.vrm) VRMUtils.deepDispose(this.vrm.scene);
    this.vrm = this.root = null;
  }

  /** Called when the Characters screen closes: frees the model. */
  stop() {
    this.turn++;
    this.clearModel();
    this.id = null;
    this.canvas.remove();
  }
}
