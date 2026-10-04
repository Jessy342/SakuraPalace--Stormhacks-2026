// Dev tool (not part of the app): renders the character portraits used by the menus and the gacha cutscene.
// Run it again whenever a VRoid model is added or changed in models/:
//   1. start the app (start.bat)   2. in an empty temp folder: npm install puppeteer-core
//   3. node <path to>/tools/make_portraits.mjs <path to>/frontend/assets/portraits   (needs Google Chrome installed)
import puppeteer from 'puppeteer-core';
import fs from 'fs';
const OUT = process.argv[2];
const BASE = 'http://127.0.0.1:8765';
const HTML = `<!doctype html><html><head><script type="importmap">{"imports":{"three":"/vendor/three/three.module.min.js","three/addons/":"/vendor/three/","@pixiv/three-vrm":"/vendor/three-vrm.module.min.js"}}</script></head><body>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';
window.renderPortraits = async (url) => {
  const loader = new GLTFLoader(); loader.register(p => new VRMLoaderPlugin(p));
  const gltf = await loader.loadAsync(url); const vrm = gltf.userData.vrm;
  VRMUtils.rotateVRM0(vrm); vrm.scene.traverse(o => { o.frustumCulled = false; });
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 2.3); key.position.set(1, 2, 3); scene.add(key);
  const root = new THREE.Group(); root.add(vrm.scene); scene.add(root);
  const b = n => vrm.humanoid.getNormalizedBoneNode(n);
  const set = (n, x, y, z) => { const o = b(n); if (o) o.rotation.set(x, y, z); };
  set('leftUpperArm', 0, 0, -1.3); set('rightUpperArm', 0, 0, 1.3);
  set('leftLowerArm', 0, -0.3, 0); set('rightLowerArm', 0, 0.3, 0);
  set('head', 0, 0, 0.04);
  if (vrm.expressionManager) vrm.expressionManager.setValue('relaxed', 0.35);
  for (let i = 0; i < 90; i++) vrm.update(1 / 60);
  const hp = new THREE.Vector3(); vrm.humanoid.getRawBoneNode('head').getWorldPosition(hp);
  const H = hp.y + 0.2;
  const shot = (w, h, yaw, cy, span) => {
    const r = new THREE.WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
    r.setSize(w, h); r.outputColorSpace = THREE.SRGBColorSpace; r.setClearColor(0, 0);
    const cam = new THREE.PerspectiveCamera(24, w / h, 0.1, 50);
    const dist = span / (2 * Math.tan(THREE.MathUtils.degToRad(12)));
    root.rotation.y = yaw; cam.position.set(0, cy, dist); cam.lookAt(0, cy, 0);
    r.render(scene, cam);
    const data = r.domElement.toDataURL('image/webp', 0.9); r.dispose(); return data;
  };
  return { full: shot(800, 1280, 0.22, H * 0.5, H * 1.08), bust: shot(560, 700, 0.12, hp.y - 0.02, 0.62) };
};
window.ready = true;
</script></body></html>`;
const browser = await puppeteer.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: 'new',
  args: ['--enable-unsafe-swiftshader', '--use-angle=swiftshader', '--ignore-gpu-blocklist', '--enable-webgl'] });
const page = await browser.newPage();
page.on('console', m => console.log('[page]', m.text()));
page.on('pageerror', e => console.log('[pageerror]', e.message));
await page.setRequestInterception(true);
page.on('request', r => r.url().endsWith('/__portrait.html') ? r.respond({ contentType: 'text/html', body: HTML }) : r.continue());
await page.goto(BASE + '/__portrait.html');
await page.waitForFunction('window.ready', { timeout: 30000 });
const state = await (await fetch(BASE + '/api/state')).json();
fs.mkdirSync(OUT, { recursive: true });
for (const c of state.catalog.characters) {
  const url = `/models/${c.model}`;
  if (!(await fetch(BASE + url, { method: 'HEAD' })).ok) { console.log('skip (no model):', c.id, c.model); continue; }
  try {
    const res = await page.evaluate(u => window.renderPortraits(u), url);
    for (const k of ['full', 'bust']) fs.writeFileSync(`${OUT}/${c.id}${k === 'bust' ? '_bust' : ''}.webp`, Buffer.from(res[k].split(',')[1], 'base64'));
    console.log('ok', c.id);
  } catch (e) { console.log('FAILED', c.id, e.message); }
}
await browser.close();
