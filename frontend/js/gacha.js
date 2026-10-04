// Gacha summon cutscene, in the style of anime gacha games. The show, in order:
//   1. GATE      a summoning circle spins up while the stars stretch into warp streaks
//   2. TEASE     the gate climbs through the rarity colours, stopping at the best thing you pulled
//   3. STARFALL  one shooting star per pull crashes into the gate, each in its own rarity colour
//   4. ERUPTION  flash, shockwaves, screen shake and a pillar of light
//   5. REVEAL    each notable character rises as a dark silhouette, then bursts into colour with name, stars and voice
//   6. SUMMARY   every pull as a card
import { sfx, speak, stopSpeaking, riser, impact, chime } from './voice.js';

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
const rank = rarity => ORDER.indexOf(rarity);
/** Colour of a rarity right now (Unbound cycles through the rainbow). */
const colorOf = (rarity, now = performance.now()) => RARITY_COLORS[rarity] === 'rainbow' ? `hsl(${(now / 6) % 360},95%,66%)` : RARITY_COLORS[rarity];

let skipping = false;

export async function playCutscene(results, bestRarity, { japanese = false } = {}) {
  const overlay = el('cutscene');
  const content = el('cut-content');
  overlay.classList.remove('hidden');
  content.innerHTML = '';
  skipping = false;
  el('cut-skip').onclick = e => { e.stopPropagation(); skipping = true; stopSpeaking(); };
  const top = rank(bestRarity);
  const shake = (cls = 'cut-shake') => { overlay.classList.remove('cut-shake', 'cut-quake'); void overlay.offsetWidth; overlay.classList.add(cls); };

  // 1. GATE
  const show = startShow(el('cut-canvas'));
  sfx('gacha_charge');
  if (!skipping) riser(2.6);
  await wait(1100);

  // 2. TEASE: blue... purple... gold?! Each step up is a pulse and a higher chime.
  for (let i = 1; i <= top && !skipping; i++) {
    show.setRarity(ORDER[i]);
    chime(i);
    if (i >= 3) { impact(0.2 + i * 0.1); shake(); }
    await wait(i === top ? 520 : 300);
  }
  if (top === 0) await wait(500);

  // 3. STARFALL
  sfx('gacha_meteor');
  const fallTime = show.starfall(results.map(r => r.rarity), n => { if (!skipping) chime(rank(results[n].rarity), 0.07); });
  await wait(fallTime);

  // 4. ERUPTION
  const flash = document.createElement('div');
  flash.className = 'flash';
  if (bestRarity === 'Unbound') flash.style.background = 'linear-gradient(135deg,#ff5f6d,#ffc371,#47e5bc,#6a82fb,#fc5c7d)';
  overlay.appendChild(flash);
  setTimeout(() => flash.remove(), 1000);
  sfx(top >= 5 ? 'reveal_unbound' : top >= 3 ? 'reveal_gold' : top >= 2 ? 'reveal_epic' : 'reveal_common');
  if (!skipping) impact(0.5 + top * 0.1);
  shake(top >= 3 ? 'cut-quake' : 'cut-shake');
  show.erupt();
  await wait(top >= 3 ? 1100 : 700);

  // 5. REVEAL: always for a single pull; in a 10-pull, new characters and anything Legendary or better
  const reveals = results.length === 1 ? results : results.filter(r => r.type === 'character' && (r.new || rank(r.rarity) >= 3));
  for (const r of reveals) {
    if (skipping) break;
    content.innerHTML = '';
    show.setRarity(r.rarity);
    if (r.type === 'character' && rank(r.rarity) >= 4) { // the rarest get their rarity slammed on screen first
      const slam = document.createElement('div');
      slam.className = 'slam r-' + r.rarity + (r.rarity === 'Unbound' ? ' rainbow-text' : '');
      slam.textContent = r.rarity.toUpperCase();
      content.appendChild(slam);
      impact(0.9); shake('cut-quake');
      await wait(1000);
      content.innerHTML = '';
    }
    content.appendChild(splash(r));
    show.erupt(0.6);
    if (r.type === 'character') {
      const n = STARS[r.rarity];
      setTimeout(() => { if (!skipping && content.isConnected) { impact(0.35 + rank(r.rarity) * 0.1); shake(); } }, 780);        // silhouette bursts into colour
      for (let i = 0; i < n; i++) setTimeout(() => { if (!skipping) chime(i * 0.5, 0.06); }, 1150 + i * 120);                    // stars pop in
      if (r.new && r.intro_line) setTimeout(() => {
        if (skipping || !content.isConnected) return;
        const ja = japanese && r.intro_line_ja;
        speak(ja ? r.intro_line_ja : r.intro_line, { characterId: r.id, lang: ja ? 'ja' : 'en' });
      }, 1500);
    }
    await clickToContinue(overlay, 1500);
    stopSpeaking();
  }

  // 6. SUMMARY
  if (results.length > 1) {
    skipping = false;
    content.innerHTML = '';
    show.setRarity(bestRarity);
    const grid = document.createElement('div');
    grid.className = 'pull-grid';
    content.appendChild(grid);
    for (const r of results) {
      grid.appendChild(card(r));
      chime(rank(r.rarity) * 0.6, 0.05);
      await sleep(110);
    }
    const hint = document.createElement('div');
    hint.className = 'pull-hint';
    hint.textContent = 'Click to continue';
    content.appendChild(hint);
    await clickToContinue(overlay, 300);
  }

  show.stop();
  overlay.classList.remove('cut-shake', 'cut-quake');
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
  c.className = 'pull-card ' + rarityClass(r) + (r.type === 'character' ? ' char' : '') + (rank(r.rarity) >= 3 ? ' shiny' : '');
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
  const starRow = [...stars(r.rarity)].map((x, i) => `<span style="animation-delay:${1.15 + i * 0.12}s">${x}</span>`).join('');
  if (r.type === 'item') {
    s.innerHTML = `<div class="rays"></div><div class="info"><div class="rarity">${r.rarity.toUpperCase()}</div><div class="name ${rb}">${r.name}</div>
      <div class="title">+${r.refund} ◆ points</div><div class="hint" style="margin-top:30px">Click to continue</div></div>`;
  } else {
    // the name flies in one letter at a time
    let n = 0;
    const letters = r.name.split(' ').map(word => `<span class="word">${[...word].map(ch => `<span style="animation-delay:${0.95 + n++ * 0.035}s">${ch}</span>`).join('')}</span>`).join(' ');
    s.innerHTML = `<div class="rays"></div>
      <div class="ribbon"><span>${(r.rarity.toUpperCase() + ' ✦ ').repeat(14)}</span></div>
      <div class="figure"><div class="initial">${r.name[0]}</div>${portraitImg(r.id)}<div class="shine" style="-webkit-mask-image:url(${portrait(r.id)});mask-image:url(${portrait(r.id)})"></div></div>
      <div class="info">
        ${r.new ? '<div class="newtag">NEW</div>' : ''}
        <div class="rarity ${rb}">${r.rarity.toUpperCase()}</div>
        <div class="name letters ${rb}">${letters}</div>
        <div class="title">${r.title || ''}</div>
        <div class="stars">${starRow}</div>
        <div class="line">${r.new ? `“${r.intro_line || ''}”` : `Already with you. Bond ${r.bond} · +${r.refund} ◆ points`}</div>
        <div class="hint">Click to continue</div>
      </div>`;
  }
  return s;
}

// ---------------- The show on the canvas ----------------
function startShow(canvas) {
  const g = canvas.getContext('2d');
  const TAU = Math.PI * 2;
  let w, h, cx, cy, unit;
  const resize = () => {
    const scale = Math.min(1, 1440 / innerWidth); // big screens don't need every pixel for particles
    w = canvas.width = Math.round(innerWidth * scale); h = canvas.height = Math.round(innerHeight * scale);
    cx = w / 2; cy = h / 2; unit = Math.min(w, h);
  };
  resize();
  addEventListener('resize', resize);

  let rarity = 'Common';
  let running = true;
  let charge = 0;        // 0..1 how spun-up the gate is
  let pulse = 0;         // a quick swell of the gate when the rarity climbs
  let erupted = 0;       // 0 before the eruption, then counts up
  let pillar = 0;        // brightness of the pillar of light
  const t0 = performance.now();
  const warp = Array.from({ length: 170 }, () => ({ a: Math.random() * TAU, d: Math.random(), s: 0.2 + Math.random() }));
  const motes = Array.from({ length: 90 }, () => ({ a: Math.random() * TAU, d: 0.5 + Math.random() * 0.7, s: 0.3 + Math.random() * 0.7 }));
  const sparks = [];     // free-flying particles
  const rings = [];      // expanding shockwaves
  let meteors = [];

  const burst = (x, y, n, speed, col) => {
    for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = (0.3 + Math.random()) * speed; sparks.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, col, r: 1 + Math.random() * 2.5 }); }
  };

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    const t = (now - t0) / 1000;
    const col = colorOf(rarity, now);
    charge = Math.min(1, charge + 0.007);
    pulse *= 0.93;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgba(5,3,15,0.32)'; // fading instead of clearing leaves motion trails
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';

    // stars stretching into warp streaks, faster as the gate charges
    const speed = 0.002 + charge * 0.022 + pulse * 0.02 + (erupted ? 0.004 : 0);
    g.lineWidth = 1.2;
    for (const s of warp) {
      const d0 = s.d;
      s.d += speed * s.s * (0.3 + s.d);
      if (s.d > 1.2) { s.d = 0.02 + Math.random() * 0.1; continue; }
      const R = Math.hypot(w, h) / 2;
      g.strokeStyle = `rgba(200,215,255,${Math.min(1, s.d * 1.4)})`;
      g.beginPath(); g.moveTo(cx + Math.cos(s.a) * d0 * R, cy + Math.sin(s.a) * d0 * R); g.lineTo(cx + Math.cos(s.a) * s.d * R, cy + Math.sin(s.a) * s.d * R); g.stroke();
    }

    // the summoning gate: three rune rings and a star, spinning faster and faster
    if (erupted < 1.2) {
      const fade = 1 - Math.min(1, erupted);
      const grow = (0.4 + 0.6 * Math.min(1, t / 1.2)) * (1 + pulse * 0.25);
      g.globalAlpha = fade;
      const glowR = unit * 0.5 * grow;
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, glowR);
      gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(0.25, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = fade * (0.25 + charge * 0.3 + pulse * 0.4); g.fillStyle = gr; g.fillRect(cx - glowR, cy - glowR, glowR * 2, glowR * 2);
      g.globalAlpha = fade; g.strokeStyle = col; g.fillStyle = col;
      [[0.16, 1.4, 12], [0.25, -0.9, 24], [0.34, 0.5, 36]].forEach(([rad, dir, ticks], k) => {
        const r = unit * rad * grow, spin = t * dir * (0.4 + charge * 2.2);
        g.lineWidth = k === 1 ? 2.5 : 1.5;
        g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.stroke();
        for (let i = 0; i < ticks; i++) { // rune marks around the ring
          const a = spin + i * TAU / ticks, len = unit * (i % 3 ? 0.012 : 0.03);
          g.beginPath(); g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.lineTo(cx + Math.cos(a) * (r + len), cy + Math.sin(a) * (r + len)); g.stroke();
        }
      });
      for (const [points, rad, dir] of [[4, 0.16, 1], [4, 0.16, -1.6]]) { // two counter-rotating four-point stars
        g.lineWidth = 1.5; g.beginPath();
        for (let i = 0; i <= points * 2; i++) { const a = t * dir + i * Math.PI / points, r = unit * rad * grow * (i % 2 ? 0.38 : 1); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
        g.stroke();
      }
      // motes of light spiralling into the gate
      for (const m of motes) {
        m.d -= 0.004 * m.s * (1 + charge * 3); m.a += 0.02 * m.s * (1 + charge * 2);
        if (m.d < 0.03) { m.d = 0.6 + Math.random() * 0.6; m.a = Math.random() * TAU; }
        g.globalAlpha = fade * Math.min(1, 1.3 - m.d);
        g.beginPath(); g.arc(cx + Math.cos(m.a) * m.d * unit * 0.6, cy + Math.sin(m.a) * m.d * unit * 0.6, 1.6, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
    }

    // shooting stars crashing into the gate
    for (const m of meteors) {
      if (now < m.start || m.done) continue;
      m.p = Math.min(1, (now - m.start) / m.time);
      const e = m.p * m.p, mc = colorOf(m.rarity, now);
      const x = m.x0 + (cx - m.x0) * e + Math.sin(m.p * Math.PI) * m.bend, y = m.y0 + (cy - m.y0) * e;
      for (let i = 0; i < 3; i++) sparks.push({ x, y, vx: (Math.random() - 0.5) * 1.5, vy: (Math.random() - 0.5) * 1.5, life: 0.9, col: mc, r: 2.2 });
      const hg = g.createRadialGradient(x, y, 0, x, y, unit * 0.045);
      hg.addColorStop(0, '#fff'); hg.addColorStop(0.3, mc); hg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = hg; g.fillRect(x - unit * 0.045, y - unit * 0.045, unit * 0.09, unit * 0.09);
      if (m.p >= 1) { m.done = true; rings.push({ r: 0, life: 1, col: mc, speed: unit * 0.012 }); burst(cx, cy, 26, unit * 0.008, mc); pulse = 1; m.onHit(); }
    }

    // after the eruption: a pillar of light and sparks rising like embers
    if (erupted) {
      erupted += 0.016;
      pillar += ((erupted < 2 ? 1 : 0.35) - pillar) * 0.06;
      const pw = unit * (0.09 + 0.02 * Math.sin(t * 5)) * (erupted < 0.4 ? erupted / 0.4 * 2.2 : 1);
      const pg = g.createLinearGradient(cx - pw, 0, cx + pw, 0);
      pg.addColorStop(0, 'rgba(0,0,0,0)'); pg.addColorStop(0.35, col); pg.addColorStop(0.5, '#fff'); pg.addColorStop(0.65, col); pg.addColorStop(1, 'rgba(0,0,0,0)');
      g.globalAlpha = pillar * 0.55; g.fillStyle = pg; g.fillRect(cx - pw, 0, pw * 2, h); g.globalAlpha = 1;
      if (Math.random() < 0.6) sparks.push({ x: cx + (Math.random() - 0.5) * w * 0.9, y: h + 5, vx: (Math.random() - 0.5) * 0.6, vy: -(1 + Math.random() * 2.5), life: 1.6, col, r: 1 + Math.random() * 2, float: true });
    }

    for (let i = rings.length - 1; i >= 0; i--) {
      const r = rings[i];
      r.r += r.speed; r.life -= 0.022;
      if (r.life <= 0) { rings.splice(i, 1); continue; }
      g.globalAlpha = r.life; g.strokeStyle = r.col; g.lineWidth = 2 + r.life * 5;
      g.beginPath(); g.arc(cx, cy, r.r, 0, TAU); g.stroke();
    }
    for (let i = sparks.length - 1; i >= 0; i--) {
      const p = sparks[i];
      p.x += p.vx; p.y += p.vy; p.life -= p.float ? 0.006 : 0.018;
      if (!p.float) { p.vx *= 0.985; p.vy = p.vy * 0.985 + 0.03; }
      if (p.life <= 0) { sparks.splice(i, 1); continue; }
      g.globalAlpha = Math.min(1, p.life); g.fillStyle = p.col;
      g.beginPath(); g.arc(p.x, p.y, p.r * Math.min(1, p.life) + 0.5, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
    if (sparks.length > 2600) sparks.splice(0, sparks.length - 2600);
  }
  requestAnimationFrame(frame);

  return {
    /** The gate changes colour with a swell and a shockwave. */
    setRarity(r) { rarity = r; pulse = 1; rings.push({ r: unit * 0.1, life: 1, col: colorOf(r), speed: unit * 0.016 }); },
    /** Launches one shooting star per pull. Returns how long the starfall takes, in milliseconds. */
    starfall(rarities, onHit) {
      const now = performance.now(), gap = rarities.length > 1 ? 150 : 0;
      meteors = rarities.map((r, i) => ({
        rarity: r, start: now + i * gap, time: 900, p: 0, done: false,
        x0: w * (0.08 + 0.84 * (rarities.length > 1 ? i / (rarities.length - 1) : 0.15)), y0: -40, bend: (Math.random() - 0.5) * unit * 0.3,
        onHit: () => onHit(i),
      }));
      return 900 + gap * (rarities.length - 1) + 120;
    },
    /** Shockwaves, a storm of sparks and the pillar of light. */
    erupt(strength = 1) {
      erupted = erupted || 0.001;
      if (strength >= 1) { erupted = 0.001; pillar = 0; }
      const col = colorOf(rarity);
      for (let i = 0; i < 3; i++) rings.push({ r: unit * 0.02 * i, life: 1, col: i === 1 ? '#fff' : col, speed: unit * (0.014 + i * 0.006) });
      for (let i = 0; i < Math.round((rarity === 'Unbound' ? 520 : 300) * strength); i++) {
        const a = Math.random() * TAU, sp = (0.2 + Math.random()) * unit * 0.022;
        sparks.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1.4, col: colorOf(rarity, performance.now() + i * 30), r: 1 + Math.random() * 3 });
      }
    },
    stop() { running = false; removeEventListener('resize', resize); g.clearRect(0, 0, w, h); },
  };
}
