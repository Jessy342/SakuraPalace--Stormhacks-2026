// Main UI logic: connects all the tabs to the backend and the 3D character.
import { api, post } from './api.js';
import { Character } from './character.js';
import * as voice from './voice.js';
import { playCutscene } from './gacha.js';

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let S = null;            // full game state from the backend
let chatHistory = [];
let teachHistory = [];
let loadedModelFor = null;
let lastPoints = null;
let lastEventId = 0;
let lastYellAt = 0;
let elevenOn = false;
const character = new Character($('stage'), voice.mouthLevel);
window.character = character; // handy for debugging in DevTools (F12)

const activeChar = () => S.catalog.characters.find(c => c.id === S.active_character);
const isDemo = () => !!S.settings.demo_mode;

// ======================= Speaking =======================
let bubbleTimer = null;
async function say(text, { emotion = 'neutral', ja = '', expressive = false, seconds } = {}) {
  if (!text) return;
  const char = activeChar();
  const sub = S.settings.voice_mode === 'sub' && ja;
  const shown = text.replace(/\[[^\]]+\]\s*/g, '');
  $('bubble-text').textContent = sub ? ja : shown;
  $('bubble-sub').textContent = sub ? shown : '';
  $('bubble').classList.remove('hidden');
  clearTimeout(bubbleTimer);
  character.setEmotion(emotion, seconds || Math.max(3, shown.length / 12));
  const started = Date.now();
  const minShow = 1500 + shown.length * 55; // keep subtitles readable even if audio is short/missing
  await voice.speak(sub ? ja : text, { characterId: char.id, expressive, lang: sub ? 'ja' : 'en', gender: char.gender });
  const wait = Math.max(2000, minShow - (Date.now() - started));
  bubbleTimer = setTimeout(() => $('bubble').classList.add('hidden'), wait);
}

async function yell(stage, app = '', emotion = 'angry') {
  try {
    const line = await post('/yell', { stage, app });
    await say(line.tts_text, { emotion, expressive: true });
  } catch (e) { console.warn(e); }
}

// ======================= UI click sounds =======================
let uiSounds = true;
try { uiSounds = localStorage.getItem('uiSounds') !== 'off'; } catch { /* storage blocked */ }
document.addEventListener('pointerdown', e => {
  const b = e.target.closest?.('button, input[type=checkbox], input[type=radio], .check');
  if (uiSounds && b && !b.disabled) voice.uiClick();
}, true);
$('ui-sounds').checked = uiSounds;
$('ui-sounds').addEventListener('change', () => {
  uiSounds = $('ui-sounds').checked;
  try { localStorage.setItem('uiSounds', uiSounds ? 'on' : 'off'); } catch { /* storage blocked */ }
});

// ======================= Poking =======================
let pokeTimes = [];
let lastPokeLine = 0;
character.onPoke = async zone => {
  const now = Date.now();
  pokeTimes = pokeTimes.filter(t => now - t < 6000);
  pokeTimes.push(now);
  const spam = pokeTimes.length >= 5;
  floater(zone === 'head' ? '♥' : spam ? '💢' : '!', zone === 'head' ? 'heart' : '');
  character.setEmotion(spam ? 'angry' : zone === 'head' ? 'happy' : 'surprised', 2.5);
  // Don't talk over important lines (focus warnings) and don't stack voice lines when clicked fast
  if (focusActive && $('warning') && !$('warning').classList.contains('hidden')) return;
  if (now - lastPokeLine < 2500 && !spam) return;
  if (spam) pokeTimes = [];
  lastPokeLine = now;
  voice.stopSpeaking();
  try {
    const line = await post('/yell', { stage: spam ? 'poke_spam' : zone === 'head' ? 'headpat' : 'poke' });
    await say(line.tts_text, { emotion: spam ? 'angry' : zone === 'head' ? 'happy' : 'surprised', expressive: true });
  } catch (e) { console.warn(e); }
};

function floater(text, cls = '') {
  const f = document.createElement('div');
  f.className = 'floater ' + cls;
  f.textContent = text;
  f.style.left = (Math.random() * 80 - 40) + 'px';
  $('floaters').appendChild(f);
  setTimeout(() => f.remove(), 1900);
}

function addMsg(role, text) {
  const m = document.createElement('div');
  m.className = 'msg ' + role;
  m.textContent = text;
  $('chat-log').appendChild(m);
  $('chat-log').scrollTop = 1e9;
}

function toastError(e) { addMsg('sys', '⚠ ' + (e.message || e)); }

// ======================= Rendering =======================
async function setState(newState) {
  S = newState;
  render();
  const char = activeChar();
  if (loadedModelFor !== char.id) {
    loadedModelFor = char.id;
    const ok = await character.load(`assets/characters/${char.model}`, char.color);
    $('model-hint').classList.toggle('hidden', ok);
    $('model-hint').textContent = `Placeholder shown: export ${char.name} from VRoid Studio as frontend/assets/characters/${char.model}`;
  }
  character.setAccessories(S.equipped_accessories);
}

function render() {
  const char = activeChar();
  // HUD
  $('hud-char').textContent = char.name;
  $('hud-title').textContent = char.title || '';
  $('hud-level').textContent = S.level;
  $('hud-xp').style.width = (100 * S.xp / S.xp_to_next) + '%';
  $('hud-xptext').textContent = `${S.xp} / ${S.xp_to_next} XP`;
  updatePoints(S.points);
  const bg = S.catalog.backgrounds.find(b => b.id === S.background);
  document.body.style.background = bg ? bg.css : '';

  renderTasks();
  renderFocusSettings();
  renderGacha();
  renderShop();
  renderSettings();
}

function updatePoints(p) {
  const el = $('hud-points');
  el.textContent = p;
  if (lastPoints !== null && p !== lastPoints) {
    const box = el.parentElement;
    box.classList.remove('flash-red', 'flash-green');
    void box.offsetWidth;
    box.classList.add(p < lastPoints ? 'flash-red' : 'flash-green');
  }
  lastPoints = p;
}

// ======================= Chat =======================
$('chat-form').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('chat-input').value.trim();
  if (!text) return;
  $('chat-input').value = '';
  await sendChat(text);
});

async function sendChat(text) {
  addMsg('user', text);
  const thinking = document.createElement('div');
  thinking.className = 'msg sys';
  thinking.textContent = `${activeChar().name} is thinking…`;
  $('chat-log').appendChild(thinking);
  try {
    const res = await post('/chat', { message: text, history: chatHistory });
    thinking.remove();
    chatHistory.push({ role: 'user', text }, { role: 'model', text: res.reply });
    addMsg('bot', res.reply);
    for (const t of res.added_tasks) addMsg('sys', `📝 Added task: ${t.title}${t.due ? ' (due ' + t.due + ')' : ''}`);
    if (res.added_tasks.length) voice.sfx('task_done');
    await setState(res.state);
    say(res.reply, { emotion: res.emotion, ja: res.reply_ja });
  } catch (err) { thinking.remove(); toastError(err); }
}

$('mic-btn').addEventListener('click', async () => {
  const btn = $('mic-btn');
  if (!voice.isRecording()) {
    try {
      voice.stopSpeaking();
      await voice.startRecording();
      btn.classList.add('recording');
      btn.textContent = '■';
    } catch (e) { toastError('Microphone not available: ' + e.message); }
  } else {
    btn.classList.remove('recording');
    btn.textContent = '…';
    try {
      const text = await voice.stopRecording();
      if (text) await sendChat(text);
      else addMsg('sys', "Didn't catch that. Try again?");
    } catch (e) { toastError(e); }
    btn.textContent = '🎤';
  }
});

// ======================= Tasks =======================
$('task-form').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const res = await post('/tasks', { title: $('task-title').value, difficulty: $('task-diff').value, due: $('task-due').value || null });
    $('task-title').value = '';
    await setState(res.state);
  } catch (err) { toastError(err); }
});

// ---- due dates ----
const localISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
function dueInfo(due) {
  if (!due) return null;
  const day = String(due).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return { cls: 'later', label: `Due ${due}`, day: '9999' };
  const now = new Date();
  const today = localISO(now);
  const tmr = new Date(now); tmr.setDate(now.getDate() + 1);
  if (day < today) return { cls: 'overdue', label: 'Overdue', day };
  if (day === today) return { cls: 'today', label: 'Due today', day };
  if (day === localISO(tmr)) return { cls: 'soon', label: 'Due tomorrow', day };
  const label = new Date(day + 'T00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return { cls: 'later', label: `Due ${label}`, day };
}

/** What Aiko should say about deadlines, or '' if nothing is urgent. */
function reminderLine() {
  const pending = S.tasks.filter(t => !t.done);
  const by = cls => pending.filter(t => dueInfo(t.due)?.cls === cls);
  const say1 = (list, one, many) => list.length === 1 ? `"${list[0].title}" ${one}` : `${list.length} tasks ${many}`;
  const parts = [];
  const over = by('overdue'), today = by('today'), soon = by('soon');
  if (over.length) parts.push(say1(over, 'is overdue!', 'are overdue!'));
  if (today.length) parts.push(say1(today, 'is due today.', 'are due today.'));
  if (soon.length) parts.push(say1(soon, 'is due tomorrow.', 'are due tomorrow.'));
  return parts.length ? `Heads up! ${parts.join(' And ')}` : '';
}

function renderWeek() {
  const w = S.week || { focus_seconds: 0, tasks: 0 };
  const h = Math.floor(w.focus_seconds / 3600), m = Math.floor((w.focus_seconds % 3600) / 60);
  const streak = S.login?.streak || 0;
  $('week-card').innerHTML = `
    <div><b>🔥 ${streak}</b><small>day streak</small></div>
    <div><b>${h ? h + 'h ' : ''}${m}m</b><small>focused this week</small></div>
    <div><b>✅ ${w.tasks}</b><small>tasks this week</small></div>
    <div><b>🍅 ${S.stats.pomodoros || 0}</b><small>pomodoros</small></div>`;
  $('hud-streak').textContent = `🔥 ${streak}`;
  $('hud-streak').title = `${streak}-day streak (best: ${S.login?.best || streak}). Open the app every day for a bigger daily gift!`;
}

function renderTasks() {
  renderWeek();
  const pending = S.tasks.filter(t => !t.done)
    .map((t, i) => ({ t, i, d: dueInfo(t.due) }))
    .sort((a, b) => (a.d?.day || '9999z').localeCompare(b.d?.day || '9999z') || a.i - b.i) // soonest deadline first
    .map(x => x.t);
  const done = S.tasks.filter(t => t.done).slice(-20).reverse();
  $('task-list').innerHTML = pending.length ? pending.map(t => `
    <li><span class="diff ${t.difficulty}">${t.difficulty}</span>
      <span class="t">${esc(t.title)}${t.due ? `<span class="due ${dueInfo(t.due).cls}">${esc(dueInfo(t.due).label)}</span>` : ''}</span>
      <button data-done="${t.id}">✓</button><button class="ghost" data-del="${t.id}">✕</button></li>`).join('')
    : '<li><span class="t"><small>Nothing to do! Add a task or ask your assistant to plan your week.</small></span></li>';
  $('done-list').innerHTML = done.map(t => `<li><span class="t">${esc(t.title)}</span></li>`).join('');
}

$('task-list').addEventListener('click', async e => {
  const id = e.target.dataset.done, del = e.target.dataset.del;
  try {
    if (id) {
      const res = await post(`/tasks/${id}/complete`);
      voice.sfx('task_done');
      floater(`+${res.xp_gained} XP  +${res.points_gained} ◆`);
      await setState(res.state);
      if (res.levels_gained) {
        voice.sfx('level_up');
        floater(`LEVEL UP! +${res.level_bonus} ◆`, 'big');
        yell('levelup', '', 'surprised');
      } else {
        yell('praise', '', 'happy');
      }
    } else if (del) {
      await setState(await api(`/tasks/${del}`, { method: 'DELETE' }));
    }
  } catch (err) { toastError(err); }
});

$('plan-btn').addEventListener('click', async () => {
  const goals = $('plan-goals').value.trim();
  if (!goals) return;
  $('plan-btn').disabled = true;
  $('plan-btn').textContent = 'Planning…';
  try {
    const res = await post('/plan', { goals });
    await setState(res.state);
    addMsg('sys', `🗓 Added ${res.added_tasks.length} tasks to your week.`);
    say(res.reply, { emotion: res.emotion });
  } catch (err) { toastError(err); }
  $('plan-btn').disabled = false;
  $('plan-btn').textContent = 'Make my plan';
});

// ======================= Focus =======================
let focusActive = false;
let pomoChoice = 25; // 0 = free session, 25 / 50 = pomodoro minutes
try { const saved = localStorage.getItem('pomoChoice'); if (saved !== null) pomoChoice = +saved; } catch { /* storage blocked */ }
const BREAK_FOR = { 25: 5, 50: 10 };
const fmt = sec => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

function pomoHint(m) {
  return m ? `${m} min work, then a ${BREAK_FOR[m]} min break. The timer pauses while you're distracted. Earn 2 points + 1 XP per focused minute, plus a bonus for every finished round.`
    : 'Free session: counts up until you end it. Earn 2 points + 1 XP per focused minute.';
}

function renderPomoPicker() {
  document.querySelectorAll('#pomo-picker button').forEach(b => {
    b.classList.toggle('active', +b.dataset.pomo === pomoChoice);
    b.disabled = focusActive;
  });
  $('pomo-picker').classList.toggle('locked', focusActive);
  $('focus-hint').textContent = pomoHint(pomoChoice);
}

$('pomo-picker').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b || focusActive) return;
  pomoChoice = +b.dataset.pomo;
  try { localStorage.setItem('pomoChoice', pomoChoice); } catch { /* storage blocked */ }
  renderPomoPicker();
  $('focus-timer').textContent = pomoChoice ? fmt(isDemo() ? 30 : pomoChoice * 60) : '00:00';
});

function renderFocusSettings() {
  const s = S.settings;
  if (document.activeElement?.closest?.('#tab-focus')) return; // don't overwrite while typing
  $('blocked-apps').value = s.blocked_apps.join(', ');
  $('blocked-sites').value = s.blocked_sites.join(', ');
  $('grace').value = s.grace_seconds;
  $('drain-every').value = s.drain_every_seconds;
  $('drain-amount').value = s.drain_amount;
  $('force-close').value = s.force_close_after;
  $('demo-mode').checked = !!s.demo_mode;
}

$('save-focus').addEventListener('click', async () => {
  const list = v => v.split(',').map(x => x.trim()).filter(Boolean);
  try {
    const res = await post('/settings', { settings: {
      blocked_apps: list($('blocked-apps').value),
      blocked_sites: list($('blocked-sites').value),
      grace_seconds: +$('grace').value,
      drain_every_seconds: +$('drain-every').value,
      drain_amount: +$('drain-amount').value,
      force_close_after: +$('force-close').value,
      demo_mode: $('demo-mode').checked,
    } });
    document.activeElement?.blur();
    await setState(res);
    addMsg('sys', 'Focus settings saved.');
  } catch (err) { toastError(err); }
});

$('focus-toggle').addEventListener('click', async () => {
  try {
    if (!focusActive) {
      await post('/focus/start', { pomodoro: pomoChoice });
      say(pomoChoice ? `Focus mode on. ${pomoChoice} minutes, then you get a break. I'm watching you.`
        : `Focus mode on. I'm watching you.`, { emotion: 'relaxed' });
    } else {
      const res = await post('/focus/stop');
      $('warning').classList.add('hidden');
      await setState(res.state);
      floater(`+${res.points_gained} ◆  +${res.xp_gained} XP`);
      const rounds = res.pomodoros ? ` Finished ${res.pomodoros} pomodoro${res.pomodoros > 1 ? 's' : ''} (+${res.pomodoro_bonus} bonus).` : '';
      addMsg('sys', `Focus session done: ${res.minutes} min focused, earned ${res.points_gained} points, lost ${res.points_lost}.${rounds}`);
      if (res.levels_gained) { voice.sfx('level_up'); yell('levelup', '', 'surprised'); }
    }
  } catch (err) { toastError(err); }
});

$('sim-on').addEventListener('click', () => post('/focus/simulate', { name: 'YouTube', on: true }));
$('sim-app').addEventListener('click', () => post('/focus/simulate', { name: 'discord.exe', kind: 'app', on: true }));
$('open-taskmgr').addEventListener('click', async () => {
  try {
    const res = await post('/focus/taskmanager');
    if (!res.ok) addMsg('sys', `⚠ ${res.reason}`);
  } catch (err) { toastError(err); }
});
$('sim-off').addEventListener('click', () => post('/focus/simulate', { on: false }));

function timings() {
  const s = S.settings;
  return isDemo() ? { grace: 5, force: 20 } : { grace: s.grace_seconds, force: s.force_close_after };
}

async function pollFocus() {
  try {
    const st = await api('/focus/status?since=' + lastEventId);
    const wasActive = focusActive;
    focusActive = st.active;
    if (wasActive !== focusActive) renderPomoPicker();
    const pomo = st.active && st.pomodoro;
    const onBreak = pomo && st.phase === 'break';
    const shown = pomo ? fmt(st.phase_left) : st.active || !pomoChoice ? fmt(st.focused_seconds)
      : fmt(isDemo() ? 30 : pomoChoice * 60);
    $('focus-timer').textContent = shown;
    $('focus-phase').textContent = !pomo ? (st.active ? 'Free session' : '')
      : onBreak ? `☕ Break time` : `🍅 Round ${st.rounds + 1}${st.stage !== 'ok' ? ' · paused' : ''}`;
    document.querySelector('.focus-card').classList.toggle('break', !!onBreak);
    $('pomo-fill').parentElement.classList.toggle('hidden', !pomo);
    $('pomo-fill').style.width = pomo && st.phase_total ? (100 * (1 - st.phase_left / st.phase_total)) + '%' : '0';
    $('focus-toggle').textContent = st.active ? 'End focus session' : 'Start focus session';
    $('focus-platform').textContent = st.windows_detection ? 'Watching real apps and browser tabs (Windows).'
      : 'Real app detection only works on Windows. Use "Simulate distraction" to test.';
    const pill = $('hud-focus');
    pill.className = 'focus-pill ' + (!st.active ? 'off' : onBreak ? 'break' : st.stage === 'ok' ? 'on' : st.stage);
    pill.textContent = !st.active ? 'Focus off' : onBreak ? `☕ Break ${shown}` : st.stage === 'ok' ? `${pomo ? '🍅' : 'Focusing'} ${shown}`
      : st.stage === 'warning' ? `⚠ ${st.offender}` : `▼ Losing points`;
    $('focus-status').textContent = !st.active ? 'Not focusing' : onBreak ? 'Relax! Distractions are allowed on breaks.'
      : st.stage === 'ok' ? 'Focused ✓' : st.offender_kind === 'app'
        ? `${st.offender} is still running! Timer paused until you end it in Task Manager.`
        : `Distracted by ${st.offender}! Timer paused.`;
    if (S && st.points !== S.points) { S.points = st.points; updatePoints(st.points); }

    // warning banner
    const banner = $('warning');
    if (st.active && st.stage !== 'ok') {
      const t = timings();
      banner.classList.remove('hidden');
      banner.classList.toggle('soft', st.stage === 'warning');
      $('warn-text').textContent = st.stage === 'warning'
        ? `Close ${st.offender} within ${Math.max(0, t.grace - st.distracted_for)}s or you start losing points!`
        : `Losing points! ${st.offender} gets force-closed in ${Math.max(0, t.force - st.distracted_for)}s`;
      // Apps like Discord keep running in the system tray after you close the window,
      // so the session stays paused until the process is really gone.
      const isApp = st.offender_kind === 'app';
      $('warn-app').classList.toggle('hidden', !isApp);
      banner.classList.toggle('has-action', isApp); // no shaking, so the button is easy to click
      if (isApp) $('warn-app-text').textContent = `Closing the window isn't enough. ${st.offender} keeps running in the background `
        + `until you quit it from the system tray or end it in Task Manager (Ctrl+Shift+Esc → ${st.offender} → End task).`;
    } else banner.classList.add('hidden');

    for (const ev of st.events) {
      lastEventId = Math.max(lastEventId, ev.id);
      handleFocusEvent(ev);
    }
  } catch { /* backend restarting */ }
  setTimeout(pollFocus, 1000);
}

function handleFocusEvent(ev) {
  const now = Date.now();
  if (ev.type === 'warning') {
    voice.sfx('warning');
    lastYellAt = now;
    yell('warning', ev.app);
  } else if (ev.type === 'drain') {
    floater(`-${ev.points} ◆`, 'bad');
    if (now - lastYellAt > 9000) { lastYellAt = now; yell('drain', ev.app); }
    else character.setEmotion('angry', 4);
  } else if (ev.type === 'close') {
    lastYellAt = now;
    yell('close', ev.app);
  } else if (ev.type === 'recovered') {
    yell('recovered', ev.app, 'relaxed');
  } else if (ev.type === 'break_start') {
    voice.sfx('level_up');
    floater(`🍅 Round done! +${ev.points} ◆`, 'big');
    addMsg('sys', `🍅 Pomodoro finished! +${ev.points} bonus points. Break: ${ev.app}.`);
    lastYellAt = now;
    yell('break_start', ev.app, 'happy');
  } else if (ev.type === 'break_over') {
    voice.sfx('warning');
    yell('break_over', '', 'relaxed');
  }
}

// ======================= Gacha =======================
function renderGacha() {
  const g = S.gacha;
  $('pull1').textContent = `Wish ×1 · ${g.pull_cost} ◆`;
  $('pull10').textContent = `Wish ×10 · ${g.ten_pull_cost} ◆`;
  $('pull1').disabled = S.points < g.pull_cost;
  $('pull10').disabled = S.points < g.ten_pull_cost;
  $('pity-text').textContent = `Pity: ${S.pity.since_legendary} / ${g.pity_limit} (Legendary+ guaranteed)`;
  $('force-row').classList.toggle('hidden', !isDemo());
  $('rates').innerHTML = g.rates.slice().reverse().map(r =>
    `<tr class="r-${r.rarity}"><td class="rarity-label">${r.rarity}</td><td>${(r.chance * 100).toFixed(1)}%</td></tr>`).join('');
  $('collection').innerHTML = S.catalog.characters.map(c => {
    const owned = S.owned_characters[c.id];
    return `<div class="card r-${c.rarity} ${owned ? '' : 'locked'}">
      <div class="swatch r-${c.rarity}" style="background:${c.color}">${owned ? c.name[0] : '?'}</div>
      <b>${owned ? esc(c.name) : '???'}</b><div class="rarity-label">${c.rarity}</div>
      ${owned ? `<small>Bond ${owned.bond}/6</small>` : ''}</div>`;
  }).join('');
}

async function doPull(count) {
  try {
    voice.stopSpeaking();
    const res = await post('/gacha/pull', { count, force_rarity: $('force-rarity').value || null });
    await playCutscene(res.results, res.best_rarity);
    await setState(res.state);
    const news = res.results.filter(r => r.new);
    addMsg('sys', `✨ Pulled: ${res.results.map(r => `${r.name} (${r.rarity})`).join(', ')}`);
    if (news.length) addMsg('sys', `New character! Make ${news.map(n => n.name).join(' or ')} your assistant in ⚙ Settings.`);
  } catch (err) { toastError(err); }
}
$('pull1').addEventListener('click', () => doPull(1));
$('pull10').addEventListener('click', () => doPull(10));

// ======================= Shop =======================
function renderShop() {
  $('shop-acc').innerHTML = S.catalog.accessories.map(a => {
    const owned = S.owned_accessories.includes(a.id);
    const on = S.equipped_accessories.includes(a.id);
    return `<div class="card ${on ? 'selected' : ''}"><div class="swatch" style="background:linear-gradient(135deg,#8b7bff,#ff5fa2)">${accIcon(a.id)}</div>
      <b>${esc(a.name)}</b>
      ${owned ? `<button data-equip="${a.id}" data-on="${!on}">${on ? 'Unequip' : 'Equip'}</button>`
              : `<button data-buy="accessory:${a.id}" ${S.points < a.price ? 'disabled' : ''}>${a.price} ◆</button>`}</div>`;
  }).join('');
  $('shop-bg').innerHTML = S.catalog.backgrounds.map(b => {
    const owned = S.owned_backgrounds.includes(b.id);
    return `<div class="card ${S.background === b.id ? 'selected' : ''}"><div class="swatch" style="background:${b.css}"></div>
      <b>${esc(b.name)}</b>
      ${owned ? `<button data-bg="${b.id}">${S.background === b.id ? 'Using' : 'Use'}</button>`
              : `<button data-buy="background:${b.id}" ${S.points < b.price ? 'disabled' : ''}>${b.price} ◆</button>`}</div>`;
  }).join('');
}
const accIcon = id => ({ cat_ears: '🐱', glasses: '👓', halo: '😇', crown: '👑', witch_hat: '🧙', bow: '🎀' }[id] || '✨');

document.addEventListener('click', async e => {
  const d = e.target.dataset || {};
  try {
    if (d.buy) {
      const [kind, id] = d.buy.split(':');
      await setState(await post('/shop/buy', { kind, id }));
      voice.sfx('task_done');
      say('Ooh, thank you! I love it!', { emotion: 'happy' });
      if (kind === 'accessory') await setState(await post('/equip', { kind, id, on: true }));
    } else if (d.equip) {
      await setState(await post('/equip', { kind: 'accessory', id: d.equip, on: d.on === 'true' }));
      if (d.on === 'true') character.setEmotion('happy', 3);
    } else if (d.bg) {
      await setState(await post('/equip', { kind: 'background', id: d.bg }));
    } else if (d.char) {
      await setState(await post('/equip', { kind: 'character', id: d.char }));
      const c = activeChar();
      say(c.intro_line, { emotion: 'happy' });
    }
  } catch (err) { toastError(err); }
});

// ======================= Teacher =======================
function renderMarkdown(md) {
  const lines = esc(md).split('\n');
  let html = '', list = null;
  const inline = s => s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/`(.+?)`/g, '<code>$1</code>');
  for (const line of lines) {
    const m = line.match(/^\s*([-*]|\d+\.)\s+(.*)/);
    if (m) {
      const tag = /\d/.test(m[1]) ? 'ol' : 'ul';
      if (list !== tag) { if (list) html += `</${list}>`; html += `<${tag}>`; list = tag; }
      html += `<li>${inline(m[2])}</li>`;
      continue;
    }
    if (list) { html += `</${list}>`; list = null; }
    const h = line.match(/^(#{1,3})\s+(.*)/);
    if (h) html += `<h${h[1].length + 1}>${inline(h[2])}</h${h[1].length + 1}>`;
    else if (line.trim()) html += `<p>${inline(line)}</p>`;
  }
  if (list) html += `</${list}>`;
  return html;
}

$('teach-upload').addEventListener('click', async () => {
  const f = $('teach-file').files[0];
  if (!f) return;
  const form = new FormData();
  form.append('file', f);
  $('teach-file-name').textContent = 'Uploading…';
  try {
    await api('/teacher/upload', { method: 'POST', form });
    teachHistory = [];
    $('teach-file-name').textContent = `📄 ${f.name} ready.`;
    await teach('Teach me the key ideas in this file, starting from the basics.');
  } catch (err) { $('teach-file-name').textContent = '⚠ ' + err.message; }
});

$('teach-start').addEventListener('click', () => teach('Teach me the key ideas in this file, starting from the basics.'));
$('teach-form').addEventListener('submit', e => {
  e.preventDefault();
  const q = $('teach-q').value.trim();
  if (q) { $('teach-q').value = ''; teach(q); }
});

async function teach(question) {
  $('lesson').innerHTML = '<p><i>Preparing your lesson…</i></p>';
  try {
    const res = await post('/teacher/ask', { question, history: teachHistory });
    teachHistory.push({ role: 'user', text: question }, { role: 'model', text: res.text });
    $('lesson').innerHTML = renderMarkdown(res.text);
    say(res.speech, { emotion: res.emotion, ja: res.speech_ja });
  } catch (err) { $('lesson').textContent = '⚠ ' + err.message; }
}

// ======================= Settings =======================
function renderSettings() {
  $('char-select').innerHTML = S.catalog.characters.filter(c => S.owned_characters[c.id]).map(c => `
    <div class="card r-${c.rarity} ${c.id === S.active_character ? 'selected' : ''}">
      <div class="swatch r-${c.rarity}" style="background:${c.color}">${c.name[0]}</div>
      <b>${esc(c.name)}</b><div class="rarity-label">${c.rarity}</div>
      <button data-char="${c.id}" ${c.id === S.active_character ? 'disabled' : ''}>${c.id === S.active_character ? 'Active' : 'Choose'}</button>
    </div>`).join('');
  const char = activeChar();
  const p = S.personality_overrides[char.id] || char.personality;
  const presets = ['tsundere', 'cheerful', 'sensei', 'chill', 'rival'];
  if (document.activeElement !== $('personality-custom')) {
    $('personality').value = presets.includes(p) ? p : 'custom';
    $('personality-custom').classList.toggle('hidden', presets.includes(p));
    if (!presets.includes(p)) $('personality-custom').value = p;
  }
  document.querySelectorAll('input[name=vmode]').forEach(r => { r.checked = r.value === S.settings.voice_mode; });
  $('bg-select').innerHTML = S.catalog.backgrounds.filter(b => S.owned_backgrounds.includes(b.id)).map(b => `
    <div class="card ${S.background === b.id ? 'selected' : ''}"><div class="swatch" style="background:${b.css}"></div>
    <b>${esc(b.name)}</b><button data-bg="${b.id}">Use</button></div>`).join('');
  $('sys-status').innerHTML = `<small>ElevenLabs voice: ${elevenOn ? '✅ connected' : '❌ no key (using browser voice)'}<br>
    Tasks done: ${S.stats.tasks_done} · Pulls: ${S.stats.pulls} · Distractions caught: ${S.stats.distractions}</small>`;
}

$('personality').addEventListener('change', () => {
  $('personality-custom').classList.toggle('hidden', $('personality').value !== 'custom');
});
$('save-personality').addEventListener('click', async () => {
  const v = $('personality').value === 'custom' ? $('personality-custom').value.trim() : $('personality').value;
  if (!v) return;
  try {
    await setState(await post('/personality', { character_id: S.active_character, personality: v }));
    addMsg('sys', 'Personality saved.');
  } catch (err) { toastError(err); }
});
document.querySelectorAll('input[name=vmode]').forEach(r => r.addEventListener('change', async () => {
  await setState(await post('/settings', { settings: { voice_mode: r.value } }));
}));
$('reset-btn').addEventListener('click', async () => {
  if (!$('reset-btn').dataset.confirm) {
    $('reset-btn').dataset.confirm = '1';
    $('reset-btn').textContent = 'Click again to confirm reset';
    return;
  }
  delete $('reset-btn').dataset.confirm;
  $('reset-btn').textContent = 'Reset all progress';
  chatHistory = [];
  loadedModelFor = null;
  await setState(await post('/reset'));
});

// ======================= Tabs =======================
document.querySelectorAll('#tabs button').forEach(btn => btn.addEventListener('click', () => {
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b === btn));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + btn.dataset.tab));
}));

// ======================= Start =======================
async function boot() {
  try {
    elevenOn = (await api('/voice/status')).elevenlabs;
    await setState(await api('/state'));
  } catch (e) {
    addMsg('sys', '⚠ Could not reach the backend. Is the Python server running?');
    return;
  }
  renderPomoPicker();
  pollFocus();
  if (elevenOn) voice.preloadSfx(['task_done', 'level_up', 'warning', 'gacha_charge', 'gacha_meteor',
    'reveal_common', 'reveal_epic', 'reveal_gold', 'reveal_unbound']);
  // Daily login gift (once per calendar day)
  let daily = null;
  try { daily = await post('/daily'); await setState(daily.state); } catch (e) { console.warn(e); }

  const c = activeChar();
  addMsg('bot', `${c.intro_line}`);
  if (daily?.claimed) addMsg('sys', `🎁 Daily gift: +${daily.gift} ◆ (day ${daily.streak} streak${daily.streak >= 7 ? ', max bonus!' : ''})`);
  const reminder = reminderLine();
  if (reminder) addMsg('sys', '⏰ ' + reminder);
  character.wave(3);

  // Browsers block sound until the first click, so greet out loud on the first interaction.
  const greet = async () => {
    if (Date.now() - lastPokeLine < 500) await new Promise(r => setTimeout(r, 3500)); // let the poke reaction finish
    character.wave(2.5);
    const h = new Date().getHours();
    const stage = h >= 5 && h < 11 ? 'greet_morning' : h < 17 && h >= 11 ? 'greet_afternoon' : h >= 17 && h < 22 ? 'greet_evening' : 'greet_night';
    try {
      const line = await post('/yell', { stage });
      await say(line.tts_text, { emotion: stage === 'greet_night' ? 'surprised' : 'happy', expressive: true });
    } catch { await say(c.intro_line, { emotion: 'happy' }); }
    if (daily?.claimed) {
      voice.sfx('task_done');
      floater(`🎁 +${daily.gift} ◆`, 'big');
      await say(`Here's your daily gift: ${daily.gift} points! ${daily.streak > 1 ? `That's a ${daily.streak} day streak!` : 'Come back tomorrow for more!'}`, { emotion: 'happy' });
    }
    if (reminder) await say(reminder, { emotion: reminder.includes('overdue') ? 'angry' : 'surprised' });
  };
  document.addEventListener('pointerdown', greet, { once: true });
}
boot();
