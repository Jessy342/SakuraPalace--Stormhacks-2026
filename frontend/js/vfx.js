// Visual effects drawn over the whole interface: click sparkles, reward bursts, confetti, lotuses flying to your
// points counter, and the level-up celebration. The canvas only animates while something is on screen.
const TAU = Math.PI * 2;
let canvas, g, running = false;
const bits = []; // { x, y, vx, vy, life, decay, size, color, shape, spin, rot, gravity }

function setup() {
  if (canvas) return;
  canvas = document.getElementById('fx');
  g = canvas.getContext('2d');
  const resize = () => { canvas.width = innerWidth; canvas.height = innerHeight; };
  resize();
  addEventListener('resize', resize);
}

function loop() {
  if (!bits.length) { running = false; g.clearRect(0, 0, canvas.width, canvas.height); return; }
  requestAnimationFrame(loop);
  g.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = bits.length - 1; i >= 0; i--) {
    const b = bits[i];
    b.x += b.vx; b.y += b.vy; b.vy += b.gravity; b.vx *= 0.985; b.rot += b.spin; b.life -= b.decay;
    if (b.life <= 0) { bits.splice(i, 1); continue; }
    g.globalAlpha = Math.min(1, b.life);
    g.fillStyle = g.strokeStyle = b.color;
    const s = b.size * (b.shape === 'ring' ? 1 + (1 - b.life) * 5 : Math.min(1, b.life + 0.3));
    if (b.shape === 'ring') { g.lineWidth = 2 * b.life + 0.5; g.beginPath(); g.arc(b.x, b.y, s, 0, TAU); g.stroke(); }
    else if (b.shape === 'star') { // a four-point glint
      g.save(); g.translate(b.x, b.y); g.rotate(b.rot); g.beginPath();
      for (let k = 0; k < 8; k++) { const a = k * TAU / 8, r = k % 2 ? s * 0.32 : s; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      g.fill(); g.restore();
    } else if (b.shape === 'paper') { g.save(); g.translate(b.x, b.y); g.rotate(b.rot); g.fillRect(-s, -s * 0.5 * Math.abs(Math.cos(b.rot * 2)), s * 2, s * Math.abs(Math.cos(b.rot * 2)) + 1); g.restore(); }
    else { g.beginPath(); g.arc(b.x, b.y, s, 0, TAU); g.fill(); }
  }
  g.globalAlpha = 1;
}

function add(b) {
  setup();
  if (bits.length > 900) return;
  bits.push({ vx: 0, vy: 0, life: 1, decay: 0.03, size: 3, color: '#fff', shape: 'dot', spin: 0, rot: 0, gravity: 0, ...b });
  if (!running) { running = true; requestAnimationFrame(loop); }
}

/** A small sparkle where you clicked. */
export function clickSpark(x, y) {
  add({ x, y, shape: 'ring', size: 5, color: '#fff3cf', decay: 0.07 });
  for (let i = 0; i < 6; i++) { const a = Math.random() * TAU, sp = 1.5 + Math.random() * 2.5; add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, shape: 'star', size: 3 + Math.random() * 3, color: i % 2 ? '#ffd27a' : '#ff8fc4', decay: 0.05, spin: 0.2 }); }
}

/** A burst of glints and dots: rewards, purchases, finishing a quest. */
export function burst(x, y, color = '#ffd27a', n = 40) {
  add({ x, y, shape: 'ring', size: 10, color, decay: 0.035 });
  add({ x, y, shape: 'ring', size: 4, color: '#fff', decay: 0.05 });
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, sp = 2 + Math.random() * 7;
    add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1.5, gravity: 0.12, shape: i % 3 ? 'star' : 'dot', size: 2 + Math.random() * 5, color: i % 4 === 0 ? '#fff' : color, decay: 0.014 + Math.random() * 0.02, spin: 0.25 });
  }
}

/** Paper confetti raining from the top of the screen. */
export function confetti(n = 140) {
  setup();
  const colors = ['#ff5fae', '#ffd15c', '#4fdcff', '#b693ff', '#5fe6ad', '#fff'];
  for (let i = 0; i < n; i++) add({ x: Math.random() * canvas.width, y: -20 - Math.random() * canvas.height * 0.4, vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4, gravity: 0.03, shape: 'paper', size: 4 + Math.random() * 4, color: colors[i % colors.length], decay: 0.004 + Math.random() * 0.004, spin: 0.1 + Math.random() * 0.2, rot: Math.random() * TAU });
}

const centre = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
/** Where an element (or the middle of the screen) is, for aiming effects. */
export const at = el => (el ? centre(el) : [innerWidth / 2, innerHeight / 2]);

/** Little copies of `html` (e.g. the lotus) fly from a point to an element, which pops when they arrive. */
export function flyTo(fromX, fromY, target, html, count = 8) {
  if (!target) return;
  const [tx, ty] = centre(target);
  for (let i = 0; i < count; i++) {
    const el = document.createElement('div');
    el.className = 'fly';
    el.innerHTML = html;
    document.body.appendChild(el);
    const sx = fromX + (Math.random() - 0.5) * 120, sy = fromY + (Math.random() - 0.5) * 80;
    const anim = el.animate([
      { transform: `translate(${fromX}px, ${fromY}px) scale(.3)`, opacity: 0 },
      { transform: `translate(${sx}px, ${sy}px) scale(1.25)`, opacity: 1, offset: 0.3 },
      { transform: `translate(${tx}px, ${ty}px) scale(.5)`, opacity: 0.9 },
    ], { duration: 850 + i * 70, easing: 'cubic-bezier(.5,0,.3,1)', delay: i * 45 });
    anim.onfinish = () => { el.remove(); if (i === count - 1) { target.classList.remove('pop'); void target.offsetWidth; target.classList.add('pop'); burst(tx, ty, '#ff8fc4', 14); } };
  }
}

/** The level-up celebration: rays, big text, confetti. */
export function levelUp(level) {
  const el = document.getElementById('levelup');
  el.querySelector('.lu-num').textContent = 'Lv ' + level;
  el.classList.remove('hidden', 'go');
  void el.offsetWidth;
  el.classList.add('go');
  confetti();
  burst(innerWidth / 2, innerHeight * 0.42, '#ffd27a', 90);
  clearTimeout(levelUp.timer);
  levelUp.timer = setTimeout(() => el.classList.add('hidden'), 3000);
}
