// Mini games played inside the app to earn Sakura Petals. Each game runs in the #minigame window and
// resolves with its score (or null if it was closed early). The backend turns a score into petals.
const $ = id => document.getElementById(id);

export const GAMES = {
  catch: { name: 'Petal Catch', how: 'Move the basket to catch falling petals. Golden petals are worth 5. Phones cost you 5!' },
  memory: { name: 'Memory Match', how: 'Find the matching pairs. The fewer turns you need, the more petals you earn.' },
  rhythm: { name: 'Rhythm Tap', how: 'Press D F J K (or click a lane) when a note reaches the line. Hit them on the beat!' },
  wheel: { name: 'Daily Spin', how: 'One free spin a day: 10 to 500 Sakura Petals, or a rare Free Wish (a free Summon).' },
};

let closeCurrent = null;

/** Opens a game. Resolves with the score when it ends, or null when the player closes it. */
export function playGame(id, opts = {}) {
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
    const stop = { catch: petalCatch, memory: memoryMatch, rhythm: rhythmTap, wheel: dailyWheel }[id](stage, finish, opts);
    closeCurrent = () => finish(null);
  });
}
export const closeGame = () => closeCurrent?.();
export const gameOpen = () => !!closeCurrent;

// ---------------- Petal Catch ----------------
function petalCatch(stage, finish) {
  const W = 760, H = 440, SECONDS = 20;
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
      spawn = 0.34 / pace;
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
function memoryMatch(stage, finish, { portraits = [] }) {
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

// ---------------- Rhythm Tap ----------------
// A short synth track is made on the spot (no sound files); the notes you tap are its melody.
function rhythmTap(stage, finish) {
  const W = 760, H = 440, LANES = 4, KEYS = ['d', 'f', 'j', 'k'], BPM = 126, BEAT = 60 / BPM, FALL = 1.5, LINE = H - 70, LEAD = 2.4;
  const COLORS = ['#ff8fc4', '#ffd27a', '#8fd8ff', '#b79bff'], SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5]; // C major pentatonic
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H; canvas.className = 'mg-canvas'; canvas.style.cursor = 'var(--hand)';
  stage.appendChild(canvas);
  const g = canvas.getContext('2d');
  // the chart: 44 beats, busier in the second half, never the same lane three times in a row
  const notes = [];
  let seed = 7, prev = -1, prev2 = -1;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let beat = 0; beat < 44; beat += 0.5) {
    const onBeat = beat % 1 === 0, chance = onBeat ? (beat < 8 ? 0.75 : 0.9) : (beat < 16 ? 0.12 : 0.4);
    if (rand() > chance) continue;
    let lane = Math.floor(rand() * LANES);
    if (lane === prev && lane === prev2) lane = (lane + 1) % LANES;
    prev2 = prev; prev = lane;
    notes.push({ t: LEAD + beat * BEAT, lane, hit: null, pitch: SCALE[(lane + Math.floor(beat / 4)) % SCALE.length] });
  }
  const END = LEAD + 44 * BEAT + 1.2;

  const AC = window.AudioContext || window.webkitAudioContext;
  const ac = new AC(), out = ac.createGain();
  out.gain.value = 0.5; out.connect(ac.destination);
  const t0 = ac.currentTime + 0.1;
  const tone = (at, freq, len, type, vol, slideTo) => {
    const o = ac.createOscillator(), v = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, at);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, at + len);
    v.gain.setValueAtTime(vol, at); v.gain.exponentialRampToValueAtTime(0.001, at + len);
    o.connect(v); v.connect(out); o.start(at); o.stop(at + len + 0.02);
  };
  const BASS = [130.81, 130.81, 174.61, 196]; // one bass note per bar: C C F G
  for (let beat = -4; beat < 44; beat++) {
    const at = t0 + LEAD + beat * BEAT;
    tone(at, 150, 0.16, 'sine', 0.9, 45);                                  // kick on every beat
    tone(at + BEAT / 2, 6000, 0.04, 'square', 0.05);                        // tick between beats
    if (beat >= 0) tone(at, BASS[Math.floor(beat / 4) % 4], BEAT * 0.9, 'triangle', 0.28);
  }
  for (const n of notes) tone(t0 + n.t, n.pitch, 0.22, 'triangle', 0.3);     // the melody is the notes you tap

  let alive = true, combo = 0, best = 0, flash = [0, 0, 0, 0], word = null;
  const now = () => ac.currentTime - t0;
  const tap = lane => {
    if (!alive) return;
    flash[lane] = 1;
    const t = now();
    let pick = null;
    for (const n of notes) if (n.hit === null && n.lane === lane && Math.abs(n.t - t) < 0.2 && (!pick || Math.abs(n.t - t) < Math.abs(pick.t - t))) pick = n;
    if (!pick) return;
    const off = Math.abs(pick.t - t);
    pick.hit = off < 0.075 ? 1 : off < 0.14 ? 0.6 : 0.25;
    combo++; best = Math.max(best, combo);
    word = { text: pick.hit === 1 ? 'PERFECT' : pick.hit === 0.6 ? 'GOOD' : 'OK', life: 0.5, lane };
  };
  const key = e => { const lane = KEYS.indexOf(e.key.toLowerCase()); if (lane >= 0 && !e.repeat) { e.preventDefault(); tap(lane); } };
  addEventListener('keydown', key);
  canvas.addEventListener('pointerdown', e => { const r = canvas.getBoundingClientRect(); tap(Math.min(LANES - 1, Math.floor((e.clientX - r.left) / r.width * LANES))); });
  const score = () => Math.round(notes.reduce((sum, n) => sum + (n.hit || 0), 0) / notes.length * 100);

  let last = performance.now();
  function tick(time) {
    if (!alive) return;
    requestAnimationFrame(tick);
    const dt = Math.min(0.05, (time - last) / 1000); last = time;
    const t = now(), lw = W / LANES;
    if (t > END) { finish(score()); return; }
    const beatPulse = Math.max(0, 1 - ((t - LEAD) / BEAT % 1 + 1) % 1 * 2.5);
    const bg = g.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, '#1c1440'); bg.addColorStop(1, '#4a2466');
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    for (let i = 0; i < LANES; i++) {
      g.fillStyle = `rgba(255,255,255,${0.03 + flash[i] * 0.16})`; g.fillRect(i * lw + 3, 0, lw - 6, H);
      flash[i] = Math.max(0, flash[i] - dt * 5);
      g.fillStyle = COLORS[i]; g.globalAlpha = 0.5 + beatPulse * 0.3; g.fillRect(i * lw + 12, LINE - 3, lw - 24, 6); g.globalAlpha = 1;
      g.fillStyle = 'rgba(255,255,255,.75)'; g.font = '700 22px "M PLUS Rounded 1c", sans-serif'; g.textAlign = 'center';
      g.fillText(KEYS[i].toUpperCase(), i * lw + lw / 2, H - 24);
    }
    for (const n of notes) {
      if (n.hit === null && t - n.t > 0.2) { n.hit = 0; combo = 0; word = { text: 'MISS', life: 0.4, lane: n.lane }; }
      if (n.hit !== null) continue;
      const y = LINE - (n.t - t) / FALL * LINE;
      if (y < -30) continue;
      g.fillStyle = COLORS[n.lane]; g.shadowColor = COLORS[n.lane]; g.shadowBlur = 14;
      g.beginPath(); g.roundRect(n.lane * lw + 18, y - 11, lw - 36, 22, 11); g.fill(); g.shadowBlur = 0;
      g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.roundRect(n.lane * lw + 26, y - 7, lw - 52, 5, 3); g.fill();
    }
    if (word) {
      word.life -= dt;
      if (word.life <= 0) word = null;
      else { g.globalAlpha = Math.min(1, word.life * 3); g.fillStyle = word.text === 'MISS' ? '#ff6b81' : '#fff3c4'; g.font = '800 24px "M PLUS Rounded 1c", sans-serif'; g.fillText(word.text, word.lane * lw + lw / 2, LINE - 40); g.globalAlpha = 1; }
    }
    if (t < LEAD - 0.2) { g.fillStyle = '#fff'; g.font = '800 40px "M PLUS Rounded 1c", sans-serif'; g.fillText(t < LEAD - 1.5 ? 'Get ready…' : 'Go!', W / 2, H / 2 - 40); }
    document.getElementById('mg-score').textContent = `Score ${score()} · Combo ${combo}`;
  }
  requestAnimationFrame(tick);
  return () => { alive = false; removeEventListener('keydown', key); ac.close().catch(() => {}); };
}

// ---------------- Daily wheel ----------------
function dailyWheel(stage, finish, { slices = [], spin }) {
  const wrap = document.createElement('div');
  wrap.className = 'mg-wheel';
  wrap.innerHTML = '<canvas width="800" height="800"></canvas><div class="won"></div><button class="primary big">Spin!</button>';
  stage.appendChild(wrap);
  const canvas = wrap.querySelector('canvas'), g = canvas.getContext('2d'), btn = wrap.querySelector('button'), won = wrap.querySelector('.won');
  const N = slices.length, STEP = Math.PI * 2 / N, COLORS = ['#ff8fc4', '#7a5cc8', '#ffd27a', '#4f3a8f'];
  let angle = 0, alive = true, timer = null;
  function draw() {
    const c = 400, r = 372;
    g.clearRect(0, 0, 800, 800);
    g.save(); g.translate(c, c); g.rotate(angle);
    for (let i = 0; i < N; i++) {
      const wish = /wish/i.test(slices[i]), big = slices[i] === '500';
      g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, r, i * STEP - Math.PI / 2 - STEP / 2, i * STEP - Math.PI / 2 + STEP / 2); g.closePath();
      g.fillStyle = wish ? '#fff1c9' : big ? '#ff4f9e' : COLORS[i % COLORS.length]; g.fill();
      g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 4; g.stroke();
      g.save(); g.rotate(i * STEP); g.fillStyle = wish ? '#7a3d00' : '#fff'; g.textAlign = 'center';
      g.font = `800 ${wish ? 40 : 58}px "M PLUS Rounded 1c", sans-serif`;
      g.fillText(wish ? 'FREE' : slices[i], 0, -r + 92);
      if (wish) g.fillText('WISH', 0, -r + 136);
      g.restore();
    }
    g.beginPath(); g.arc(0, 0, 54, 0, 6.29); g.fillStyle = '#fff1c9'; g.fill(); g.lineWidth = 8; g.strokeStyle = '#e3b565'; g.stroke();
    g.restore();
    g.beginPath(); g.arc(c, c, r + 8, 0, 6.29); g.lineWidth = 14; g.strokeStyle = '#ffd27a'; g.stroke();
    g.beginPath(); g.moveTo(c - 26, 2); g.lineTo(c + 26, 2); g.lineTo(c, 62); g.closePath(); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#ff4f9e'; g.stroke(); // the pointer
  }
  draw();
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    let prize;
    try { prize = await spin(); } catch (err) { won.textContent = err.message || 'Could not spin'; return; }
    const from = angle, to = Math.PI * 2 * 6 - prize.index * STEP + (Math.random() - 0.5) * STEP * 0.6, start = performance.now(), DUR = 5200;
    (function turn(time) {
      if (!alive) return;
      const p = Math.min(1, (time - start) / DUR), ease = 1 - Math.pow(1 - p, 4);
      angle = from + (to - from) * ease;
      draw();
      if (p < 1) return requestAnimationFrame(turn);
      won.textContent = prize.wish ? 'Free Wish!' : `+${prize.points} Sakura Petals`;
      timer = setTimeout(() => finish(prize), 1400);
    })(start);
  });
  return () => { alive = false; clearTimeout(timer); };
}
