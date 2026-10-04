// Voice: plays ElevenLabs speech with lip sync, records the mic for speech-to-text, plays sound effects.
// If no ElevenLabs key is set, falls back to the browser's built-in voice so the app still works.
import { api } from './api.js';

let ctx = null;
let analyser = null;
let currentAudio = null;
let fakeMouthUntil = 0;
const levelBuf = new Uint8Array(1024);

function audioCtx() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** 0..1 loudness of the voice right now, used to open the character's mouth. */
export function mouthLevel() {
  if (performance.now() < fakeMouthUntil) {
    const t = performance.now() / 1000;
    return 0.35 + 0.35 * Math.abs(Math.sin(t * 13)) * Math.abs(Math.sin(t * 5.3));
  }
  if (!analyser || !currentAudio || currentAudio.paused) return 0;
  analyser.getByteTimeDomainData(levelBuf);
  let sum = 0;
  for (let i = 0; i < levelBuf.length; i++) {
    const v = (levelBuf[i] - 128) / 128;
    sum += v * v;
  }
  const rms = Math.sqrt(sum / levelBuf.length);
  return Math.min(1, Math.max(0, (rms - 0.02) * 6));
}

// Only one voice line may play at a time. Every new line (or stopSpeaking) bumps this number;
// anything still loading or playing for an older number gives up quietly, so lines never overlap.
let speakGen = 0;
let hasElevenLabs = true; // set by app.js; the robotic browser voice is only used when there is no ElevenLabs key at all
export function setElevenLabs(on) { hasElevenLabs = on; }

export function stopSpeaking() {
  speakGen++;
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  fakeMouthUntil = 0;
}

/** True while the character is talking. */
export function isSpeaking() {
  return !!(currentAudio && !currentAudio.paused) || performance.now() < fakeMouthUntil;
}

const stripTags = text => text.replace(/\[[^\]]+\]\s*/g, '');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function fetchSpeech(text, opts) {
  return api('/tts', { method: 'POST', body: {
    text, character_id: opts.characterId, expressive: !!opts.expressive, lang: opts.lang === 'ja' ? 'ja' : 'en',
    prev: opts.prev || '', next: opts.next || '',
  } });
}

/**
 * Speaks several pieces of text one after another in the character's voice (a long reply split into sentences).
 * opts: { characterId, expressive (use [angry]-style audio tags with eleven_v3), lang ('en'|'ja'), gender }
 * onPart(i) is called just as piece i starts, so the subtitles can follow along.
 * Resolves true when everything was spoken, false if another line interrupted it.
 */
export async function speakParts(parts, opts = {}, onPart) {
  stopSpeaking();
  const gen = speakGen;
  // returns the audio, null when there is no ElevenLabs key, or undefined if the request failed
  const get = i => fetchSpeech(parts[i], { ...opts, prev: stripTags(parts[i - 1] || ''), next: stripTags(parts[i + 1] || '') })
    .catch(e => { console.warn('TTS failed:', e.message); return undefined; });
  let coming = get(0);
  for (let i = 0; i < parts.length; i++) {
    const audio = await coming;
    if (gen !== speakGen) return false;
    coming = i + 1 < parts.length ? get(i + 1) : null; // load the next sentence while this one plays
    if (onPart) onPart(i);
    const plain = stripTags(parts[i]);
    if (audio) await playBlob(audio, gen);
    else if (audio === null && !hasElevenLabs) await browserSpeak(plain, opts, gen);
    else await sleep(1200 + plain.length * 60); // voice unavailable: leave the subtitle up long enough to read
    if (gen !== speakGen) return false;
  }
  return true;
}

/** Speaks one line. */
export function speak(text, opts = {}) {
  return text ? speakParts([text], opts) : Promise.resolve(false);
}

function playBlob(blob, gen) {
  return new Promise(resolve => {
    if (gen !== speakGen) return resolve();
    const ac = audioCtx();
    const audio = new Audio(URL.createObjectURL(blob));
    const src = ac.createMediaElementSource(audio);
    src.connect(analyser);
    if (currentAudio) currentAudio.pause();
    currentAudio = audio;
    audio.onended = audio.onerror = audio.onpause = () => { if (currentAudio === audio) currentAudio = null; resolve(); };
    audio.play().catch(resolve);
  });
}

function browserSpeak(text, opts, gen) {
  return new Promise(resolve => {
    if (!('speechSynthesis' in window) || gen !== speakGen) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = opts.lang === 'ja' ? 'ja-JP' : 'en-US';
    const voices = speechSynthesis.getVoices().filter(v => v.lang.startsWith(u.lang.slice(0, 2)));
    const pick = voices.find(v => (opts.gender === 'male' ? /male|guy|david|mark/i : /female|zira|aria|jenny|haruka|nanami/i).test(v.name));
    if (pick || voices[0]) u.voice = pick || voices[0];
    u.pitch = opts.gender === 'male' ? 0.9 : 1.15;
    u.rate = 1;
    fakeMouthUntil = performance.now() + 60000;
    u.onend = u.onerror = () => { fakeMouthUntil = 0; resolve(); };
    speechSynthesis.speak(u);
  });
}

// ---------------- Microphone -> text ----------------
let recorder = null;
let chunks = [];

export function isRecording() { return recorder && recorder.state === 'recording'; }

export async function startRecording() {
  audioCtx();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  chunks = [];
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
  recorder.start();
}

/** Stops recording and returns the transcribed text (via ElevenLabs Scribe). */
export function stopRecording() {
  return new Promise((resolve, reject) => {
    if (!recorder) return resolve('');
    recorder.onstop = async () => {
      recorder.stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/webm' });
      recorder = null;
      const form = new FormData();
      form.append('audio', blob, 'speech.webm');
      try {
        const res = await api('/stt', { method: 'POST', form });
        resolve(res.text || '');
      } catch (e) { reject(e); }
    };
    recorder.stop();
  });
}

// ---------------- Sound effects ----------------
const sfxCache = {};

export async function preloadSfx(names) {
  for (const n of names) {
    try {
      const res = await fetch('/api/sfx/' + n);
      sfxCache[n] = res.status === 200 ? URL.createObjectURL(await res.blob()) : null;
    } catch { sfxCache[n] = null; }
  }
}

export function sfx(name, volume = 0.8) {
  const url = sfxCache[name];
  if (url) {
    const a = new Audio(url);
    a.volume = volume;
    a.play().catch(() => {});
    return;
  }
  beep(name);
}

/** Short crisp "tick" for UI buttons (synthesized, so there's no audio file to load). */
export function uiClick(volume = 0.35) {
  const ac = audioCtx();
  const t0 = ac.currentTime;
  const pitch = 1 + (Math.random() - 0.5) * 0.08; // tiny variation so repeated clicks don't sound robotic
  // 1) the "tick": a few milliseconds of filtered noise
  const len = Math.floor(ac.sampleRate * 0.03);
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6);
  const noise = ac.createBufferSource();
  noise.buffer = buf;
  const hp = ac.createBiquadFilter();
  hp.type = 'bandpass';
  hp.frequency.value = 3800 * pitch;
  hp.Q.value = 0.9;
  const ng = ac.createGain();
  ng.gain.value = volume * 1.4;
  noise.connect(hp).connect(ng).connect(ac.destination);
  noise.start(t0);
  // 2) the "body": a tiny sine blip that drops in pitch
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(1900 * pitch, t0);
  o.frequency.exponentialRampToValueAtTime(700 * pitch, t0 + 0.035);
  g.gain.setValueAtTime(volume, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
  o.connect(g).connect(ac.destination);
  o.start(t0); o.stop(t0 + 0.07);
}

function beep(name) {
  // simple synthesized fallback so there's always some feedback
  const ac = audioCtx();
  const notes = {
    task_done: [880, 1320], level_up: [523, 659, 784, 1047], warning: [220, 180],
    reveal_gold: [784, 988, 1175, 1568], reveal_unbound: [523, 784, 1047, 1568, 2093],
  }[name] || [660, 880];
  notes.forEach((f, i) => {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = name === 'warning' ? 'square' : 'triangle';
    o.frequency.value = f;
    const t0 = ac.currentTime + i * 0.09;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.15, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25);
    o.connect(g).connect(ac.destination);
    o.start(t0); o.stop(t0 + 0.3);
  });
}

// ---------------- Synthesized cutscene sounds (no audio files needed) ----------------
/** A rising whoosh that builds for `seconds`. */
export function riser(seconds = 2, volume = 0.16) {
  const ac = audioCtx(), t0 = ac.currentTime;
  const o = ac.createOscillator(), g = ac.createGain(), f = ac.createBiquadFilter();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(70, t0);
  o.frequency.exponentialRampToValueAtTime(900, t0 + seconds);
  f.type = 'lowpass';
  f.frequency.setValueAtTime(300, t0);
  f.frequency.exponentialRampToValueAtTime(6000, t0 + seconds);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(volume, t0 + seconds * 0.9);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds + 0.08);
  o.connect(f).connect(g).connect(ac.destination);
  o.start(t0); o.stop(t0 + seconds + 0.1);
}

/** A deep thump with a burst of noise. strength 0..1. */
export function impact(strength = 0.6) {
  const ac = audioCtx(), t0 = ac.currentTime;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(160 + strength * 80, t0);
  o.frequency.exponentialRampToValueAtTime(36, t0 + 0.45);
  g.gain.setValueAtTime(0.5 * strength, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.6);
  o.connect(g).connect(ac.destination);
  o.start(t0); o.stop(t0 + 0.65);
  const len = Math.floor(ac.sampleRate * 0.35), buf = ac.createBuffer(1, len, ac.sampleRate), data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
  const n = ac.createBufferSource(), ng = ac.createGain();
  n.buffer = buf;
  ng.gain.value = 0.28 * strength;
  n.connect(ng).connect(ac.destination);
  n.start(t0);
}

/** A bright bell-like ping; `step` raises the pitch (used as the summon climbs through the rarities, and for stars). */
export function chime(step = 0, volume = 0.14) {
  const ac = audioCtx(), t0 = ac.currentTime;
  for (const mult of [1, 2.01]) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = 'triangle';
    o.frequency.value = 660 * Math.pow(1.122, step * 2) * mult;
    g.gain.setValueAtTime(volume / mult, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
    o.connect(g).connect(ac.destination);
    o.start(t0); o.stop(t0 + 0.55);
  }
}
