// Main UI logic: connects the game-style menus to the backend and the 3D character.
import { api, post } from './api.js';
import { Character } from './character.js';
import { accessoryThumbs } from './accessories.js';
import { Environment } from './environment.js';
import * as voice from './voice.js';
import { playCutscene, stars, portrait, portraitImg, LOTUS } from './gacha.js';
import * as vfx from './vfx.js';

const $ = id => document.getElementById(id);
/** Escapes text for HTML and draws the points symbol (written ◆ in messages) as the lotus. */
const rich = text => esc(text).replaceAll('◆', LOTUS);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let S = null;            // full game state from the backend
let chatHistory = [];
let loadedModelFor = null;
let lastPoints = null;
let lastEventId = 0;
let lastYellAt = 0;
let elevenOn = false;
const character = new Character($('stage'), voice.mouthLevel);
const environment = new Environment($('env'), $('envfx'));
window.character = character; // handy for debugging in DevTools (F12)
window.environment = environment;

const charById = id => S.catalog.characters.find(c => c.id === id);
const activeChar = () => charById(S.active_character);
const isDemo = () => !!S.settings.demo_mode;

// Personality types double as the character "classes" shown in the menus (︎ keeps the symbols flat, not emoji)
const emblem = paths => `<svg class="emblem" viewBox="0 0 24 24">${paths}</svg>`;
const CLASSES = {
  tsundere: ['Tsundere', emblem('<path d="M12 20.5s-7.5-4.7-7.5-10.3A4.2 4.2 0 0 1 12 7.6a4.2 4.2 0 0 1 7.5 2.6c0 5.600-7.500 10.300-7.500 10.300z"/><path d="M12 10.800v4.400M9.800 13h4.400"/>')],
  cheerful: ['Cheerful', emblem('<circle cx="12" cy="12" r="3.600"/><path d="M12 2.500v3M12 18.500v3M2.500 12h3M18.500 12h3M5.300 5.300l2.100 2.100M16.600 16.600l2.100 2.100M5.300 18.700l2.100-2.100M16.600 7.400l2.100-2.100"/>')],
  sensei: ['Sensei', emblem('<path d="M12 8v12.500M12 8c-2-1.600-5-2-8-1.400v12.500c3-.6 6-.2 8 1.400M12 8c2-1.600 5-2 8-1.400v12.500c-3-.6-6-.2-8 1.400"/><path d="M12 1.500l.8 1.900 1.900.8-1.900.8-.8 1.900-.8-1.900-1.900-.8 1.900-.8z"/>')],
  chill: ['Chill', emblem('<path d="M12 2.500v19M3.800 7.250l16.400 9.500M20.200 7.250L3.800 16.750M12 6l-2-2M12 6l2-2M12 18l-2 2M12 18l2 2M6.800 9l-2.700.700M6.800 9l.700-2.700M17.200 15l2.700-.700M17.200 15l-.700 2.700"/>')],
  rival: ['Rival', emblem('<path d="M4 4l11 11M20 4L9 15M4 4v3M4 4h3M20 4v3M20 4h-3M13.500 16.500l3 3M10.500 16.500l-3 3M15.500 12.500l2.500 2.500M8.500 12.500L6 15"/>')],
};
const classOf = c => CLASSES[c.personality] || ['Unique', emblem('<path d="M12 2l2.200 7.800L22 12l-7.800 2.200L12 22l-2.200-7.800L2 12l7.800-2.200z"/>')];

// ======================= Speaking =======================
let bubbleTimer = null;
let typeTimer = null;
let sayGen = 0; // the newest line wins; an older one that is still being prepared gives up
function showBubble(text, sub = '') {
  $('bubble-name').textContent = activeChar().name;
  $('bubble-sub').textContent = sub;
  $('bubble').classList.remove('hidden');
  clearTimeout(bubbleTimer);
  clearInterval(typeTimer);
  // JRPG-style typewriter text
  const el = $('bubble-text');
  let i = 0;
  el.textContent = '';
  typeTimer = setInterval(() => {
    i += 2;
    el.textContent = text.slice(0, i);
    if (i >= text.length) clearInterval(typeTimer);
  }, 28);
}

const stripTags = text => text.replace(/\[[^\]]+\]\s*/g, '');

/** Splits a long line into sentence-sized pieces, so each is shown and spoken on its own. Short lines stay whole. */
function splitSpeech(text) {
  const japanese = /[\u3040-\u30ff\u4e00-\u9fff]/.test(text);
  const limit = japanese ? 60 : 150;
  const pieces = text.match(/[^.!?…。！？]+[.!?…。！？]+["”』」)]*\s*|[^.!?…。！？]+$/g) || [text];
  const out = [];
  let cur = '';
  for (const p of pieces) {
    if (cur && (cur + p).length > limit) { out.push(cur.trim()); cur = ''; }
    cur += p;
  }
  if (cur.trim()) out.push(cur.trim());
  return out.length ? out : [text];
}

/** Japanese version of a line (for sub mode). The server remembers translations, and so do we. */
const jaMemo = new Map();
async function toJa(text) {
  const key = S.active_character + '|' + text;
  if (!jaMemo.has(key)) {
    try { jaMemo.set(key, (await post('/ja', { text })).ja || ''); } catch { return ''; }
  }
  return jaMemo.get(key);
}

async function say(text, { emotion = 'neutral', ja = '', expressive = false, seconds } = {}) {
  if (!text) return;
  const my = ++sayGen;
  const char = activeChar();
  // In sub mode EVERY line is spoken in Japanese with English subtitles, not just chat replies
  if (S.settings.voice_mode === 'sub' && !ja) {
    ja = await toJa(text);
    if (my !== sayGen) return;
  }
  const sub = S.settings.voice_mode === 'sub' && ja;
  const shown = stripTags(text);
  const parts = splitSpeech(sub ? ja : text);
  const subs = sub ? splitSpeech(shown) : [];
  const paired = subs.length === parts.length; // subtitles follow sentence by sentence when the counts line up
  character.setEmotion(emotion, seconds || Math.max(3, shown.length / 12));
  clearTimeout(bubbleTimer);
  const finished = await voice.speakParts(parts, { characterId: char.id, expressive, lang: sub ? 'ja' : 'en', gender: char.gender },
    i => showBubble(stripTags(parts[i]), sub ? (paired ? subs[i] : shown) : ''));
  if (finished && my === sayGen) bubbleTimer = setTimeout(() => $('bubble').classList.add('hidden'), 2200);
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
  const b = e.target.closest?.('button, input[type=checkbox], input[type=radio], .check, .ccard');
  if (uiSounds && b && !b.disabled) voice.uiClick();
}, true);
$('ui-sounds').checked = uiSounds;
$('ui-sounds').addEventListener('change', () => {
  uiSounds = $('ui-sounds').checked;
  try { localStorage.setItem('uiSounds', uiSounds ? 'on' : 'off'); } catch { /* storage blocked */ }
});

// a little sparkle wherever you click
document.addEventListener('pointerdown', e => { if (!e.target.closest?.('#cutscene')) vfx.clickSpark(e.clientX, e.clientY); }, true);

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
  if (chatBusy || voice.isSpeaking() || now - lastPokeLine < 2500) return; // one voice line at a time
  if (spam) pokeTimes = [];
  lastPokeLine = now;
  try {
    const line = await post('/yell', { stage: spam ? 'poke_spam' : zone === 'head' ? 'headpat' : 'poke' });
    await say(line.tts_text, { emotion: spam ? 'angry' : zone === 'head' ? 'happy' : 'surprised', expressive: true });
  } catch (e) { console.warn(e); }
};

function floater(text, cls = '') {
  const f = document.createElement('div');
  f.className = 'floater ' + cls;
  f.innerHTML = rich(text);
  f.style.left = (Math.random() * 80 - 40) + 'px';
  $('floaters').appendChild(f);
  setTimeout(() => f.remove(), 1900);
}

/** Small notice at the top of the screen. */
function toast(text, html = null) {
  const t = document.createElement('div');
  t.className = 'toast' + (html ? ' card' : '');
  t.innerHTML = html || rich(text);
  $('toasts').appendChild(t);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  setTimeout(() => t.remove(), 4600);
}

/** Adds a line to the Log. System lines also pop up as a notice. */
function addMsg(role, text, quiet = false) {
  const m = document.createElement('div');
  m.className = 'msg ' + role;
  m.innerHTML = rich(text);
  $('chat-log').appendChild(m);
  $('chat-log').scrollTop = 1e9;
  if (role === 'sys' && !quiet) toast(text);
}

function toastError(e) { addMsg('sys', '⚠ ' + (e.message || e)); }

// ======================= Menus (dock, drawer, full screens, keyboard) =======================
const FULL = ['gacha', 'chars']; // these take over the whole screen; everything else is a side drawer
let currentTab = null;

function wipe() {
  const w = $('wipe');
  w.classList.remove('go');
  void w.offsetWidth; // restart the animation
  w.classList.add('go');
}

function applyShift() {
  const px = document.body.dataset.view === 'drawer' ? $('drawer').offsetWidth + 16 : 0; // (the dressing room keeps the character centred)
  document.body.style.setProperty('--shift', px + 'px');
  character.setShift(px);
}

/** Picks the backdrop: your room in the lobby and menus, each banner's themed room on Convene, and in the
 *  dressing room a soft glow in the character's colour (or the room you are looking at in the Rooms list). */
function applyEnv() {
  if (currentTab === 'gacha') {
    const banners = S.catalog.banners || [];
    environment.set((banners.find(b => b.id === bannerId) || banners[0])?.scene || S.background);
  } else if (currentTab === 'dress') {
    if (dressCat === 'room') environment.set(picked?.kind === 'background' ? picked.id : S.background);
    else environment.set('soft', activeChar().color);
  } else environment.set(S.background);
}

function openTab(name) {
  if (name === currentTab) name = null; // pressing the same button again closes the menu
  if (name === 'dress') dressReturn = currentTab && currentTab !== 'dress' ? currentTab : null;
  const isFull = FULL.includes(name);
  if (isFull || FULL.includes(currentTab)) wipe();
  currentTab = name;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.id === 'tab-' + name));
  document.querySelectorAll('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
  document.body.dataset.view = !name ? 'lobby' : isFull ? 'full' : name === 'dress' ? 'dress' : 'drawer';
  document.body.dataset.tab = name || '';
  character.paused = isFull;
  if (picked) { picked = null; applyTry(); } // stop previewing things when leaving or re-entering
  if (name && !isFull && name !== 'dress') $('drawer-title').textContent = $('tab-' + name).dataset.title;
  $('rates-pop').classList.add('hidden');
  applyShift();
  character.setDressing(name === 'dress');
  if (name !== 'dress') setFrame('full');
  if (name === 'chat') $('chat-log').scrollTop = 1e9;
  if (name === 'chars') { charPick = S.active_character; renderChars(); }
  if (name === 'dress') renderDress();
  applyEnv();
}
let dressReturn = null; // the menu the dressing room was opened from
const closeTab = () => {
  const back = currentTab === 'dress' ? dressReturn : null;
  dressReturn = null;
  openTab(back);
};

document.querySelectorAll('#tabs button').forEach(btn => btn.addEventListener('click', () => openTab(btn.dataset.tab)));
addEventListener('resize', applyShift);
$('rates-btn').addEventListener('click', () => $('rates-pop').classList.toggle('hidden'));

addEventListener('keydown', e => {
  if (!S || !$('cutscene').classList.contains('hidden') || e.ctrlKey || e.altKey || e.metaKey) return;
  const typing = e.target.matches?.('input, textarea, select');
  if (e.key === 'Escape') {
    if (typing) e.target.blur();
    if (currentTab) closeTab();
    return;
  }
  if (typing) return;
  if (e.key === 'Enter' || e.key === '/') {
    if (FULL.includes(currentTab)) return;
    e.preventDefault();
    $('chat-input').focus();
    return;
  }
  const btn = document.querySelector(`#tabs button[data-key="${e.key.toLowerCase()}"]`);
  if (btn) { voice.uiClick(); openTab(btn.dataset.tab); }
});

// ======================= Rendering =======================
async function setState(newState) {
  S = newState;
  render();
  const char = activeChar();
  if (loadedModelFor !== char.id) {
    loadedModelFor = char.id;
    const ok = await character.load(`/models/${char.model}`, char.color);
    $('model-hint').classList.toggle('hidden', ok);
    $('model-hint').textContent = `Placeholder shown: export ${char.name} from VRoid Studio as models/${char.model}`;
  }
  character.setPersonality(S.personality_overrides[char.id] || char.personality); // how they stand while idle
  applyTry();
}

function render() {
  const char = activeChar();
  // HUD
  $('hud-char').textContent = char.name;
  $('hud-title').textContent = char.title || '';
  $('hud-avatar-fallback').textContent = char.name[0];
  const av = $('hud-avatar');
  if (av.dataset.id !== char.id) {
    av.dataset.id = char.id;
    av.style.display = '';
    av.onerror = () => { av.style.display = 'none'; };
    av.onload = () => { $('hud-avatar-fallback').textContent = ''; }; // the letter is only for characters without a picture
    av.src = portrait(char.id, true);
  }
  $('hud-level').textContent = S.level;
  $('hud-xp').style.width = (100 * S.xp / S.xp_to_next) + '%';
  $('hud-xptext').textContent = `${S.xp} / ${S.xp_to_next} XP`;
  updatePoints(S.points);
  applyEnv();

  renderTasks();
  renderFocusSettings();
  renderGacha();
  renderChars();
  renderDress();
  renderOptions();
}

function updatePoints(p) {
  const el = $('hud-points');
  el.textContent = p;
  $('gacha-points').textContent = p;
  if (lastPoints !== null && p !== lastPoints) {
    const box = el.parentElement;
    box.classList.remove('flash-red', 'flash-green');
    void box.offsetWidth;
    box.classList.add(p < lastPoints ? 'flash-red' : 'flash-green');
  }
  lastPoints = p;
}

// ======================= Chat =======================
let chatBusy = false; // one message at a time: wait for the reply before sending the next
function setChatBusy(on) {
  chatBusy = on;
  $('chat-input').disabled = on;
  $('mic-btn').disabled = on;
  $('chat-form').querySelector('button[type=submit]').disabled = on;
  $('chat-input').placeholder = on ? `${activeChar().name} is thinking…` : 'Press Enter to talk… (try: remind me to study at 5pm)';
}

$('chat-form').addEventListener('submit', async e => {
  e.preventDefault();
  const text = $('chat-input').value.trim();
  if (!text || chatBusy) return;
  $('chat-input').value = '';
  await sendChat(text);
});

async function sendChat(text) {
  if (chatBusy) return;
  setChatBusy(true);
  addMsg('user', text);
  voice.stopSpeaking();
  sayGen++;
  showBubble('…');
  try {
    const res = await post('/chat', { message: text, history: chatHistory });
    chatHistory.push({ role: 'user', text }, { role: 'model', text: res.lesson ? `${res.reply}\n\n${res.lesson.markdown}` : res.reply });
    addMsg('bot', res.reply);
    for (const t of res.added_tasks) addMsg('sys', t.source === 'ai' ? `✦ ${activeChar().name} gave you a quest: ${t.title}` : `📝 New quest: ${t.title}${t.due ? ' (due ' + t.due + ')' : ''}`);
    if (res.added_tasks.length) voice.sfx('task_done');
    await setState(res.state);
    for (const ev of res.added_events || []) addMsg('sys', `🗓 Scheduled: ${ev.title} · ${whenLabel(ev.start)}`);
    for (const n of res.added_notes || []) addMsg('sys', `📝 Noted: ${n.text}`);
    if (res.lesson) showLesson(res.lesson);
    else if ((res.added_events || []).length || (res.added_notes || []).length) { // show where it went
      setQuestSub((res.added_events || []).length ? 'schedule' : 'notes');
      if (currentTab !== 'tasks') openTab('tasks');
      voice.sfx('task_done');
    }
    say(res.reply, { emotion: res.emotion, ja: res.reply_ja });
  } catch (err) { $('bubble').classList.add('hidden'); toastError(err); }
  setChatBusy(false);
}

// ---- lessons: for bigger questions the Log opens with a written explanation and pictures ----
function renderMarkdown(md) {
  const lines = esc(md).split('\n');
  let html = '', list = null;
  const inline = t => t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*(.+?)\*/g, '<i>$1</i>').replace(/`(.+?)`/g, '<code>$1</code>');
  for (const line of lines) {
    const m = line.match(/^\s*([-*]|\d+\.)\s+(.*)/);
    if (m) {
      const tag = /\d/.test(m[1]) ? 'ol' : 'ul';
      if (list !== tag) { if (list) html += `</${list}>`; html += `<${tag}>`; list = tag; }
      html += `<li>${inline(m[2])}</li>`;
      continue;
    }
    if (list) { html += `</${list}>`; list = null; }
    const h = line.match(/^(#{1,4})\s+(.*)/);
    if (h) html += `<h4>${inline(h[2])}</h4>`;
    else if (line.trim()) html += `<p>${inline(line)}</p>`;
  }
  if (list) html += `</${list}>`;
  return html;
}

function showLesson(lesson) {
  const card = document.createElement('div');
  card.className = 'lesson';
  const safeUrl = u => /^https:\/\//.test(u || '') ? esc(u) : '';
  card.innerHTML = `<div class="lesson-title">${esc(lesson.title)}</div>
    ${lesson.images.length ? `<div class="lesson-images">${lesson.images.map(im => safeUrl(im.url)
      ? `<a href="${safeUrl(im.link)}" target="_blank" rel="noopener"><img src="${safeUrl(im.url)}" alt=""><span>${esc(im.caption)}</span></a>` : '').join('')}</div>` : ''}
    <div class="lesson-body">${renderMarkdown(lesson.markdown)}</div>`;
  $('chat-log').appendChild(card);
  if (currentTab !== 'chat') openTab('chat');
  card.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

$('mic-btn').addEventListener('click', async () => {
  const btn = $('mic-btn');
  if (chatBusy) return;
  if (!voice.isRecording()) {
    try {
      voice.stopSpeaking();
      await voice.startRecording();
      btn.classList.add('recording');
      $('chat-input').placeholder = 'Listening… click the mic again to send';
    } catch (e) { toastError('Microphone not available: ' + e.message); }
  } else {
    btn.classList.remove('recording');
    $('chat-input').placeholder = 'Transcribing…';
    try {
      const text = await voice.stopRecording();
      if (text) await sendChat(text);
      else addMsg('sys', "Didn't catch that. Try again?");
    } catch (e) { toastError(e); }
    if (!chatBusy) $('chat-input').placeholder = 'Press Enter to talk… (try: remind me to study at 5pm)';
  }
});

// ======================= Quests (tasks) =======================
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

/** What the companion should say about deadlines, or '' if nothing is urgent. */
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
  const html = `
    <div><b>${streak}</b><small>day streak</small></div>
    <div><b>${h ? h + 'h ' : ''}${m}m</b><small>focused (week)</small></div>
    <div><b>${w.tasks}</b><small>quests (week)</small></div>
    <div><b>${S.stats.pomodoros || 0}</b><small>pomodoros</small></div>`;
  $('week-card').innerHTML = html;
  $('tracker-week').innerHTML = html;
  $('hud-streak').textContent = streak;
  $('hud-streak').title = `${streak}-day streak (best: ${S.login?.best || streak}). Open the app every day for a bigger daily gift!`;
}

const questRow = (t, withDelete) => `
  <li><span class="diff ${t.difficulty}">${t.difficulty}</span>${t.source === 'ai' ? '<span class="ai-tag" title="Suggested by your companion">✦</span>' : ''}
    <span class="t">${esc(t.title)}${t.due ? `<span class="due ${dueInfo(t.due).cls}">${esc(dueInfo(t.due).label)}</span>` : ''}</span>
    <button data-done="${t.id}" title="Complete">✓</button>${withDelete ? `<button class="ghost" data-del="${t.id}" title="Delete">✕</button>` : ''}</li>`;

function renderTasks() {
  renderWeek();
  renderPlanner();
  const pending = S.tasks.filter(t => !t.done)
    .map((t, i) => ({ t, i, d: dueInfo(t.due) }))
    .sort((a, b) => (a.d?.day || '9999z').localeCompare(b.d?.day || '9999z') || a.i - b.i) // soonest deadline first
    .map(x => x.t);
  const done = S.tasks.filter(t => t.done).slice(-20).reverse();
  const empty = '<li class="empty"><span class="t">No active quests. Add one, or ask your companion to plan your week.</span></li>';
  $('task-list').innerHTML = pending.length ? pending.map(t => questRow(t, true)).join('') : empty;
  $('tracker-list').innerHTML = pending.length ? pending.slice(0, 4).map(t => questRow(t, false)).join('')
    + (pending.length > 4 ? `<li class="empty"><span class="t">+${pending.length - 4} more…</span></li>` : '') : empty;
  $('done-list').innerHTML = done.map(t => `<li><span class="t">${esc(t.title)}</span></li>`).join('');
}

// ======================= Schedule + Notes (inside the Quests menu) =======================
let questSub = 'quests'; // quests | schedule | notes
function setQuestSub(name) {
  questSub = name;
  document.querySelectorAll('#quest-tabs button').forEach(b => b.classList.toggle('active', b.dataset.sub === name));
  for (const s of ['quests', 'schedule', 'notes']) $('sub-' + s).classList.toggle('hidden', s !== name);
}

/** "Today 2:00 PM", "Tomorrow 9:30 AM", "Fri, Oct 9 2:00 PM" */
function whenLabel(start) {
  const d = new Date(start), now = new Date();
  const tmr = new Date(now); tmr.setDate(now.getDate() + 1);
  const day = localISO(d) === localISO(now) ? 'Today' : localISO(d) === localISO(tmr) ? 'Tomorrow'
    : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return `${day} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}

function renderPlanner() {
  const now = Date.now();
  const events = [...(S.events || [])].sort((a, b) => a.start.localeCompare(b.start));
  const ended = e => new Date(e.start).getTime() + e.minutes * 60000 < now;
  $('event-list').innerHTML = events.length ? events.map(e => `
    <li class="${ended(e) ? 'past' : ''}"><span class="when">${esc(whenLabel(e.start))}</span>
      <span class="t">${esc(e.title)} <small>${e.minutes} min</small></span>
      <button class="ghost" data-delevent="${e.id}" title="Remove">✕</button></li>`).join('')
    : '<li class="empty"><span class="t">Nothing scheduled yet.</span></li>';
  const notes = [...(S.notes || [])].reverse();
  $('note-list').innerHTML = notes.length ? notes.map(n => `
    <li><span class="t">${esc(n.text)}</span><button class="ghost" data-delnote="${n.id}" title="Remove">✕</button></li>`).join('')
    : '<li class="empty"><span class="t">No notes yet.</span></li>';
  const tabs = $('quest-tabs').children; // show how many of each there are
  tabs[1].textContent = `Schedule${events.filter(e => !ended(e)).length ? ` (${events.filter(e => !ended(e)).length})` : ''}`;
  tabs[2].textContent = `Notes${notes.length ? ` (${notes.length})` : ''}`;
  const next = events.find(e => new Date(e.start).getTime() > now);
  $('tracker-next').classList.toggle('hidden', !next);
  if (next) $('tracker-next').innerHTML = `<b>Next up</b> ${esc(next.title)} <span>${esc(whenLabel(next.start))}</span>`;
}

$('event-form').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const res = await post('/events', { title: $('event-title').value, start: $('event-start').value });
    $('event-title').value = '';
    await setState(res.state);
  } catch (err) { toastError(err); }
});
$('note-form').addEventListener('submit', async e => {
  e.preventDefault();
  try {
    const res = await post('/notes', { text: $('note-text').value });
    $('note-text').value = '';
    await setState(res.state);
  } catch (err) { toastError(err); }
});

// Every so often the companion reminds you about quests that are overdue or due today / tomorrow
let lastReminder = Date.now();
setInterval(() => {
  if (!S || chatBusy || voice.isSpeaking() || currentTab || focusActive || Date.now() - lastReminder < 30 * 60000) return;
  const line = reminderLine();
  if (!line) return;
  lastReminder = Date.now();
  addMsg('sys', '⏰ ' + line);
  say(line, { emotion: line.includes('overdue') ? 'angry' : 'surprised' });
}, 60000);

/** When a scheduled session starts, the companion says so (once). Sessions missed while the app was closed are just marked. */
async function checkEvents() {
  if (!S) return;
  const now = Date.now();
  for (const e of S.events || []) {
    const at = new Date(e.start).getTime();
    if (e.notified || at > now) continue;
    e.notified = true;
    try { await setState(await post(`/events/${e.id}/notified`)); } catch { continue; }
    if (now - at < 30 * 60000) {
      voice.sfx('level_up');
      addMsg('sys', `⏰ It's time: ${e.title}`);
      character.wave(2.5);
      say(`It's time for ${e.title}! Let's get started.`, { emotion: 'happy' });
    }
  }
}
setInterval(checkEvents, 20000);

async function completeTask(id, from) {
  const res = await post(`/tasks/${id}/complete`);
  voice.sfx('task_done');
  floater(`+${res.xp_gained} XP  +${res.points_gained} ◆`);
  const [x, y] = vfx.at(from); // the reward bursts out of the button you pressed and flies to your points
  vfx.burst(x, y, '#ffd27a', 36);
  vfx.flyTo(x, y, $('hud-points').parentElement, LOTUS, 7);
  await setState(res.state);
  if (res.levels_gained) {
    voice.sfx('level_up');
    vfx.levelUp(res.state.level);
    floater(`LEVEL UP! +${res.level_bonus} ◆`, 'big');
    yell('levelup', '', 'surprised');
  } else {
    yell('praise', '', 'happy');
  }
}

$('plan-btn').addEventListener('click', async () => {
  const goals = $('plan-goals').value.trim();
  if (!goals) return;
  $('plan-btn').disabled = true;
  $('plan-btn').textContent = 'Planning…';
  try {
    const res = await post('/plan', { goals });
    await setState(res.state);
    addMsg('sys', `🗓 Added ${res.added_tasks.length} quests to your week.`);
    say(res.reply, { emotion: res.emotion });
  } catch (err) { toastError(err); }
  $('plan-btn').disabled = false;
  $('plan-btn').textContent = 'Make my plan';
});

// ======================= Focus =======================
let focusActive = false;
let focusSynced = false; // true once the first status check has caught up with past events
let pomoChoice = 25; // 0 = free session, 25 / 50 = pomodoro minutes
try { const saved = localStorage.getItem('pomoChoice'); if (saved !== null) pomoChoice = +saved; } catch { /* storage blocked */ }
const BREAK_FOR = { 25: 5, 50: 10 };
const fmt = sec => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;

function pomoHint(m) {
  return m ? `${m} min work, then a ${BREAK_FOR[m]} min break. The timer pauses while you're distracted. Earn 5 points + 2 XP per focused minute, plus a bonus for every finished round.`
    : 'Free session: counts up until you end it. Earn 5 points + 2 XP per focused minute.';
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
    addMsg('sys', 'Focus rules saved.');
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
      if (res.levels_gained) { voice.sfx('level_up'); vfx.levelUp(res.state.level); yell('levelup', '', 'surprised'); }
    }
  } catch (err) { toastError(err); }
});

// Distractions only count during a focus session, so simulating one starts a (free) session if none is running
async function simulate(body) {
  try {
    const res = await post('/focus/simulate', body);
    if (res.started_session) addMsg('sys', 'Started a focus session to show the distraction. The warning appears in a second.');
  } catch (err) { toastError(err); }
}
$('sim-on').addEventListener('click', () => simulate({ name: 'YouTube', on: true }));
$('sim-app').addEventListener('click', () => simulate({ name: 'discord.exe', kind: 'app', on: true }));
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
    pill.className = 'pill focus-pill ' + (!st.active ? 'off' : onBreak ? 'break' : st.stage === 'ok' ? 'on' : st.stage);
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
      if (focusSynced) handleFocusEvent(ev); // (the first check only catches up: old warnings must not replay when the app opens)
    }
    focusSynced = true;
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

// ======================= Convene (gacha) =======================
let bannerId = null;
let shownBanner = null;

function renderGacha() {
  const g = S.gacha;
  const banners = S.catalog.banners || [];
  const b = banners.find(x => x.id === bannerId) || banners[0];
  $('pull1').innerHTML = `${LOTUS}×${g.pull_cost}&nbsp;&nbsp; Summon ×1`;
  $('pull10').innerHTML = `${LOTUS}×${g.ten_pull_cost}&nbsp;&nbsp; Summon ×10`;
  $('pull1').disabled = S.points < g.pull_cost;
  $('pull10').disabled = S.points < g.ten_pull_cost;
  $('pity-limit').textContent = g.pity_limit;
  $('pity-text').textContent = `Pity: ${S.pity.since_legendary} / ${g.pity_limit}`;
  if (bannerId && !banners.some(x => x.id === bannerId)) { bannerId = null; shownBanner = null; } // that banner rotated out
  $('force-row').classList.toggle('hidden', !isDemo());
  $('rates').innerHTML = g.rates.slice().reverse().map(r =>
    `<tr class="r-${r.rarity}"><td class="rarity-label">${r.rarity}</td><td>${(r.chance * 100).toFixed(1)}%</td></tr>`).join('');
  if (!b || shownBanner === b.id) return; // only redraw the art when the banner changes (it animates in)
  shownBanner = bannerId = b.id;
  applyEnv(); // each banner has its own themed backdrop
  $('banner-list').innerHTML = banners.map(x => `
    <button class="bthumb ${x.id === b.id ? 'active' : ''}" data-banner="${x.id}" title="${esc(x.name)}">
      ${x.tag ? `<span class="tag">${esc(x.tag)}</span>` : ''}${x.featured.map(id => portraitImg(id, true)).join('')}</button>`).join('');
  $('banner-kind').textContent = b.kind;
  $('banner-title').textContent = b.name;
  $('banner-glyph').textContent = b.name;
  $('banner-art').innerHTML = b.featured.map((id, i) => {
    const c = charById(id);
    return `<div class="art a${i} r-${c.rarity}"><div class="initial">${esc(c.name[0])}</div>${portraitImg(id)}
      <div class="plate"><i>${classOf(c)[1]}</i><div><b>${esc(c.name)}</b><div class="stars">${stars(c.rarity)}</div></div></div></div>`;
  }).join('');
}

/** After a summon: one tidy card with the new companions' faces and what the rest turned into. */
function summonSummary(results) {
  const news = results.filter(r => r.new);
  const best = results.filter(r => r.type === 'character' && !r.new);
  const gained = results.reduce((sum, r) => sum + (r.refund || 0), 0);
  addMsg('sys', `✨ Summoned: ${results.map(r => `${r.name} (${r.rarity})`).join(', ')}`, true); // the full list goes in the Log only
  toast('', `<div class="st-title">✦ Summon complete</div>
    ${news.length ? `<div class="st-row">${news.map(n => `<span class="st-char r-${n.rarity}">${portraitImg(n.id, true)}<b>${esc(n.name)}</b><small>NEW</small></span>`).join('')}</div>` : ''}
    <div class="st-sub">${[news.length ? 'Meet them in Characters (C)' : '', best.length ? `${best.length} bond up` : '', gained ? `+${gained} ${LOTUS}` : ''].filter(Boolean).join(' · ') || 'Better luck next time'}</div>`);
  if (news.length) { vfx.confetti(90); vfx.burst(innerWidth / 2, innerHeight * 0.3, '#ff8fc4', 50); }
}

async function doPull(count) {
  try {
    voice.stopSpeaking();
    const res = await post('/gacha/pull', { count, force_rarity: $('force-rarity').value || null, banner: bannerId });
    environment.paused = true;
    character.paused = true; // the summon has its own 3D stage; rest the lobby while it plays
    await playCutscene(res.results, res.best_rarity, {
      japanese: S.settings.voice_mode === 'sub',
      // each character is revealed in front of their own signature scene, tinted with their colour
      details: r => {
        const c = r.type === 'character' ? charById(r.id) : null;
        return {
          icon: c ? classOf(c)[1] : classOf({})[1], color: c?.color || '#9aa5b1', backdrop: environment.thumb(c?.scene || S.background, 1280, 720),
          model: c ? `/models/${c.model}` : null, personality: c?.personality, // the real 3D model makes its entrance
        };
      },
    }).finally(() => { environment.paused = false; character.paused = FULL.includes(currentTab); });
    await setState(res.state);
    const news = res.results.filter(r => r.new);
    summonSummary(res.results);
  } catch (err) { toastError(err); }
}
// The limited banners change every hour: show the countdown, and fetch the new ones when it runs out
setInterval(async () => {
  if (!S) return;
  const left = Math.round(S.gacha.rotates_at - Date.now() / 1000);
  if (left <= 0) { try { shownBanner = null; await setState(await api('/state')); } catch { /* try again next second */ } return; }
  if (currentTab === 'gacha') $('banner-rotate').textContent = `New banners in ${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}`;
}, 1000);

$('pull1').addEventListener('click', () => doPull(1));
$('pull10').addEventListener('click', () => doPull(10));

// ======================= Characters (data bank) =======================
let charFilter = 'all';
let charPick = null;

function renderChars() {
  const all = S.catalog.characters;
  const owned = id => S.owned_characters[id];
  $('chars-count').textContent = `${all.filter(c => owned(c.id)).length}/${all.length}`;
  $('char-filters').innerHTML = [['all', 'All', emblem('<path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/>')], ...Object.entries(CLASSES).map(([k, v]) => [k, v[0], v[1]])].map(([k, label, icon]) =>
    `<button data-filter="${k}" class="${charFilter === k ? 'active' : ''}"><i>${icon}</i>${label}</button>`).join('');
  const list = all.filter(c => charFilter === 'all' || c.personality === charFilter);
  if (!charPick || !charById(charPick)) charPick = S.active_character;
  $('collection').innerHTML = list.map((c, i) => `
    <div class="ccard r-${c.rarity} ${owned(c.id) ? '' : 'locked'} ${c.id === charPick ? 'selected' : ''}" data-pick="${c.id}" tabindex="0" style="animation-delay:${i * 0.04}s">
      <div class="initial">${esc(c.name[0])}</div>${portraitImg(c.id, true)}
      <span class="cls" title="${classOf(c)[0]}">${classOf(c)[1]}</span>
      ${c.id === S.active_character ? '<span class="tag">Companion</span>' : ''}
      ${owned(c.id) ? '' : '<div class="notidx">Not Indexed</div>'}
      <div class="cname">${esc(c.name)}</div><div class="stars">${stars(c.rarity)}</div>
    </div>`).join('') || '<small>No characters of this type yet.</small>';
  renderCharDetail();
}

function renderCharDetail() {
  const c = charById(charPick);
  const own = S.owned_characters[c.id];
  const isActive = c.id === S.active_character;
  const voices = [c.voice_id && 'English', c.voice_id_ja && 'Japanese'].filter(Boolean).join(' + ') || 'Default voice';
  $('char-detail').innerHTML = `
    <div class="d-art r-${c.rarity} ${own ? '' : 'locked'}"><div class="initial">${esc(c.name[0])}</div>${portraitImg(c.id)}</div>
    <div class="rarity-label r-${c.rarity} ${c.rarity === 'Unbound' ? 'rainbow-text' : ''}">${c.rarity.toUpperCase()}</div>
    <h2>${esc(c.name)}</h2>
    <div class="d-title">${esc(c.title || '')}</div>
    <div class="stars">${stars(c.rarity)}</div>
    <div class="d-meta"><span>${classOf(c)[1]} ${classOf(c)[0]}</span>${own ? `<span>Bond ${own.bond}/6</span>` : ''}<span>Voice: ${voices}</span></div>
    ${own ? `<p class="d-line">“${esc(c.intro_line)}”</p>
      <div class="row"><button data-preview="en" data-id="${c.id}">▶ English</button><button data-preview="ja" data-id="${c.id}">▶ Japanese</button></div>`
      : '<p class="d-line">You have not met this character yet. Summon to bring them to your room.</p>'}
    <div class="spacer"></div>
    ${!own ? '<button class="primary big" data-open="gacha">Go to Summon</button>'
      : isActive ? '<button class="big" disabled>Current companion</button><button class="primary big" data-open="dress">Customize</button>'
      : `<button class="primary big" data-char="${c.id}">Set as companion</button>`}`;
}

/** Plays a character's intro line in their English or Japanese voice. */
function previewVoice(id, lang) {
  const c = charById(id);
  voice.stopSpeaking();
  if (id === S.active_character) character.setEmotion('happy', 4);
  voice.speak(lang === 'ja' ? (c.intro_line_ja || c.intro_line) : c.intro_line, { characterId: c.id, lang, gender: c.gender });
}

// ======================= Dressing Room (wardrobe + shop in one) =======================
// Laid out like a character screen in a game: categories and the picked item on the left, the list of items
// on the right, the character in the middle on a soft backdrop of their own colour.
// Clicking an item in the list previews it on the character; the button on the left wears, takes off or buys it.
let dressCat = 'head';   // head | face | room | persona | voice
let picked = null;       // { kind: 'accessory' | 'background', id }: the item selected in the list
let accThumbs = null;    // little pictures of the accessories, made the first time the dressing room opens
const CAT_NAMES = { head: 'Headwear', face: 'Eyewear', room: 'Rooms', persona: 'Personality', voice: 'Voice' };

const ownsItem = (kind, id) => (kind === 'accessory' ? S.owned_accessories : S.owned_backgrounds).includes(id);
const findItem = (kind, id) => (kind === 'accessory' ? S.catalog.accessories : S.catalog.backgrounds).find(x => x.id === id);
const isOn = (kind, id) => (kind === 'accessory' ? S.equipped_accessories.includes(id) : S.background === id);
const thumbOf = (kind, id) => (kind === 'accessory'
  ? (accThumbs ||= accessoryThumbs(S.catalog.accessories.map(a => a.id)))[id] : environment.thumb(id));

/** Shows what is equipped, plus the picked item as a preview. */
function applyTry() {
  const preview = picked?.kind === 'accessory' && !S.equipped_accessories.includes(picked.id) ? [picked.id] : [];
  character.setAccessories([...S.equipped_accessories, ...preview]);
  applyEnv();
}

function tile(kind, it) {
  const owned = ownsItem(kind, it.id), on = isOn(kind, it.id);
  const badge = on ? (kind === 'accessory' ? '✓ Wearing' : '✓ In use') : owned ? 'Owned' : `${LOTUS} ${it.price}`;
  return `<button class="tile ${kind === 'accessory' ? 'acc' : ''} ${on ? 'worn' : ''} ${owned ? '' : 'locked'} ${picked?.id === it.id ? 'trying' : ''}"
    data-item="${kind}:${it.id}" title="${esc(it.name)}"><img src="${thumbOf(kind, it.id)}" alt="" draggable="false">
    <span class="badge">${badge}</span><span class="tname">${esc(it.name)}</span></button>`;
}

function renderDress() {
  document.querySelectorAll('#dress-cats button').forEach(b => b.classList.toggle('active', b.dataset.cat === dressCat));
  $('dress-cat-title').textContent = CAT_NAMES[dressCat];
  $('dress-points').textContent = S.points;
  const items = ['head', 'face', 'room'].includes(dressCat);
  $('dress-grid').classList.toggle('hidden', !items);
  $('dress-action').classList.toggle('hidden', !items);
  $('dress-persona').classList.toggle('hidden', dressCat !== 'persona');
  $('dress-voice').classList.toggle('hidden', dressCat !== 'voice');
  if (currentTab === 'dress' && items) { // (skip the picture work while the dressing room is closed)
    const kind = dressCat === 'room' ? 'background' : 'accessory';
    const list = kind === 'background' ? S.catalog.backgrounds : S.catalog.accessories.filter(a => (a.slot || 'head') === dressCat);
    $('dress-grid').innerHTML = list.map(it => tile(kind, it)).join('');
    const it = picked && findItem(picked.kind, picked.id);
    if (it) {
      const owned = ownsItem(picked.kind, it.id), on = isOn(picked.kind, it.id), short = it.price - S.points;
      const label = !owned ? (short > 0 ? `Need ${short} more ${LOTUS}` : `Buy · ${LOTUS} ${it.price}`)
        : picked.kind === 'accessory' ? (on ? 'Take off' : 'Wear') : (on ? 'In use' : 'Use this room');
      $('dress-action').innerHTML = `<img class="${picked.kind === 'accessory' ? 'acc' : ''}" src="${thumbOf(picked.kind, it.id)}" alt="">
        <div class="what"><small>${on ? (picked.kind === 'accessory' ? 'Wearing' : 'In use') : owned ? 'Owned' : 'Previewing · not owned'}</small><b>${esc(it.name)}</b></div>
        <button class="primary big" data-apply ${(!owned && short > 0) || (owned && on && picked.kind === 'background') ? 'disabled' : ''}>${label}</button>`;
    } else {
      $('dress-action').innerHTML = `<div class="what">Pick an item on the right to see it on ${esc(activeChar().name)}.<br>Items with a price can be previewed first, then bought here.</div>`;
    }
  }
  const char = activeChar();
  const p = S.personality_overrides[char.id] || char.personality;
  const presets = Object.keys(CLASSES);
  if (document.activeElement !== $('personality-custom') && document.activeElement !== $('personality')) {
    $('personality').value = presets.includes(p) ? p : 'custom';
    $('personality-custom').classList.toggle('hidden', presets.includes(p));
    if (!presets.includes(p)) $('personality-custom').value = p;
  }
  document.querySelectorAll('input[name=vmode]').forEach(r => { r.checked = r.value === S.settings.voice_mode; });
}

environment.onPicture = () => { if (currentTab === 'dress' && dressCat === 'room') renderDress(); };

/** Clicking an item in the list selects it and previews it. */
function clickItem(kind, id) {
  picked = { kind, id };
  applyTry();
  renderDress();
}

/** The button under the picked item: buy it if it isn't owned, otherwise wear / take off / use it. */
async function applyPicked() {
  const { kind, id } = picked;
  if (!ownsItem(kind, id)) {
    await setState(await post('/shop/buy', { kind, id }));
    voice.sfx('task_done');
    vfx.burst(innerWidth / 2, innerHeight * 0.4, '#ff8fc4', 60);
    await setState(await post('/equip', { kind, id, on: true })); // wear / use it right away
    say('Ooh, thank you! I love it!', { emotion: 'happy' });
  } else if (kind === 'accessory') {
    const on = !isOn(kind, id);
    await setState(await post('/equip', { kind, id, on }));
    if (on) character.setEmotion('happy', 3);
  } else {
    await setState(await post('/equip', { kind, id }));
  }
}

function setFrame(view) {
  character.setFraming(view);
  document.querySelectorAll('[data-frame]').forEach(b => b.classList.toggle('active', b.dataset.frame === view));
}

$('personality').addEventListener('change', () => {
  $('personality-custom').classList.toggle('hidden', $('personality').value !== 'custom');
});
$('save-personality').addEventListener('click', async () => {
  const v = $('personality').value === 'custom' ? $('personality-custom').value.trim() : $('personality').value;
  if (!v) return;
  try {
    document.activeElement?.blur();
    await setState(await post('/personality', { character_id: S.active_character, personality: v }));
    addMsg('sys', 'Personality saved.');
  } catch (err) { toastError(err); }
});
document.querySelectorAll('input[name=vmode]').forEach(r => r.addEventListener('change', async () => {
  voice.stopSpeaking();
  await setState(await post('/settings', { settings: { voice_mode: r.value } }));
  const c = activeChar();
  say(c.intro_line, { emotion: 'happy', ja: c.intro_line_ja }); // hear the change right away
}));

// ======================= One click handler for all the generated buttons =======================
document.addEventListener('click', async e => {
  const t = e.target.closest('[data-item],[data-apply],[data-cat],[data-turn],[data-char],[data-pick],[data-filter],[data-banner],[data-frame],[data-preview],[data-open],[data-close],[data-done],[data-del],[data-delevent],[data-delnote],[data-sub]');
  if (!t || t.disabled) return;
  const d = t.dataset;
  try {
    if (d.done) {
      await completeTask(d.done, t);
    } else if (d.delevent) {
      await setState(await api(`/events/${d.delevent}`, { method: 'DELETE' }));
    } else if (d.delnote) {
      await setState(await api(`/notes/${d.delnote}`, { method: 'DELETE' }));
    } else if (d.sub) {
      setQuestSub(d.sub);
    } else if (d.del) {
      await setState(await api(`/tasks/${d.del}`, { method: 'DELETE' }));
    } else if (d.item) {
      const [kind, id] = d.item.split(':');
      clickItem(kind, id);
    } else if ('apply' in d) {
      await applyPicked();
    } else if (d.cat) {
      dressCat = d.cat;
      picked = null;
      applyTry();
      renderDress();
    } else if (d.turn) {
      character.turn(+d.turn);
    } else if (d.char) {
      await setState(await post('/equip', { kind: 'character', id: d.char }));
      const c = activeChar();
      openTab(null);
      vfx.burst(innerWidth / 2, innerHeight * 0.45, c.color, 70);
      say(c.intro_line, { emotion: 'happy', ja: c.intro_line_ja });
    } else if (d.pick) {
      charPick = d.pick;
      renderChars();
    } else if (d.filter) {
      charFilter = d.filter;
      renderChars();
    } else if (d.banner) {
      bannerId = d.banner;
      renderGacha();
    } else if (d.frame) {
      setFrame(d.frame);
    } else if (d.preview) {
      previewVoice(d.id || S.active_character, d.preview);
    } else if (d.open) {
      if (currentTab !== d.open) openTab(d.open);
    } else if ('close' in d) {
      closeTab();
    }
  } catch (err) { toastError(err); }
});

// ======================= Options =======================
function renderOptions() {
  $('sys-status').innerHTML = `<small>ElevenLabs voice: ${elevenOn ? '✅ connected' : '❌ no key (using browser voice)'}<br>
    Quests done: ${S.stats.tasks_done} · Pulls: ${S.stats.pulls} · Distractions caught: ${S.stats.distractions}</small>`;
}

// Performance mode: lower resolution and fewer effects, for laptops without a dedicated graphics card
let perfMode = false;
try { perfMode = localStorage.getItem('perfMode') === 'on'; } catch { /* storage blocked */ }
function setPerfMode(on) {
  perfMode = on;
  $('perf-mode').checked = on;
  character.setQuality(on);
  environment.setQuality(on);
  try { localStorage.setItem('perfMode', on ? 'on' : 'off'); } catch { /* storage blocked */ }
}
$('perf-mode').addEventListener('change', () => setPerfMode($('perf-mode').checked));
if (perfMode) setPerfMode(true);

// A running frames-per-second count (window.__fps), so slowness can be checked from the log
(function countFrames() {
  let frames = 0, since = performance.now();
  const tick = now => {
    frames++;
    if (now - since >= 2000) { window.__fps = Math.round(frames * 1000 / (now - since)); frames = 0; since = now; }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();

/** Counts frames for a few seconds; if the app is running slowly, turns performance mode on by itself. */
function watchFrameRate() {
  if (perfMode) return;
  let frames = 0;
  const start = performance.now();
  const tick = () => {
    frames++;
    if (performance.now() - start < 4000) return requestAnimationFrame(tick);
    if (document.hidden) return; // a hidden window is throttled by the browser, so the count means nothing
    if (frames / 4 < 30) { setPerfMode(true); addMsg('sys', 'Performance mode turned on to keep things smooth. You can change it in Options (O).'); }
  };
  requestAnimationFrame(tick);
}

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

// ======================= Start =======================
async function boot() {
  try {
    elevenOn = (await api('/voice/status')).elevenlabs;
    voice.setElevenLabs(elevenOn);
    await setState(await api('/state'));
  } catch (e) {
    console.error(e);
    addMsg('sys', '⚠ Could not reach the backend. Is the Python server running?');
    return;
  }
  renderPomoPicker();
  pollFocus();
  setTimeout(() => environment.preload(S.catalog.backgrounds.map(b => b.id)), 2500); // room pictures, for the dressing room and summons
  if (elevenOn) voice.preloadSfx(['task_done', 'level_up', 'warning', 'gacha_charge', 'gacha_meteor',
    'reveal_common', 'reveal_epic', 'reveal_gold', 'reveal_unbound']);
  // Daily login gift (once per calendar day)
  let daily = null;
  try { daily = await post('/daily'); await setState(daily.state); } catch (e) { console.warn(e); }

  const c = activeChar();
  addMsg('bot', `${c.intro_line}`);
  showBubble(c.intro_line);
  if (daily?.claimed) addMsg('sys', `🎁 Daily gift: +${daily.gift} ◆ (day ${daily.streak} streak${daily.streak >= 7 ? ', max bonus!' : ''})`);
  const reminder = reminderLine();
  if (reminder) addMsg('sys', '⏰ ' + reminder);
  character.wave(3);
  setTimeout(watchFrameRate, 2500); // once the model has settled in
  setTimeout(checkEvents, 8000);

  // Browsers block sound until the first click or key press, so greet out loud on the first interaction.
  let greeted = false;
  const greet = async () => {
    if (greeted) return;
    greeted = true;
    if (Date.now() - lastPokeLine < 500) await new Promise(r => setTimeout(r, 3500)); // let the poke reaction finish
    const h = new Date().getHours();
    const stage = h >= 5 && h < 11 ? 'greet_morning' : h < 17 && h >= 11 ? 'greet_afternoon' : h >= 17 && h < 22 ? 'greet_evening' : 'greet_night';
    try {
      const line = await post('/yell', { stage });
      await say(line.tts_text, { emotion: stage === 'greet_night' ? 'surprised' : 'happy', expressive: true });
    } catch { await say(c.intro_line, { emotion: 'happy' }); }
    if (daily?.claimed) {
      voice.sfx('task_done');
      floater(`🎁 +${daily.gift} ◆`, 'big');
      vfx.flyTo(innerWidth / 2, innerHeight * 0.4, $('hud-points').parentElement, LOTUS, 10);
      await say(`Here's your daily gift: ${daily.gift} points! ${daily.streak > 1 ? `That's a ${daily.streak} day streak!` : 'Come back tomorrow for more!'}`, { emotion: 'happy' });
    }
    if (reminder) await say(reminder, { emotion: reminder.includes('overdue') ? 'angry' : 'surprised' });
  };
  document.addEventListener('pointerdown', greet, { once: true });
  document.addEventListener('keydown', greet, { once: true });
}
boot();
