/* JoloVocals – AI Voice Studio. Static, dependency-free web app. */
(() => {
'use strict';

/* ───────────── helpers ───────────── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const fmt = s => { s = Math.max(0, Math.round(s)); return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
const uid = () => Math.random().toString(36).slice(2, 10);
const ago = t => { const m = (Date.now() - t) / 6e4; return m < 1 ? 'just now' : m < 60 ? `${Math.floor(m)} min ago` : m < 1440 ? `${Math.floor(m / 60)} h ago` : `${Math.floor(m / 1440)} days ago`; };

const P = {
  play: '<path d="M6 4l14 8-14 8z"/>', pause: '<path d="M6 4h4v16H6zM14 4h4v16h-4z"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>', home: '<path d="M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-7H9v7H4a1 1 0 01-1-1z"/>',
  mic: '<path d="M12 2a3 3 0 00-3 3v7a3 3 0 006 0V5a3 3 0 00-3-3zM19 11a7 7 0 01-14 0M12 18v4"/>',
  lib: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  user: '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z"/>',
  arrow: '<path d="M5 12h14M12 5l7 7-7 7"/>',
  upload: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  share: '<path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6"/>',
  check: '<path d="M20 6L9 17l-5-5"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  doc: '<path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8zM14 2v6h6M9 13h6M9 17h6"/>',
  wave: '<path d="M3 10v4M7 6v12M11 3v18M15 7v10M19 10v4"/>', text: '<path d="M4 6h16M4 12h16M4 18h10"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  adduser: '<path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM19 8v6M22 11h-6"/>',
};
const icon = n => `<svg class="i" viewBox="0 0 24 24">${P[n]}</svg>`;
const toast = msg => { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600); };

/* ───────────── storage (metadata in localStorage, audio blobs in IndexedDB) ───────────── */
const ls = {
  get: (k, d) => { try { return JSON.parse(localStorage.getItem('jv.' + k)) ?? d; } catch { return d; } },
  set: (k, v) => { try { localStorage.setItem('jv.' + k, JSON.stringify(v)); } catch { /* storage unavailable */ } },
};
const idb = (() => {
  let db;
  const open = () => db || (db = new Promise((res, rej) => {
    const r = indexedDB.open('jolovocals', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('blobs');
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  }));
  const tx = async (mode, fn) => { const d = await open(); return new Promise((res, rej) => { const q = fn(d.transaction('blobs', mode).objectStore('blobs')); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); }); };
  return { put: (k, v) => tx('readwrite', s => s.put(v, k)).catch(() => {}), get: k => tx('readonly', s => s.get(k)).catch(() => undefined), del: k => tx('readwrite', s => s.delete(k)).catch(() => {}) };
})();

const PRESETS = [
  { id: 'pre-narrator', name: 'Female Narrator', cat: 'English', pitch: 210, dur: 60, preset: true },
  { id: 'pre-anchor', name: 'News Anchor', cat: 'Hindi', pitch: 115, dur: 60, preset: true },
  { id: 'pre-char', name: 'Character 1', cat: 'Custom', pitch: 290, dur: 180, preset: true },
  { id: 'pre-deep', name: 'Deep Voice', cat: 'English', pitch: 85, dur: 90, preset: true },
];
const S = {
  user: ls.get('user', null),
  voices: ls.get('voices', []),
  recents: ls.get('recents', []),
  draft: null,                  // voice being created: { blob, buf, dur }
  consent: false,
  tts: { voiceId: null, text: 'Namaste, yeh ek test hai JoloVocals AI Voice Studio ka.', stability: .7, similarity: .8 },
  ttsResult: null, v2v: { sample: null, voiceId: null }, v2vResult: null,
  libTab: 'mine', libQuery: '', stopPlayback: null,
};
const allVoices = () => [...S.voices, ...PRESETS];
const findVoice = id => allVoices().find(v => v.id === id);
const saveVoices = () => ls.set('voices', S.voices);
const saveRecents = () => ls.set('recents', S.recents.slice(0, 20));

/* ───────────── audio engine ───────────── */
let _ctx;
const ac = () => _ctx || (_ctx = new (window.AudioContext || window.webkitAudioContext)());
const decode = async blob => ac().decodeAudioData(await blob.arrayBuffer());
const mono = buf => {
  const n = buf.length, out = new Float32Array(n);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) out[i] += d[i] / buf.numberOfChannels; }
  return out;
};

/** Median fundamental frequency (Hz) via autocorrelation over the loudest frames. 0 if undetectable. */
function detectPitch(buf) {
  const x = mono(buf), f = Math.max(1, Math.round(buf.sampleRate / 11025)), n = Math.floor(x.length / f), d = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < f; k++) s += x[i * f + k]; d[i] = s / f; }
  const rate = buf.sampleRate / f, W = 1024, minLag = Math.floor(rate / 400), maxLag = Math.floor(rate / 70), frames = [];
  for (let s = 0; s + W + maxLag < n; s += W / 2) { let e = 0; for (let i = 0; i < W; i++) e += d[s + i] * d[s + i]; frames.push({ s, e }); }
  if (!frames.length) return 0;
  frames.sort((a, b) => b.e - a.e);
  const peak = frames[0].e, pitches = [];
  for (const { s, e } of frames.slice(0, 60)) {
    if (e < peak * .1) break;
    let best = 0, bestLag = 0;
    for (let lag = minLag; lag <= maxLag; lag++) { let r = 0; for (let i = 0; i < W; i++) r += d[s + i] * d[s + i + lag]; if (r / e > best) { best = r / e; bestLag = lag; } }
    if (best > .5 && bestLag) pitches.push(rate / bestLag);
  }
  if (!pitches.length) return 0;
  pitches.sort((a, b) => a - b);
  return Math.round(pitches[pitches.length >> 1]);
}

/** Duration-preserving pitch shift: resample by `ratio`, then WSOLA time-stretch back to the original length. */
function pitchShift(buf, ratio) {
  const x = mono(buf), n = x.length;
  if (Math.abs(ratio - 1) < .01) return { data: x, sr: buf.sampleRate };
  const m = Math.floor(n / ratio), y = new Float32Array(m);
  for (let i = 0; i < m; i++) { const p = i * ratio, i0 = Math.floor(p), fr = p - i0; y[i] = x[i0] * (1 - fr) + (x[i0 + 1] || 0) * fr; }
  const G = 2048, Hs = G / 2, tol = 256, win = new Float32Array(G);
  for (let i = 0; i < G; i++) win[i] = .5 - .5 * Math.cos(2 * Math.PI * i / G);
  const out = new Float32Array(n + G), wsum = new Float32Array(n + G);
  let last = 0;
  for (let o = 0; o < n; o += Hs) {
    const nominal = Math.round(o / ratio);
    let best = clamp(nominal, 0, Math.max(0, m - 1));
    if (o > 0) {
      const target = last + Hs; let bc = -Infinity;
      for (let dl = -tol; dl <= tol; dl += 4) {
        const s = nominal + dl; if (s < 0 || s + Hs >= m || target + Hs >= m) continue;
        let c = 0; for (let k = 0; k < Hs; k += 2) c += y[s + k] * y[target + k];
        if (c > bc) { bc = c; best = s; }
      }
    }
    for (let k = 0; k < G; k++) { const v = y[best + k]; if (v === undefined) break; out[o + k] += v * win[k]; wsum[o + k] += win[k]; }
    last = best;
  }
  const res = new Float32Array(n);
  for (let i = 0; i < n; i++) res[i] = wsum[i] > 1e-3 ? out[i] / wsum[i] : 0;
  return { data: res, sr: buf.sampleRate };
}

function encodeWav(data, sr) {
  const b = new DataView(new ArrayBuffer(44 + data.length * 2)), w = (o, s) => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); b.setUint32(4, 36 + data.length * 2, true); w(8, 'WAVEfmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
  b.setUint32(24, sr, true); b.setUint32(28, sr * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); w(36, 'data'); b.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) b.setInt16(44 + i * 2, clamp(data[i], -1, 1) * 0x7fff, true);
  return new Blob([b], { type: 'audio/wav' });
}

const peaks = (buf, count = 40) => {
  const x = mono(buf), step = Math.max(1, Math.floor(x.length / count)), out = [];
  for (let i = 0; i < count; i++) { let m = 0; for (let k = 0; k < step; k += 8) m = Math.max(m, Math.abs(x[i * step + k] || 0)); out.push(m); }
  const mx = Math.max(...out, 1e-6); return out.map(v => clamp(v / mx, .08, 1));
};
const fakePeaks = (seed, count = 40) => Array.from({ length: count }, (_, i) => .2 + .8 * Math.abs(Math.sin((i + 1) * (seed % 7 + 2) * .37) * Math.cos(i * .21)));

function bufferSource(buf) {
  return { duration: buf.duration, play(onEnd) {
    const src = ac().createBufferSource(); let off = false; src.buffer = buf; src.connect(ac().destination);
    src.onended = () => { if (!off) onEnd(); }; ac().resume(); src.start();
    return () => { off = true; try { src.stop(); } catch { /* already stopped */ } };
  } };
}

/** Browser speech synthesis shaped by a voice profile (pitch ratio) and the stability/similarity sliders. */
function speakSource(text, voice, stability, similarity) {
  const words = text.trim().split(/\s+/).length;
  return { duration: Math.max(1, words * .4), play(onEnd) {
    const synth = window.speechSynthesis; let off = false; synth.cancel();
    const parts = text.match(/[^.!?।]+[.!?।]*/g) || [text], hi = voice.cat === 'Hindi';
    const sv = synth.getVoices().find(v => hi ? v.lang.toLowerCase().startsWith('hi') : v.lang.toLowerCase().startsWith('en')) || null;
    const ratio = clamp((voice.pitch || 150) / 150, .3, 2.5);
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p.trim()); if (sv) { u.voice = sv; u.lang = sv.lang; }
      const jitter = (Math.random() - .5) * (1 - stability) * .6;
      u.pitch = clamp(1 + (ratio - 1) * similarity + jitter, .1, 2); u.rate = clamp(.8 + stability * .3, .6, 1.2);
      if (i === parts.length - 1) { u.onend = u.onerror = () => { if (!off) onEnd(); }; }
      synth.speak(u);
    });
    return () => { off = true; synth.cancel(); };
  } };
}

/** Wire up a play button + waveform. getSource() → { duration, play(onEnd) → stop }. */
function bindPlayer(root, getSource, bars) {
  const btn = $('.play', root), spans = $$('.wave span', root), tm = $('.time', root);
  let stop = null, timer = null, dur = 0;
  const reset = () => { clearInterval(timer); timer = stop = null; spans.forEach(s => s.classList.remove('on')); btn.innerHTML = icon('play'); if (tm) tm.textContent = `00:00 / ${fmt(dur)}`; if (S.stopPlayback === halt) S.stopPlayback = null; };
  const halt = () => { if (stop) { stop(); reset(); } };
  btn.onclick = async () => {
    if (stop) return halt();
    if (S.stopPlayback) S.stopPlayback();
    const src = await getSource(); if (!src) return; dur = src.duration; const t0 = performance.now();
    stop = src.play(reset); S.stopPlayback = halt; btn.innerHTML = icon('pause');
    timer = setInterval(() => { const t = (performance.now() - t0) / 1000; const k = Math.floor(t / dur * spans.length); spans.forEach((s, i) => s.classList.toggle('on', i < k)); if (tm) tm.textContent = `${fmt(t)} / ${fmt(dur)}`; }, 100);
  };
  return halt;
}
const playerHtml = (pk, dur, big) => `<div class="prow"><button class="play ${big ? 'big' : ''}" aria-label="Play">${icon('play')}</button><div class="wave">${pk.map(p => `<span style="height:${Math.round(p * 100)}%"></span>`).join('')}</div></div><div class="time">00:00 / ${fmt(dur)}</div>`;

/* ───────────── recording / upload ───────────── */
async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true }), rec = new MediaRecorder(stream), chunks = [];
  rec.ondataavailable = e => e.data.size && chunks.push(e.data); rec.start();
  return { stop: () => new Promise(res => { rec.onstop = () => { stream.getTracks().forEach(t => t.stop()); res(new Blob(chunks, { type: rec.mimeType || 'audio/webm' })); }; rec.stop(); }) };
}
/** Binds upload (button, file picker, drag-drop) and record controls inside `root`. */
function bindCapture(root, onBlob, maxSec) {
  const file = $('input[type=file]', root), recBtn = $('.rec', root), timer = $('.rec-time', root), drop = $('.drop', root);
  $('.upload-btn', root).onclick = () => file.click();
  file.onchange = () => { if (file.files[0]) onBlob(file.files[0]); };
  if (drop) { drop.ondragover = e => { e.preventDefault(); drop.classList.add('over'); }; drop.ondragleave = () => drop.classList.remove('over');
    drop.ondrop = e => { e.preventDefault(); drop.classList.remove('over'); const f = e.dataTransfer.files[0]; if (f) onBlob(f); }; }
  let session = null, t0 = 0, tick = null;
  const finish = async () => { clearInterval(tick); recBtn.classList.remove('live'); const s = session; session = null; if (s) onBlob(await s.stop()); };
  recBtn.onclick = async () => {
    if (session) return finish();
    try { session = await startRecording(); } catch { return toast('Microphone unavailable – allow access or upload a file'); }
    t0 = Date.now(); recBtn.classList.add('live');
    tick = setInterval(() => { const t = (Date.now() - t0) / 1000; timer.textContent = `${fmt(t)} / ${fmt(maxSec)}`; if (t >= maxSec) finish(); }, 250);
  };
  return () => { clearInterval(tick); if (session) session.stop(); };
}
const captureHtml = (label, maxSec) => `
  <div class="card drop"><div style="color:var(--p)">${icon('upload')}</div><strong>${label}</strong>
    <p class="muted">Audio file (MP3, WAV, M4A, WebM)</p>
    <button class="btn upload-btn">Upload Audio</button><input type="file" accept="audio/*" hidden></div>
  <div class="or">OR</div>
  <div class="card center"><strong>Record</strong><button class="rec" aria-label="Record"></button><div class="muted rec-time">00:00 / ${fmt(maxSec)}</div></div>`;

async function loadSample(blob, minSec) {
  let buf; try { buf = await decode(blob); } catch { toast('Could not read that audio file'); return null; }
  if (buf.duration < minSec) { toast(`Audio too short – need at least ${minSec}s`); return null; }
  return { blob, buf, dur: buf.duration };
}

/* ───────────── views ───────────── */
const nav = on => `<nav class="bottom">
  ${[['home', 'home', 'Home'], ['tts', 'text', 'Generate']].map(([r, ic, l]) => `<button data-go="${r}" class="${on === r ? 'on' : ''}">${icon(ic)}${l}</button>`).join('')}
  <button class="mic" data-go="v2v" aria-label="Voice to voice">${icon('mic')}</button>
  ${[['library', 'lib', 'Library'], ['profile', 'user', 'Profile']].map(([r, ic, l]) => `<button data-go="${r}" class="${on === r ? 'on' : ''}">${icon(ic)}${l}</button>`).join('')}</nav>`;
const top = (title, back = true) => `<div class="top">${back ? `<button class="icon-btn" data-back aria-label="Back">${icon('back')}</button>` : ''}<h2>${title}</h2></div>`;
const voiceOptions = sel => allVoices().map(v => `<option value="${v.id}" ${v.id === sel ? 'selected' : ''}>${esc(v.name)}</option>`).join('');
const go = r => { location.hash = '#/' + r; };

const V = {};

V.splash = () => ({
  html: `<section class="screen splash"><div class="bars">${[30, 55, 80, 100, 75, 50, 30].map((h, i) => `<span style="height:${h}%;animation-delay:${i * .12}s"></span>`).join('')}</div>
    <div class="brand">Jolo<b>Vocals</b></div><div style="font-size:20px">AI Voice Studio</div><div class="tag">Clone &nbsp;•&nbsp; Convert &nbsp;•&nbsp; Create</div>
    <div class="grow"></div><button class="btn" id="start">Get Started ${icon('arrow')}</button></section>`,
  bind: r => { $('#start', r).onclick = () => go(S.user ? 'home' : 'login'); },
});

V.login = () => {
  let mode = 'in';
  return { html: `<section class="screen"><div class="center" style="margin:6px 0 18px"><div class="brand" style="font-size:34px">Jolo<b>Vocals</b></div><div class="muted">AI Voice Studio</div></div>
    <div class="tabs"><button class="on" data-m="in">Sign In</button><button data-m="up">Sign Up</button></div>
    <button class="social" data-demo><b style="color:#ea4335;width:22px;text-align:center">G</b>Continue with Google</button>
    <button class="social" data-demo><span style="width:22px;text-align:center">📞</span>Continue with Mobile</button>
    <div class="or">OR</div>
    <form id="f"><label class="lbl" style="margin-top:0">Email or phone number</label><input class="field" id="id" placeholder="Enter your email or phone" autocomplete="username" required>
    <label class="lbl">Password</label><input class="field" id="pw" type="password" placeholder="Enter your password" autocomplete="current-password" required minlength="4">
    <div class="gap"></div><button class="btn" id="go">Sign In</button></form>
    <p class="muted center" style="margin-top:14px">Demo mode: accounts are stored only in this browser.</p></section>`,
  bind: r => {
    $$('[data-demo]', r).forEach(b => b.onclick = () => toast('Social sign-in needs a backend – use email/phone for the demo'));
    $$('.tabs button', r).forEach(b => b.onclick = () => { mode = b.dataset.m; $$('.tabs button', r).forEach(x => x.classList.toggle('on', x === b)); $('#go', r).textContent = mode === 'in' ? 'Sign In' : 'Create Account'; });
    $('#f', r).onsubmit = e => { e.preventDefault(); const id = $('#id', r).value.trim(), nm = id.includes('@') ? id.split('@')[0] : 'Friend';
      S.user = { id, name: nm.charAt(0).toUpperCase() + nm.slice(1) }; ls.set('user', S.user); go('home'); };
  } };
};

V.home = () => {
  const items = S.recents.slice(0, 3);
  return { html: `<section class="screen has-nav"><div class="top"><div class="brand" style="font-size:24px;flex:1">Jolo<b>Vocals</b> <span class="pro">Pro</span></div></div>
    <div class="hello">Hello, ${esc(S.user.name)} 👋</div><p class="muted">What would you like to do today?</p>
    <div class="menu">${[['tts', 'text', 'Text to Voice', 'Use your cloned voice'], ['v2v', 'wave', 'Voice to Voice', 'Convert your audio'],
      ['create', 'adduser', 'Create Voice', 'Clone a new voice'], ['library', 'lib', 'Voice Library', 'Manage your voices']]
      .map(([r, ic, t, s]) => `<button class="mcard" data-go="${r}"><span class="ic">${icon(ic)}</span><span class="grow"><strong>${t}</strong><small>${s}</small></span>${icon('arrow')}</button>`).join('')}</div>
    <div class="sec"><span>Recent Audios</span></div>
    ${items.length ? items.map(a => `<div class="row" data-recent="${a.id}" style="cursor:pointer"><span class="play">${icon('play')}</span><div class="info"><strong>${esc(a.title)}</strong><small>${ago(a.ts)} • ${fmt(a.dur)}</small></div></div>`).join('')
      : '<div class="empty">Nothing yet – generate some speech or convert a voice.</div>'}${nav('home')}</section>`,
  bind: r => $$('[data-recent]', r).forEach(el => el.onclick = () => openRecent(el.dataset.recent)) };
};

async function openRecent(id) {
  const a = S.recents.find(x => x.id === id); if (!a) return;
  if (a.kind === 'tts') { S.ttsResult = { text: a.text, voiceId: a.voiceId, id: a.id }; return go('tts-result'); }
  const blob = await idb.get('audio:' + id); if (!blob) return toast('That audio is no longer stored');
  const buf = await decode(blob); S.v2vResult = { id, original: null, converted: buf, blob, ...(S.v2vResult?.id === id ? S.v2vResult : {}) }; go('v2v-result');
}

/* create voice: step 1 */
V.create = () => {
  const d = S.draft;
  return { html: `<section class="screen">${top('Create Voice')}
    <div class="steps">${['Upload', 'Process', 'Ready'].map((s, i) => `<div class="step ${i === 0 ? 'on' : ''}"><i>${i + 1}</i>${s}</div>`).join('')}</div>
    ${captureHtml('Upload Voice Sample', 300)}
    <div id="chosen">${d ? chosenHtml(d) : ''}</div>
    <div class="note"><strong>ⓘ Important</strong><ul><li>Use a clear sample (1–5 minutes) of the person's voice.</li><li>You must have permission from the voice owner.</li><li>Audio is processed in your browser and stored only on this device.</li></ul></div>
    <div class="grow"></div><div class="gap"></div><button class="btn" id="next" ${d ? '' : 'disabled'}>Continue</button></section>`,
  bind: r => {
    let halt;
    const show = () => { $('#chosen', r).innerHTML = chosenHtml(S.draft); $('#next', r).disabled = false; halt = bindPlayer($('.filechip', r), async () => bufferSource(S.draft.buf)); };
    if (d) show();
    const stopRec = bindCapture(r, async blob => { const s = await loadSample(blob, 3); if (!s) return; if (s.dur < 60) toast('Tip: 1–5 minutes gives the best profile'); S.draft = s; show(); }, 300);
    $('#next', r).onclick = () => { stopRec(); go('consent'); };
    r._cleanup = () => { stopRec(); halt && halt(); };
  } };
};
const chosenHtml = d => `<div class="filechip" style="display:block">${playerHtml(peaks(d.buf, 30), d.dur)}</div>`;

V.consent = () => ({
  html: `<section class="screen">${top('Voice Consent')}<div class="consent"><div class="ic">${icon('doc')}</div><h2>Confirm Permission</h2>
    <p class="muted">I confirm that I have the right and permission to clone this voice and will use it responsibly.</p></div>
    <label class="check"><input type="checkbox" id="ok"><span>I agree to the <a href="#/consent" data-toast="Terms of Use">Terms of Use</a> and <a href="#/consent" data-toast="AI Voice Policy">AI Voice Policy</a></span></label>
    <button class="btn" id="next" disabled>Continue</button></section>`,
  bind: r => {
    if (!S.draft) return go('create');
    $$('[data-toast]', r).forEach(a => a.onclick = e => { e.preventDefault(); toast(a.dataset.toast + ': use voices only with the owner’s permission'); });
    $('#ok', r).onchange = e => { $('#next', r).disabled = !e.target.checked; };
    $('#next', r).onclick = () => go('processing');
  } });

V.processing = () => ({
  html: `<section class="screen">${top('Creating Voice', false)}<div class="ring" style="--v:0"><div id="pct">0%</div></div>
    <div class="center"><strong>Processing your voice…</strong><p class="muted">This may take a few moments.</p></div>
    <div class="tasks">${['Uploading audio', 'Analyzing voice', 'Building voice profile', 'Finalizing'].map(t => `<div class="task"><i></i>${t}</div>`).join('')}</div></section>`,
  bind: async r => {
    if (!S.draft) return go('create');
    const ring = $('.ring', r), pct = $('#pct', r), tasks = $$('.task', r), gone = () => !r.isConnected;
    const set = v => { ring.style.setProperty('--v', v); pct.textContent = Math.round(v) + '%'; };
    const mark = i => tasks.forEach((t, k) => { t.className = 'task ' + (k < i ? 'done' : k === i ? 'act' : ''); $('i', t).textContent = k < i ? '✓' : k === i ? '+' : ''; });
    const ramp = async (a, b, ms) => { for (let v = a; v <= b; v += 1) { if (gone()) return; set(v); await sleep(ms / (b - a)); } };
    const draft = S.draft; draft.tmpId = draft.tmpId || uid();
    mark(0); await ramp(0, 20, 500); await idb.put('sample:' + draft.tmpId, draft.blob); if (gone()) return;
    mark(1); await ramp(20, 40, 300); await sleep(30);
    draft.pitch = detectPitch(draft.buf); if (gone()) return; await ramp(40, 65, 400);
    mark(2); await ramp(65, 90, 700);
    mark(3); await ramp(90, 100, 300); tasks.forEach(t => t.className = 'task done'); await sleep(300);
    if (!gone()) go('created');
  } });

V.created = () => ({
  html: `<section class="screen">${top('Voice Created', false)}<div class="okmark">${icon('check')}</div>
    <div class="center"><h2>Your voice is ready!</h2><p class="muted">Give a name to your voice and choose a category.</p></div>
    <div class="gap"></div><input class="field" id="name" value="${esc((S.user?.name || 'My') + ' Voice')}" maxlength="40">
    <div class="gap"></div><select class="field" id="cat">${['Personal', 'English', 'Hindi', 'Custom'].map(c => `<option>${c}</option>`).join('')}</select>
    <p class="muted" style="margin-top:10px">Detected pitch: ${S.draft?.pitch ? S.draft.pitch + ' Hz' : 'unknown (default will be used)'}</p>
    <div class="grow"></div><div class="gap"></div><button class="btn" id="save">Save Voice</button><div class="gap"></div>
    <div class="btn ghost" style="padding:0" id="pl"><div style="width:100%;padding:10px 14px">${playerHtml(S.draft ? peaks(S.draft.buf, 24) : fakePeaks(3, 24), S.draft?.dur || 0)}</div></div></section>`,
  bind: r => {
    const d = S.draft; if (!d || !d.tmpId) return go('create');
    bindPlayer($('#pl', r), async () => bufferSource(d.buf));
    $('#save', r).onclick = () => {
      const name = $('#name', r).value.trim(); if (!name) return toast('Please enter a name');
      const v = { id: d.tmpId, name, cat: $('#cat', r).value, pitch: d.pitch || 150, dur: d.dur, created: Date.now() };
      S.voices.unshift(v); saveVoices(); S.draft = null; toast('Voice saved'); go('library');
    };
  } });

V.library = () => ({
  html: `<section class="screen has-nav">${top('Voice Library')}<div class="search"><input class="field" id="q" placeholder="Search voices…" value="${esc(S.libQuery)}"></div>
    <div class="seg"><button data-t="mine" class="${S.libTab === 'mine' ? 'on' : ''}">My Voices</button><button data-t="shared" class="${S.libTab === 'shared' ? 'on' : ''}">Shared</button></div>
    <div id="list"></div><div class="grow"></div><button class="btn" data-go="create">${icon('plus')} Create New Voice</button>${nav('library')}</section>`,
  bind: r => {
    const draw = () => {
      const list = (S.libTab === 'mine' ? S.voices : PRESETS).filter(v => v.name.toLowerCase().includes(S.libQuery.toLowerCase()));
      $('#list', r).innerHTML = list.length ? list.map(v => `<div class="row" data-id="${v.id}"><button class="play" data-play>${icon('play')}</button>
        <div class="info"><strong>${esc(v.name)}</strong><small>${esc(v.cat)} • ${Math.max(1, Math.round(v.dur / 60))} min${v.pitch ? ` • ${v.pitch} Hz` : ''}</small></div>
        ${v.preset ? '' : '<button class="menu-btn" data-menu aria-label="Voice options">⋮</button>'}</div>`).join('')
        : `<div class="empty">${S.libTab === 'mine' ? 'No voices yet – create your first one.' : 'No matching voices.'}</div>`;
      $$('[data-play]', r).forEach(b => b.onclick = async () => {
        const v = findVoice(b.closest('.row').dataset.id); if (S.stopPlayback) S.stopPlayback();
        const sample = v.preset ? null : await idb.get('sample:' + v.id), src = sample ? bufferSource(await decode(sample)) : speakSource(`Hello, this is ${v.name}.`, v, .8, 1);
        let stop; const reset = () => { b.innerHTML = icon('play'); S.stopPlayback = null; };
        stop = src.play(reset); b.innerHTML = icon('pause'); S.stopPlayback = () => { stop(); reset(); };
      });
      $$('[data-menu]', r).forEach(b => b.onclick = async () => {
        const v = findVoice(b.closest('.row').dataset.id), a = prompt(`"${v.name}" – type "rename" or "delete"`, 'rename'); if (!a) return;
        if (a.toLowerCase() === 'delete' && confirm(`Delete ${v.name}?`)) { S.voices = S.voices.filter(x => x.id !== v.id); saveVoices(); idb.del('sample:' + v.id); }
        else if (a.toLowerCase() === 'rename') { const n = prompt('New name', v.name); if (n && n.trim()) { v.name = n.trim().slice(0, 40); saveVoices(); } }
        draw();
      });
    };
    draw();
    $('#q', r).oninput = e => { S.libQuery = e.target.value; draw(); };
    $$('.seg button', r).forEach(b => b.onclick = () => { S.libTab = b.dataset.t; $$('.seg button', r).forEach(x => x.classList.toggle('on', x === b)); draw(); });
  } });

V.tts = () => {
  const t = S.tts; t.voiceId = findVoice(t.voiceId) ? t.voiceId : allVoices()[0].id;
  return { html: `<section class="screen has-nav">${top('Text to Voice')}
    <label class="lbl" style="margin-top:0">Select Voice</label><select class="field" id="v">${voiceOptions(t.voiceId)}</select>
    <label class="lbl">Enter Text</label><textarea class="field" id="txt" maxlength="5000" placeholder="Type what the voice should say…">${esc(t.text)}</textarea>
    <div class="muted" style="text-align:right"><span id="cnt">${t.text.length}</span>/5000</div>
    <label class="lbl">Voice Settings</label>
    <div class="slider"><span>Stability</span><input type="range" id="st" min="0" max="1" step=".05" value="${t.stability}"><b id="stv">${t.stability}</b></div>
    <div class="slider"><span>Similarity</span><input type="range" id="si" min="0" max="1" step=".05" value="${t.similarity}"><b id="siv">${t.similarity}</b></div>
    <div class="grow"></div><button class="btn" id="gen">${icon('wave')} Generate Speech</button>${nav('tts')}</section>`,
  bind: r => {
    if (!('speechSynthesis' in window)) toast('Speech synthesis is not supported in this browser');
    $('#v', r).onchange = e => { t.voiceId = e.target.value; };
    $('#txt', r).oninput = e => { t.text = e.target.value; $('#cnt', r).textContent = t.text.length; };
    [['st', 'stability', 'stv'], ['si', 'similarity', 'siv']].forEach(([id, k, o]) => $('#' + id, r).oninput = e => { t[k] = +e.target.value; $('#' + o, r).textContent = t[k]; });
    $('#gen', r).onclick = () => {
      if (!t.text.trim()) return toast('Enter some text first');
      const id = uid(); S.ttsResult = { text: t.text, voiceId: t.voiceId, id, fresh: true }; go('tts-result');
    };
  } };
};

V['tts-result'] = () => {
  const res = S.ttsResult, v = res && findVoice(res.voiceId);
  if (!v) return { html: '', bind: () => go('tts') };
  const src = speakSource(res.text, v, S.tts.stability, S.tts.similarity);
  return { html: `<section class="screen">${top('Generated Audio')}<div class="player">${playerHtml(fakePeaks(res.text.length), src.duration, true)}</div>
    <p class="muted center" style="margin-bottom:14px">“${esc(res.text.slice(0, 90))}${res.text.length > 90 ? '…' : ''}” — ${esc(v.name)}</p>
    <div class="actions"><button class="act" id="dl" disabled title="Browser speech can’t be exported">${icon('download')}Download</button>
      <button class="act" id="sh">${icon('share')}Share</button><button class="act del" id="rm">${icon('trash')}Delete</button></div>
    <div class="grow"></div><button class="btn" id="again">Generate Again</button></section>`,
  bind: r => {
    const p = bindPlayer($('.player', r), async () => src);
    if (res.fresh) { res.fresh = false; S.recents.unshift({ id: res.id, kind: 'tts', title: res.text.slice(0, 32), text: res.text, voiceId: res.voiceId, ts: Date.now(), dur: src.duration }); saveRecents(); }
    setTimeout(() => $('.play', r)?.click(), 250);
    $('#again', r).onclick = () => { p(); $('.play', r).click(); };
    $('#sh', r).onclick = () => navigator.share ? navigator.share({ title: 'JoloVocals', text: res.text }).catch(() => {}) : navigator.clipboard?.writeText(res.text).then(() => toast('Text copied'));
    $('#rm', r).onclick = () => { S.recents = S.recents.filter(a => a.id !== res.id); saveRecents(); S.ttsResult = null; go('tts'); };
    $('#dl', r).onclick = () => toast('Downloads need a server-side TTS engine');
  } };
};

V.v2v = () => {
  const st = S.v2v; st.voiceId = findVoice(st.voiceId) ? st.voiceId : allVoices()[0].id;
  return { html: `<section class="screen has-nav">${top('Voice to Voice')}${captureHtml('Upload or Record Audio', 120)}
    <div id="chosen">${st.sample ? chosenHtml(st.sample) : ''}</div>
    <label class="lbl">Target Voice</label><select class="field" id="v">${voiceOptions(st.voiceId)}</select>
    <div class="grow"></div><div class="gap"></div><button class="btn" id="conv" ${st.sample ? '' : 'disabled'}>${icon('wave')} Convert Audio</button>${nav('v2v')}</section>`,
  bind: r => {
    const show = () => { $('#chosen', r).innerHTML = chosenHtml(st.sample); $('#conv', r).disabled = false; bindPlayer($('.filechip', r), async () => bufferSource(st.sample.buf)); };
    if (st.sample) show();
    const stopRec = bindCapture(r, async blob => { const s = await loadSample(blob, 1); if (s) { st.sample = s; show(); } }, 120);
    $('#v', r).onchange = e => { st.voiceId = e.target.value; };
    $('#conv', r).onclick = async () => {
      const btn = $('#conv', r), voice = findVoice(st.voiceId); btn.disabled = true; btn.textContent = 'Converting…'; stopRec(); await sleep(30);
      try {
        const srcPitch = detectPitch(st.sample.buf); if (!srcPitch) toast('Couldn’t detect the pitch of your audio – converting at neutral');
        const ratio = srcPitch ? clamp((voice.pitch || 150) / srcPitch, .5, 2) : 1, { data, sr } = pitchShift(st.sample.buf, ratio);
        const out = ac().createBuffer(1, data.length, sr); out.copyToChannel(data, 0);
        const id = uid(), blob = encodeWav(data, sr); await idb.put('audio:' + id, blob);
        S.v2vResult = { id, original: st.sample.buf, converted: out, blob, voice: voice.name };
        S.recents.unshift({ id, kind: 'v2v', title: `Converted to ${voice.name}`, ts: Date.now(), dur: out.duration }); saveRecents(); go('v2v-result');
      } catch (e) { console.error(e); toast('Conversion failed'); btn.disabled = false; btn.textContent = 'Convert Audio'; }
    };
  } };
};

V['v2v-result'] = () => {
  const res = S.v2vResult; if (!res) return { html: '', bind: () => go('v2v') };
  let which = 'converted';
  return { html: `<section class="screen">${top('Converted Audio')}
    <div class="seg"><button data-w="original" ${res.original ? '' : 'disabled'}>Original</button><button data-w="converted" class="on">Converted</button></div>
    <div class="player" id="pl"></div>
    <div class="actions"><button class="act" id="dl">${icon('download')}Download</button><button class="act" id="sh">${icon('share')}Share</button><button class="act del" id="rm">${icon('trash')}Delete</button></div>
    <div class="grow"></div><button class="btn" id="more">${icon('wave')} Convert Another</button></section>`,
  bind: r => {
    let halt;
    const draw = () => { const buf = res[which]; $('#pl', r).innerHTML = playerHtml(peaks(buf), buf.duration, true); halt = bindPlayer($('#pl', r), async () => bufferSource(res[which])); };
    draw();
    $$('.seg button', r).forEach(b => b.onclick = () => { if (b.disabled) return; halt(); which = b.dataset.w; $$('.seg button', r).forEach(x => x.classList.toggle('on', x === b)); draw(); });
    $('#dl', r).onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(res.blob); a.download = `jolovocals-${res.id}.wav`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
    $('#sh', r).onclick = async () => { const f = new File([res.blob], 'jolovocals.wav', { type: 'audio/wav' });
      if (navigator.canShare?.({ files: [f] })) navigator.share({ files: [f] }).catch(() => {}); else toast('Sharing files isn’t supported here – use Download'); };
    $('#rm', r).onclick = () => { S.recents = S.recents.filter(a => a.id !== res.id); saveRecents(); idb.del('audio:' + res.id); S.v2vResult = null; go('v2v'); };
    $('#more', r).onclick = () => { S.v2v.sample = null; go('v2v'); };
  } };
};

V.profile = () => ({
  html: `<section class="screen has-nav">${top('Profile', false)}<div class="center"><div class="okmark" style="background:var(--soft);color:var(--p);width:84px;height:84px">${icon('user')}</div>
    <h2>${esc(S.user.name)}</h2><p class="muted">${esc(S.user.id)}</p></div><div class="gap"></div>
    <div class="card"><strong>${S.voices.length}</strong> custom voice${S.voices.length === 1 ? '' : 's'} saved on this device</div>
    <div class="grow"></div><button class="btn outline" id="out">Sign out</button><div class="gap"></div><button class="btn outline" id="wipe" style="color:var(--red)">Delete all local data</button>${nav('profile')}</section>`,
  bind: r => {
    $('#out', r).onclick = () => { S.user = null; ls.set('user', null); go('login'); };
    $('#wipe', r).onclick = () => { if (!confirm('Delete all voices, audio and your account from this browser?')) return;
      indexedDB.deleteDatabase('jolovocals'); ['user', 'voices', 'recents'].forEach(k => localStorage.removeItem('jv.' + k)); location.hash = '#/splash'; location.reload(); };
  } });

/* ───────────── router ───────────── */
const PUBLIC = new Set(['splash', 'login']);
function render() {
  const name = (location.hash.replace(/^#\//, '') || 'splash');
  if (S.stopPlayback) S.stopPlayback();
  speechSynthesis?.cancel();
  const app = $('#app'); if (app._cleanup) app._cleanup();
  if (!V[name]) return go('splash');
  if (!PUBLIC.has(name) && !S.user) return go('login');
  const view = V[name](); app.innerHTML = view.html; app._cleanup = null;
  $$('[data-go]', app).forEach(b => b.onclick = () => go(b.dataset.go));
  $$('[data-back]', app).forEach(b => b.onclick = () => history.length > 1 ? history.back() : go('home'));
  const c = view.bind(app); app.scrollTo?.(0, 0); window.scrollTo(0, 0);
  if (c && c.catch) c.catch(console.error);
}
window.addEventListener('hashchange', render);
speechSynthesis?.getVoices();
render();
})();
