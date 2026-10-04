// Gacha summon cutscene, in the style of anime gacha games. The show, in order:
//   1. LOTUS     a 3D scene: a lotus bud on still water under a dusk sky, sakura petals spiralling in toward it
//   2. TEASE     the bud glows through the rarity colours, stopping at the best thing you pulled
//   3. STARFALL  the camera looks up as one shooting star per pull falls into the bud, each in its rarity colour
//   4. BLOOM     the lotus bursts open with a pillar of light, shockwaves and screen shake as the camera rushes in
//   5. REVEAL    a cinematic shot of each notable character in front of their own scene: their real 3D model drops in
//                spinning, lands with a shockwave, strikes a pose and idles, with themed effects behind them and a slim
//                name / stars / reward block on the left. (Falls back to their picture if the model can't load.)
//   6. SUMMARY   every pull as a card
import { sfx, speak, stopSpeaking, riser, impact, chime } from './voice.js';
import { SummonStage, startFx, discardModel } from './summon3d.js';
import { startScene } from './summonscene.js';

export const RARITY_COLORS = {
  Common: '#9aa5b1', Rare: '#4ea8ff', Epic: '#b06bff', Legendary: '#ffb627', Mythic: '#ff3b5c', Unbound: 'rainbow',
};
const ORDER = ['Common', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Unbound'];
export const STARS = { Common: 2, Rare: 3, Epic: 4, Legendary: 5, Mythic: 6, Unbound: 7 };
export const stars = rarity => '★'.repeat(STARS[rarity] || 1);
/** The points symbol (a lotus), as inline HTML. */
export const LOTUS = '<svg class="lotus" viewBox="0 0 24 24"><use href="#i-lotus"/></svg>';
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

export async function playCutscene(results, bestRarity, { japanese = false, details = () => ({}) } = {}) {
  const overlay = el('cutscene');
  const content = el('cut-content');
  overlay.classList.remove('hidden');
  content.innerHTML = '';
  skipping = false;
  el('cut-skip').onclick = e => { e.stopPropagation(); skipping = true; stopSpeaking(); };
  const top = rank(bestRarity);
  const shake = (cls = 'cut-shake') => { overlay.classList.remove('cut-shake', 'cut-quake'); void overlay.offsetWidth; overlay.classList.add(cls); };

  // The first character's 3D model starts loading now, so it is ready by the time the stars have fallen
  const firstReveal = (results.length === 1 ? results : results.filter(r => r.type === 'character' && (r.new || rank(r.rarity) >= 3)))[0];
  const firstInfo = firstReveal && details(firstReveal);
  let preloadStage = null;
  const firstModel = firstInfo && firstInfo.model ? (preloadStage = new SummonStage()).load(firstInfo.model).then(m => preloadStage.prewarm(m)) : Promise.resolve(null);

  // 1. GATE
  const show = startScene(overlay); // the 3D lotus scene (summonscene.js)
  sfx('gacha_charge');
  if (!skipping) riser(2.6);
  // The camera glides in over the water. Loading the character's model makes the picture stutter for a moment, so that is
  // finished here, during the calm opening, and not in the middle of the bloom or the reveal.
  await Promise.all([wait(1700), Promise.race([firstModel, wait(7000)])]);

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
  const stage = preloadStage || new SummonStage();
  // Models are loaded one step ahead (the first during the build-up above, the next while you look at the current one)
  const prepare = r => { const d = r && details(r); return d && d.model ? stage.load(d.model).then(m => stage.prewarm(m)) : Promise.resolve(null); };
  // a soft white-out carries each shot into the next, so nothing pops in abruptly
  const white = document.createElement('div');
  white.className = 'cut-white';
  overlay.appendChild(white);
  const whiteOut = async ms => { white.style.transitionDuration = ms + 'ms'; white.classList.add('on'); await wait(ms); };
  const patience = p => Promise.race([p, new Promise(res => setTimeout(() => res(null), 12000))]);
  let fx = null, coming = firstModel;
  for (const [i, r] of reveals.entries()) {
    if (skipping) break;
    const model = await patience(coming);
    coming = prepare(reveals[i + 1]);
    if (!i) content.innerHTML = '';
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
    const d = details(r);
    const shot = reveal(r, d, !!model);
    await whiteOut(i ? 240 : 420);
    content.innerHTML = '';
    content.appendChild(shot);
    requestAnimationFrame(() => { white.style.transitionDuration = '650ms'; white.classList.remove('on'); });
    show.erupt(0.6);
    if (fx) fx.stop();
    fx = startFx(shot.querySelector('.rv-fx'), d.personality, d.color || '#9aa5b1');
    const landed = () => { if (skipping || !shot.isConnected) return; impact(0.35 + rank(r.rarity) * 0.1); shake(); fx.land(); };
    if (model) stage.play(model, shot.querySelector('.rv-stage'), d, landed); // drops in, lands, strikes a pose, idles
    if (r.type === 'character') {
      const n = STARS[r.rarity];
      if (!model) setTimeout(landed, 780); // (picture fallback: same beat as the 3D landing)
      for (let i = 0; i < n; i++) setTimeout(() => { if (!skipping) chime(i * 0.5, 0.06); }, 1500 + i * 130);                    // stars pop in
      if (r.new && r.intro_line) setTimeout(() => {
        if (skipping || !content.isConnected) return;
        const ja = japanese && r.intro_line_ja;
        speak(ja ? r.intro_line_ja : r.intro_line, { characterId: r.id, lang: ja ? 'ja' : 'en' });
      }, 2300);
    }
    await clickToContinue(overlay, 1800);
    stopSpeaking();
    if (i === reveals.length - 1 || skipping) { await whiteOut(240); content.innerHTML = ''; }
    stage.clear();
  }
  white.style.transitionDuration = '500ms'; white.classList.remove('on');
  setTimeout(() => white.remove(), 700);
  if (fx) fx.stop();
  coming.then(discardModel); // a model that was loaded ahead but never shown
  stage.dispose();

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
    <div class="big-initial ${r.rarity === 'Unbound' ? 'rainbow-text' : ''}">${r.type === 'character' ? r.name[0] : LOTUS}</div>
    ${r.type === 'character' ? portraitImg(r.id, true) : ''}
    <div><b>${r.name}</b></div>
    <div class="stars">${stars(r.rarity)}</div>
    <small>${r.refund ? '+' + r.refund + ' ' + LOTUS : ''}${r.bond ? ' · Bond ' + r.bond : ''}&nbsp;</small>`;
  return c;
}

// little pictures for the reward chips
const GEM = LOTUS;
const HEART = '<svg viewBox="0 0 24 24"><path d="M12 20.500s-7.500-4.700-7.500-10.300A4.200 4.200 0 0 1 12 7.600a4.200 4.200 0 0 1 7.500 2.600c0 5.600-7.500 10.300-7.500 10.300z" fill="#ff7eb6" stroke="#fff" stroke-width=".8"/></svg>';

/** The cinematic reveal shot. d = { icon, color, backdrop, ... } from app.js; live = the 3D model will be shown instead of the picture. */
function reveal(r, d, live) {
  const s = document.createElement('div');
  const isChar = r.type === 'character';
  s.className = 'reveal ' + rarityClass(r) + (isChar ? '' : ' item');
  s.style.setProperty('--cc', d.color || '#9aa5b1');
  const starRow = [...'✦'.repeat(STARS[r.rarity] || 1)].map((x, i) => `<span style="animation-delay:${1.5 + i * 0.13}s">${x}</span>`).join('');
  const embers = Array.from({ length: 26 }, () =>
    `<i style="left:${(Math.random() * 100).toFixed(1)}%;--s:${(2 + Math.random() * 4).toFixed(1)}px;--d:${(5 + Math.random() * 7).toFixed(1)}s;animation-delay:-${(Math.random() * 10).toFixed(1)}s"></i>`).join('');
  const chips = [
    r.refund ? `<div class="rv-chip" title="Points">${GEM}<small>${r.refund}</small></div>` : '',
    isChar ? `<div class="rv-chip bond" title="Bond">${HEART}<small>${r.new ? 'New' : 'Lv ' + r.bond}</small></div>` : '',
  ].join('');
  s.innerHTML = `
    <div class="rv-bg" style="background-image:url(${d.backdrop || ''})"></div>
    <div class="rv-grade"></div>
    <div class="rv-embers">${embers}</div>
    <canvas class="rv-fx"></canvas>
    ${!isChar ? `<div class="rv-gem">${LOTUS}</div>` : live ? '<div class="rv-stage"></div>' : `<div class="rv-figure"><div class="initial">${r.name[0]}</div>${portraitImg(r.id)}</div>`}
    <div class="rv-flash"></div>
    <div class="rv-info">
      <div class="rv-head">
        <div class="rv-icon"><i></i><i></i><span>${d.icon || LOTUS}</span></div>
        <div class="rv-name">${r.new ? '<em>New</em>' : ''}<b class="${r.rarity === 'Unbound' ? 'rainbow-text' : ''}">${r.name}</b>${r.title ? `<small>${r.title}</small>` : ''}</div>
      </div>
      <div class="rv-stars">${starRow}</div>
      <div class="rv-chips">${chips}</div>
    </div>
    ${isChar && r.new && r.intro_line ? `<div class="rv-sub">“${r.intro_line}”</div>` : ''}
    <div class="hint">Click to continue</div>`;
  return s;
}
