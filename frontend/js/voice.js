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

export function stopSpeaking() {
  if (currentAudio) { currentAudio.pause(); currentAudio = null; }
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  fakeMouthUntil = 0;
}

/**
 * Speak text in the active character's voice.
 * opts: { characterId, expressive (use [angry]-style audio tags with eleven_v3), lang ('en'|'ja'), gender }
 * Resolves when speech finishes.
 */
export async function speak(text, opts = {}) {
  if (!text) return;
  stopSpeaking();
  try {
    const blob = await api('/tts', { method: 'POST', body: { text, character_id: opts.characterId, expressive: !!opts.expressive, lang: opts.lang === 'ja' ? 'ja' : 'en' } });
    if (blob) return playBlob(blob);
  } catch (e) {
    console.warn('TTS failed, using browser voice:', e.message);
  }
  return browserSpeak(text.replace(/\[[^\]]+\]\s*/g, ''), opts);
}

function playBlob(blob) {
  return new Promise(resolve => {
    const ac = audioCtx();
    const audio = new Audio(URL.createObjectURL(blob));
    const src = ac.createMediaElementSource(audio);
    src.connect(analyser);
    currentAudio = audio;
    audio.onended = audio.onerror = () => { if (currentAudio === audio) currentAudio = null; resolve(); };
    audio.play().catch(resolve);
  });
}

function browserSpeak(text, opts) {
  return new Promise(resolve => {
    if (!('speechSynthesis' in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = opts.lang === 'ja' ? 'ja-JP' : 'en-US';
    const voices = speechSynthesis.getVoices().filter(v => v.lang.startsWith(u.lang.slice(0, 2)));
    const pick = voices.find(v => (opts.gender === 'male' ? /male|guy|david|mark/i : /female|zira|aria|jenny|haruka|nanami/i).test(v.name));
    if (pick || voices[0]) u.voice = pick || voices[0];
    u.pitch = opts.gender === 'male' ? 0.9 : 1.3;
    u.rate = 1.05;
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
