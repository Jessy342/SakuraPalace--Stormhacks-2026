// Gacha summon cutscene, in the style of anime gacha games:
// stars gather -> a shooting star falls (its colour gives away the best rarity) -> flash ->
// each notable character appears as a dark silhouette, then is revealed with name, stars and a voice line ->
// summary of every pull.
import { sfx, speak, stopSpeaking } from './voice.js';

export const RARITY_COLORS = {
  Common: '#9aa5b1', Rare: '#4ea8ff', Epic: '#b06bff', Legendary: '#ffb627', Mythic: '#ff3b5c', Unbound: 'rainbow',
};
const ORDER = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Unbound'];
export const STARS = { Common: 2, Rare: 3, Epic: 4, Legendary: 5, Mythic: 6, Unbound: 7 };
export const stars = rarity => '★'.repeat(STARS[rarity] || 1);
/** Picture of a character rendered from their VRoid model (full body, or head-and-shoulders). */
export const portrait = (id, bust = false) => `assets/portraits/${id}${bust ? '_bust' : ''}.webp`;
/** <img> that removes itself if the picture doesn't exist, so the letter behind it shows instead. */
export const portraitImg = (id, bust = false) => `<img src="${portrait(id, bust)}" alt="" draggable="false" onerror="this.parentNode.classList.add('noimg');this.remove()">`;

const el = id => document.getElementById(id);
const sleep = ms => new Promise(r => setTimeout(r, ms));

let skipping = false;

export async function playCutscene(results, bestRarity) {
  const overlay = el('cutscene');
  const content = el('cut-content');
  const canvas = el('cut-canvas');
  overlay.classList.remove('hidden');
  content.innerHTML = '';
  skipping = false;
  el('cut-skip').onclick = e => { e.stopPropagation(); skipping = true; stopSpeaking(); };

  const anim = startSky(canvas, bestRarity);
  sfx('gacha_charge');
  await wait(1500);
  anim.launchMeteor();
  sfx('gacha_meteor');
  await wait(1500);

  // flash + reveal sound
  const flash = document.createElement('div');
  flash.className = 'flash';
  if (bestRarity === 'Unbound') flash.style.background = 'linear-gradient(135deg,#ff5f6d,#ffc371,#47e5bc,#6a82fb,#fc5c7d)';
  overlay.appendChild(flash);
  setTimeout(() => flash.remove(), 1000);
  const rank = ORDER.indexOf(bestRarity);
  sfx(rank >= 5 ? 'reveal_unbound' : rank >= 3 ? 'reveal_gold' : rank >= 2 ? 'reveal_epic' : 'reveal_common');
  if (rank >= 4) { overlay.classList.add('cut-shake'); setTimeout(() => overlay.classList.remove('cut-shake'), 1300); }
  anim.burst();

  // One reveal per notable result: always for a single pull; in a 10-pull, new characters and Legendary+
  const reveals = results.length === 1 ? results : results.filter(r => r.type === 'character' && (r.new || ORDER.indexOf(r.rarity) >= 3));
  for (const r of reveals) {
    if (skipping) break;
    content.innerHTML = '';
    content.appendChild(splash(r));
    if (r.type === 'character' && r.new && r.intro_line) {
      setTimeout(() => { if (!skipping && content.isConnected) speak(r.intro_line, { characterId: r.id }); }, 1300);
    }
    await clickToContinue(overlay, 1400);
    stopSpeaking();
  }

  // Summary of everything pulled
  if (results.length > 1) {
    skipping = false;
    content.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'pull-grid';
    content.appendChild(grid);
    for (const r of results) {
      grid.appendChild(card(r));
      await sleep(90);
    }
    const hint = document.createElement('div');
    hint.className = 'pull-hint';
    hint.textContent = 'Click to continue';
    content.appendChild(hint);
    await clickToContinue(overlay, 300);
  }

  anim.stop();
  overlay.classList.add('hidden');
  content.innerHTML = '';
}

function wait(ms) {
  return new Promise(resolve => {
    const start = performance.now();
    const check = () => (skipping || performance.now() - start >= ms) ? resolve() : requestAnimationFrame(check);
    check();
  });
}

function clickToContinue(overlay, delay = 250) {
  return new Promise(resolve => {
    let finished = false;
    const done = () => { if (finished) return; finished = true; overlay.removeEventListener('click', done); removeEventListener('keydown', key); resolve(); };
    const key = e => { if (e.key === ' ' || e.key === 'Enter') done(); };
    setTimeout(() => { overlay.addEventListener('click', done); addEventListener('keydown', key); }, delay);
    const poll = () => { if (finished) return; if (skipping) done(); else requestAnimationFrame(poll); };
    poll();
  });
}

function rarityClass(r) { return 'r-' + r.rarity; }

function card(r) {
  const c = document.createElement('div');
  c.className = 'pull-card ' + rarityClass(r) + (r.type === 'character' ? ' char' : '');
  c.innerHTML = `
    ${r.new ? '<span class="new">NEW</span>' : ''}
    <div class="big-initial ${r.rarity === 'Unbound' ? 'rainbow-text' : ''}">${r.type === 'character' ? r.name[0] : '◆'}</div>
    ${r.type === 'character' ? portraitImg(r.id, true) : ''}
    <div><b>${r.name}</b></div>
    <div class="stars">${stars(r.rarity)}</div>
    <small>${r.refund ? '+' + r.refund + ' ◆' : ''}${r.bond ? ' · Bond ' + r.bond : ''}&nbsp;</small>`;
  return c;
}

function splash(r) {
  const s = document.createElement('div');
  s.className = 'splash ' + rarityClass(r) + (r.type === 'item' ? ' item' : '');
  const rb = r.rarity === 'Unbound' ? 'rainbow-text' : '';
  const starRow = [...stars(r.rarity)].map((x, i) => `<span style="animation-delay:${1.1 + i * 0.12}s">${x}</span>`).join('');
  if (r.type === 'item') {
    s.innerHTML = `<div class="rays"></div><div class="info"><div class="rarity">${r.rarity.toUpperCase()}</div><div class="name ${rb}">${r.name}</div>
      <div class="title">+${r.refund} ◆ points</div><div class="hint" style="margin-top:30px">Click to continue</div></div>`;
  } else {
    s.innerHTML = `<div class="rays"></div>
      <div class="figure"><div class="initial">${r.name[0]}</div>${portraitImg(r.id)}</div>
      <div class="info">
        ${r.new ? '<div class="newtag">NEW</div>' : ''}
        <div class="rarity ${rb}">${r.rarity.toUpperCase()}</div>
        <div class="name ${rb}">${r.name}</div>
        <div class="title">${r.title || ''}</div>
        <div class="stars">${starRow}</div>
        <div class="line">${r.new ? `“${r.intro_line || ''}”` : `Already with you. Bond ${r.bond} · +${r.refund} ◆ points`}</div>
        <div class="hint">Click to continue</div>
      </div>`;
  }
  return s;
}

// ---------------- Canvas sky animation ----------------
function startSky(canvas, rarity) {
  const ctx = canvas.getContext('2d');
  let w, h;
  const resize = () => { w = canvas.width = innerWidth; h = canvas.height = innerHeight; };
  resize();
  const stars = Array.from({ length: 260 }, () => ({ x: Math.random(), y: Math.random(), r: Math.random() * 1.6 + 0.2, s: Math.random() }));
  const particles = [];
  let meteor = null;
  let running = true;
  let glow = 0;
  const t0 = performance.now();
  const hue = t => (t / 8) % 360;
  const colorFor = (t) => RARITY_COLORS[rarity] === 'rainbow' ? `hsl(${hue(t)},90%,65%)` : RARITY_COLORS[rarity];

  function frame(now) {
    if (!running) return;
    const t = now - t0;
    ctx.fillStyle = 'rgba(5,3,15,0.35)';
    ctx.fillRect(0, 0, w, h);
    // twinkling stars drifting toward the center (charge-up)
    for (const s of stars) {
      const pull = Math.min(1, t / 1500) * 0.002;
      s.x += (0.5 - s.x) * pull; s.y += (0.5 - s.y) * pull;
      ctx.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(now / 400 + s.s * 10));
      ctx.fillStyle = 'white';
      ctx.beginPath(); ctx.arc(s.x * w, s.y * h, s.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // central glow
    glow = Math.min(1, glow + 0.01);
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, 220 * glow);
    g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // meteor
    if (meteor) {
      meteor.p = Math.min(1, meteor.p + 0.018);
      const e = 1 - Math.pow(1 - meteor.p, 3);
      const x = -100 + (w / 2 + 100) * e, y = -100 + (h / 2 + 100) * e;
      const col = colorFor(now);
      for (let i = 0; i < 4; i++) particles.push({ x, y, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, life: 1, col });
      ctx.shadowBlur = 40; ctx.shadowColor = col; ctx.fillStyle = 'white';
      ctx.beginPath(); ctx.arc(x, y, 10, 0, 7); ctx.fill(); ctx.shadowBlur = 0;
    }
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx; p.y += p.vy; p.life -= 0.015;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = p.life; ctx.fillStyle = p.col;
      ctx.beginPath(); ctx.arc(p.x, p.y, 3 * p.life + 1, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  addEventListener('resize', resize);
  return {
    launchMeteor() { meteor = { p: 0 }; },
    burst() {
      meteor = null;
      const n = rarity === 'Unbound' ? 500 : 250;
      for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, sp = Math.random() * 12 + 2;
        particles.push({ x: w / 2, y: h / 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.4, col: colorFor(performance.now() + i * 40) });
      }
    },
    stop() { running = false; removeEventListener('resize', resize); ctx.clearRect(0, 0, w, h); },
  };
}
