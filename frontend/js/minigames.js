// Mini games played inside the app to earn Sakura Petals. Each game runs in the #minigame window and
// resolves with its score (or null if it was closed early). The backend turns a score into petals.
const $ = id => document.getElementById(id);

export const GAMES = {
  catch: { name: 'Petal Catch', how: 'Move the basket to catch falling petals. Golden petals are worth 5. Phones cost you 5!' },
  memory: { name: 'Memory Match', how: 'Find the matching pairs. The fewer turns you need, the more petals you earn.' },
};

let closeCurrent = null;

/** Opens a game. Resolves with the score when it ends, or null when the player closes it. */
export function playGame(id, { portraits = [] } = {}) {
  const box = $('minigame'), stage = $('mg-stage');
  $('mg-title').textContent = GAMES[id].name;
  $('mg-how').textContent = GAMES[id].how;
  $('mg-score').textContent = '';
  stage.innerHTML = '';
  box.classList.remove('hidden');
  return new Promise(resolve => {
    let done = false;
    const finish = score => {
      if (done) return;
      done = true;
      closeCurrent = null;
      stop();
      box.classList.add('hidden');
      stage.innerHTML = '';
      resolve(score);
    };
    const stop = (id === 'catch' ? petalCatch : memoryMatch)(stage, finish, portraits);
    closeCurrent = () => finish(null);
  });
}
export const closeGame = () => closeCurrent?.();
export const gameOpen = () => !!closeCurrent;

// ---------------- Petal Catch ----------------
function petalCatch(stage, finish) {
  const W = 760, H = 440, SECONDS = 30;
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H; canvas.className = 'mg-canvas';
  stage.appendChild(canvas);
  const g = canvas.getContext('2d');
  let basket = W / 2, score = 0, left = SECONDS, spawn = 0, last = performance.now(), alive = true;
  const things = [], pops = [];
  canvas.addEventListener('pointermove', e => { const r = canvas.getBoundingClientRect(); basket = Math.max(50, Math.min(W - 50, (e.clientX - r.left) / r.width * W)); });
  const key = e => { if (e.key === 'ArrowLeft') basket = Math.max(50, basket - 46); if (e.key === 'ArrowRight') basket = Math.min(W - 50, basket + 46); };
  addEventListener('keydown', key);

  const petal = (x, y, s, rot, color) => {
    g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = color;
    g.beginPath(); g.moveTo(0, -s); g.bezierCurveTo(s * 0.9, -s * 0.6, s * 0.7, s * 0.55, s * 0.12, s * 0.8); g.lineTo(0, s * 0.6); g.lineTo(-s * 0.12, s * 0.8);
    g.bezierCurveTo(-s * 0.7, s * 0.55, -s * 0.9, -s * 0.6, 0, -s); g.fill(); g.restore();
  };

  function tick(now) {
    if (!alive) return;
    requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    left -= dt;
    if (left <= 0) { finish(Math.max(0, score)); return; }
    const pace = 1 + (SECONDS - left) / SECONDS; // it gets busier
    spawn -= dt;
    if (spawn <= 0) {
      spawn = 0.42 / pace;
      const r = Math.random(), kind = r < 0.13 ? 'phone' : r < 0.23 ? 'gold' : 'petal';
      things.push({ kind, x: 40 + Math.random() * (W - 80), y: -20, vy: (120 + Math.random() * 90) * pace, rot: Math.random() * 6.28, sway: Math.random() * 6.28 });
    }
    // backdrop
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#2b1f4d'); sky.addColorStop(0.6, '#7a3f78'); sky.addColorStop(1, '#f2a0b8');
    g.fillStyle = sky; g.fillRect(0, 0, W, H);
    g.fillStyle = 'rgba(255,255,255,.07)';
    for (let i = 0; i < 5; i++) { g.beginPath(); g.arc(90 + i * 150, H + 30, 120, 0, 6.28); g.fill(); }
    // falling things
    for (let i = things.length - 1; i >= 0; i--) {
      const t = things[i];
      t.y += t.vy * dt; t.sway += dt * 2; t.rot += dt * 1.5;
      const x = t.x + Math.sin(t.sway) * 16;
      if (t.y > H - 62 && t.y < H - 26 && Math.abs(x - basket) < 54) {
        const gain = t.kind === 'phone' ? -5 : t.kind === 'gold' ? 5 : 1;
        score += gain;
        pops.push({ x, y: t.y, life: 0.7, text: (gain > 0 ? '+' : '') + gain, bad: gain < 0 });
        things.splice(i, 1);
        continue;
      }
      if (t.y > H + 30) { things.splice(i, 1); continue; }
      if (t.kind === 'phone') {
        g.save(); g.translate(x, t.y); g.rotate(Math.sin(t.sway) * 0.3);
        g.fillStyle = '#1d1b2e'; g.beginPath(); g.roundRect(-11, -18, 22, 36, 5); g.fill();
        g.fillStyle = '#7fd0ff'; g.fillRect(-8, -13, 16, 24);
        g.fillStyle = '#ff5f7a'; g.beginPath(); g.arc(8, -15, 5, 0, 6.28); g.fill();
        g.restore();
      } else {
        if (t.kind === 'gold') { g.fillStyle = 'rgba(255,220,130,.35)'; g.beginPath(); g.arc(x, t.y, 20, 0, 6.28); g.fill(); }
        petal(x, t.y, t.kind === 'gold' ? 15 : 12, t.rot, t.kind === 'gold' ? '#ffd76a' : '#ffb7ce');
      }
    }
    // the basket
    g.fillStyle = '#8a5a34'; g.beginPath(); g.moveTo(basket - 54, H - 52); g.lineTo(basket + 54, H - 52); g.lineTo(basket + 40, H - 14); g.lineTo(basket - 40, H - 14); g.closePath(); g.fill();
    g.strokeStyle = '#c9905a'; g.lineWidth = 3;
    for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(basket + i * 20, H - 52); g.lineTo(basket + i * 15, H - 14); g.stroke(); }
    g.fillStyle = '#e0aa72'; g.fillRect(basket - 58, H - 58, 116, 9);
    // score pops
    g.font = '700 20px "M PLUS Rounded 1c", sans-serif'; g.textAlign = 'center';
    for (let i = pops.length - 1; i >= 0; i--) {
      const p = pops[i]; p.life -= dt; p.y -= 50 * dt;
      if (p.life <= 0) { pops.splice(i, 1); continue; }
      g.globalAlpha = Math.min(1, p.life * 2); g.fillStyle = p.bad ? '#ff6b81' : '#fff3c4'; g.fillText(p.text, p.x, p.y); g.globalAlpha = 1;
    }
    $('mg-score').textContent = `Score ${Math.max(0, score)} · ${Math.ceil(left)}s`;
  }
  requestAnimationFrame(tick);
  return () => { alive = false; removeEventListener('keydown', key); };
}

// ---------------- Memory Match ----------------
function memoryMatch(stage, finish, portraits) {
  const faces = portraits.slice().sort(() => Math.random() - 0.5).slice(0, 6);
  const deck = [...faces, ...faces].sort(() => Math.random() - 0.5);
  const grid = document.createElement('div');
  grid.className = 'mg-cards';
  grid.innerHTML = deck.map((src, i) => `<button class="mg-card" data-i="${i}"><span class="back"></span><img src="${src}" alt="" draggable="false"></button>`).join('');
  stage.appendChild(grid);
  let open = [], turns = 0, found = 0, busy = false, timer = null;
  const show = () => { $('mg-score').textContent = `Turns ${turns} · Pairs ${found}/${faces.length}`; };
  show();
  grid.addEventListener('click', e => {
    const card = e.target.closest('.mg-card');
    if (!card || busy || card.classList.contains('up')) return;
    card.classList.add('up');
    open.push(card);
    if (open.length < 2) return;
    turns++;
    const [a, b] = open;
    open = [];
    if (deck[a.dataset.i] === deck[b.dataset.i]) {
      a.classList.add('matched'); b.classList.add('matched');
      found++;
      if (found === faces.length) timer = setTimeout(() => finish(turns), 700);
    } else {
      busy = true;
      timer = setTimeout(() => { a.classList.remove('up'); b.classList.remove('up'); busy = false; }, 750);
    }
    show();
  });
  return () => clearTimeout(timer);
}
