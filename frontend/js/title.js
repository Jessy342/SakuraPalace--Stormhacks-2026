// The title screen: a painted sakura valley with drifting petals, the "Sakura Assistant" logo, a short menu and the
// place where you tell the companion your name. It covers the app while everything loads, then blooms away.
const $ = id => document.getElementById(id);
const root = $('title');

// ---------------- falling cherry petals (one small canvas, 30 frames a second) ----------------
const canvas = $('title-petals');
const g = canvas.getContext('2d');
let W = 0, H = 0, running = true, last = 0, wind = 0, time = 0;
const petals = [];
const TINTS = ['#ffd3e2', '#ffb7ce', '#ff9fbf', '#fff0f5'];

function resize() {
  W = canvas.width = Math.round(innerWidth * 0.75); // drawn a little small and stretched: soft, and easy on the graphics chip
  H = canvas.height = Math.round(innerHeight * 0.75);
}

function newPetal(anywhere) {
  const depth = Math.random(); // 0 = far (small, slow), 1 = near (large, fast, soft)
  return {
    x: Math.random() * (W + 300) - 300, y: anywhere ? Math.random() * H : -20, depth,
    size: 4 + depth * 11, vy: 22 + depth * 55, vx: 28 + depth * 50,
    spin: Math.random() * 6.28, spinV: (Math.random() - 0.5) * 3, flip: Math.random() * 6.28, flipV: 1.5 + Math.random() * 2.5,
    sway: Math.random() * 6.28, tint: TINTS[Math.floor(Math.random() * TINTS.length)], burst: null,
  };
}

function drawPetal(p) {
  g.save();
  g.translate(p.x, p.y);
  g.rotate(p.spin);
  g.scale(1, 0.35 + 0.65 * Math.abs(Math.sin(p.flip))); // tumbling: the petal turns edge-on and back
  g.globalAlpha = (p.burst ? Math.min(1, p.burst.life * 1.6) : 1) * (0.55 + p.depth * 0.4);
  g.fillStyle = p.tint;
  const s = p.size;
  g.beginPath();
  g.moveTo(0, -s);
  g.bezierCurveTo(s * 0.9, -s * 0.6, s * 0.7, s * 0.55, s * 0.12, s * 0.8);
  g.lineTo(0, s * 0.6); // the little notch at the tip of a cherry petal
  g.lineTo(-s * 0.12, s * 0.8);
  g.bezierCurveTo(-s * 0.7, s * 0.55, -s * 0.9, -s * 0.6, 0, -s);
  g.fill();
  g.restore();
}

function frame(now) {
  if (!running) return;
  requestAnimationFrame(frame);
  if (now - last < 32) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now; time += dt;
  wind = 0.6 + 0.4 * Math.sin(time * 0.35) + 0.25 * Math.sin(time * 1.1); // gusts
  g.clearRect(0, 0, W, H);
  for (let i = petals.length - 1; i >= 0; i--) {
    const p = petals[i];
    if (p.burst) { // the petals thrown outward when you enter
      p.x += p.burst.vx * dt; p.y += p.burst.vy * dt; p.burst.vy += 60 * dt; p.burst.life -= dt * 0.8;
      if (p.burst.life <= 0) { petals.splice(i, 1); continue; }
    } else {
      p.sway += dt * 1.4;
      p.x += (p.vx * wind + Math.sin(p.sway) * 18) * dt;
      p.y += p.vy * dt;
      if (p.y > H + 20 || p.x > W + 30) Object.assign(p, newPetal(false), p.x > W + 30 ? { x: -20, y: Math.random() * H * 0.7 } : {});
    }
    p.spin += p.spinV * dt; p.flip += p.flipV * dt;
    drawPetal(p);
  }
}

if (root && !root.classList.contains('hidden')) {
  resize();
  addEventListener('resize', resize);
  for (let i = 0; i < 80; i++) petals.push(newPetal(true));
  requestAnimationFrame(frame);
  // the painting leans a little toward the mouse
  root.addEventListener('pointermove', e => {
    root.style.setProperty('--px', ((e.clientX / innerWidth - 0.5) * -18).toFixed(1) + 'px');
    root.style.setProperty('--py', ((e.clientY / innerHeight - 0.5) * -10).toFixed(1) + 'px');
  });
}

function burst() {
  for (let i = 0; i < 150; i++) {
    const a = Math.random() * 6.28, sp = 200 + Math.random() * 700, p = newPetal(true);
    p.x = W * 0.5 + Math.cos(a) * 30; p.y = H * 0.52 + Math.sin(a) * 30; p.depth = 0.5 + Math.random() * 0.5; p.size = 6 + Math.random() * 12;
    p.burst = { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.7 - 80, life: 1 + Math.random() * 0.5 };
    petals.push(p);
  }
}

// ---------------- menu, name login and options (wired once; runTitle() can be called again and again) ----------------
const menu = $('title-menu'), login = $('title-login'), input = $('title-name'), opts = $('title-options');
const items = [...menu.querySelectorAll('button')];
let ctx = null;      // what the current run was started with: { name, saveName, click, options, resolve }
let sel = 0, leaving = false, after = 'start';

const refresh = () => {
  items[0].textContent = ctx.name ? 'Continue' : 'New Game';
  items[1].textContent = ctx.name ? 'Change Name' : 'Enter Name';
  $('title-welcome').textContent = ctx.name ? `Welcome back, ${ctx.name}` : '';
  items.forEach((b, i) => b.classList.toggle('sel', i === sel));
};
const pick = i => { if (i !== sel) ctx.click(); sel = (i + items.length) % items.length; refresh(); };
const panelOpen = () => !login.classList.contains('hidden') || !opts.classList.contains('hidden');
const closePanels = () => { root.classList.remove('asking'); login.classList.add('hidden'); opts.classList.add('hidden'); };

function showLogin(then) {
  after = then;
  root.classList.add('asking');
  login.classList.remove('hidden');
  input.value = ctx.name || '';
  setTimeout(() => input.focus(), 60);
}

function showOptions() { // the title's own options: they never open the app itself
  const now = ctx.options.get();
  opts.querySelectorAll('input[name=t-voice]').forEach(r => { r.checked = r.value === now.voice; });
  $('t-sounds').checked = now.sounds;
  $('t-perf').checked = now.perf;
  root.classList.add('asking');
  opts.classList.remove('hidden');
}

function leave() {
  if (leaving) return;
  leaving = true;
  burst();
  root.classList.add('leaving');
  const done = ctx.resolve;
  setTimeout(done, 620);                                  // the app comes alive behind the flash
  setTimeout(() => { if (leaving) { running = false; root.classList.add('hidden'); } }, 1500);
}

function act(what) {
  ctx.click();
  if (what === 'options') return showOptions();
  if (what === 'name') return showLogin('stay');
  if (!ctx.name) return showLogin('start'); // first visit: ask for the name on the way in
  leave();
}

if (root) {
  login.addEventListener('submit', async e => {
    e.preventDefault();
    const typed = input.value.trim().slice(0, 24);
    if (!typed) { input.focus(); return; }
    ctx.click();
    if (typed !== ctx.name) { try { await ctx.saveName(typed); } catch (err) { console.warn(err); } ctx.name = typed; }
    closePanels(); refresh();
    if (after !== 'stay') leave();
  });
  root.querySelectorAll('[data-back]').forEach(b => b.addEventListener('click', () => { ctx.click(); closePanels(); }));
  opts.addEventListener('change', e => {
    const el = e.target;
    if (el.name === 't-voice') ctx.options.set('voice', el.value);
    else if (el.id === 't-sounds') ctx.options.set('sounds', el.checked);
    else if (el.id === 't-perf') ctx.options.set('perf', el.checked);
  });
  items.forEach((b, i) => {
    b.addEventListener('pointerenter', () => pick(i));
    b.addEventListener('click', () => act(b.dataset.act));
  });
  addEventListener('keydown', e => { // the title owns the keyboard while it is up
    if (!ctx || root.classList.contains('hidden')) return;
    e.stopPropagation();
    if (leaving) return;
    if (panelOpen()) { if (e.key === 'Escape') closePanels(); return; }
    if (e.key === 'ArrowDown' || e.key === 's') { e.preventDefault(); pick(sel + 1); }
    else if (e.key === 'ArrowUp' || e.key === 'w') { e.preventDefault(); pick(sel - 1); }
    else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(items[sel].dataset.act); }
  }, true);
}

/**
 * Shows the title screen (again, if it was left before) and waits until the player enters.
 *  name      the saved player name ('' on a first visit)
 *  saveName  async (name) => stores a new name
 *  click     plays the little menu sound
 *  options   { get() -> { voice: 'dub' | 'sub', sounds, perf }, set(key, value) } for the title's Options menu
 */
export function runTitle({ name, saveName, click = () => {}, options }) {
  return new Promise(resolve => {
    ctx = { name, saveName, click, options, resolve };
    sel = 0; leaving = false;
    closePanels();
    if (root.classList.contains('hidden') || root.classList.contains('leaving')) { // coming back from the lobby
      petals.length = 0;
      for (let i = 0; i < 80; i++) petals.push(newPetal(true));
      root.classList.remove('hidden', 'leaving');
      if (!running) { running = true; last = 0; requestAnimationFrame(frame); }
    }
    refresh();
    root.classList.add('ready'); // the menu fades in once the app has loaded
  });
}

/** Skips the title (used by automated tests: open the app with ?notitle). */
export function skipTitle() {
  running = false;
  root.classList.add('hidden');
}
