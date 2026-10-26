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
  chev: '<path d="M6 9l6 6 6-6"/>',
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

/* ───────────── optional Supabase sync (active only when config.js has a key) ───────────── */
const cloud = (() => {
  const cfg = window.JV_CONFIG || {}, on = !!(window.supabase && cfg.SUPABASE_URL && cfg.SUPABASE_KEY);
  const sb = on ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_KEY) : null;
  let uid_ = null;
  const safe = async fn => { try { const r = await fn(); if (r?.error) throw r.error; return r; } catch (e) { console.warn('[cloud]', e.message || e); return null; } };
  const path = f => `${uid_}/${f.replace(':', '-')}`;
  return {
    on, hosted: on && !!cfg.HOSTED_VOICES,
    /** POST to the voice-api Edge Function (ElevenLabs proxy). `body` is a JSON string or FormData. */
    async fn(path, body) {
      const { data } = await sb.auth.getSession(), token = data.session?.access_token;
      if (!token) throw new Error('sign in required');
      const r = await fetch(`${cfg.SUPABASE_URL}/functions/v1/voice-api/${path}`, { method: 'POST', body,
        headers: { authorization: `Bearer ${token}`, apikey: cfg.SUPABASE_KEY, ...(typeof body === 'string' ? { 'content-type': 'application/json' } : {}) } });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `request failed (${r.status})`);
      return r;
    },
    async session() { const { data } = await sb.auth.getSession(); const u = data.session?.user || null; uid_ = u?.id || null; return u; },
    async auth(mode, email, password) {
      const { data, error } = mode === 'up' ? await sb.auth.signUp({ email, password }) : await sb.auth.signInWithPassword({ email, password });
      if (error) throw error; uid_ = data.session?.user?.id || null; return data;
    },
    signOut: () => safe(() => sb.auth.signOut()).then(() => { uid_ = null; }),
    async pull() {
      const [v, r] = await Promise.all([sb.from('voices').select('*').order('created', { ascending: false }), sb.from('recents').select('*').order('ts', { ascending: false }).limit(20)]);
      if (v.error || r.error) return null;
      return { voices: v.data.map(({ user_id, remote_id, ...x }) => ({ ...x, remote: remote_id })), recents: r.data.map(({ user_id, voice_id, ...x }) => ({ ...x, voiceId: voice_id })) };
    },
    upsertVoice: v => on && uid_ && safe(() => sb.from('voices').upsert({ id: v.id, name: v.name, cat: v.cat, pitch: v.pitch, gender: v.gender ?? null, remote_id: v.remote ?? null, dur: v.dur, created: v.created }, { onConflict: 'user_id,id' })),
    deleteVoice: id => on && uid_ && safe(() => sb.from('voices').delete().eq('id', id)),
    upsertRecent: a => on && uid_ && safe(() => sb.from('recents').upsert({ id: a.id, kind: a.kind, title: a.title, text: a.text ?? null, voice_id: a.voiceId ?? null, ts: a.ts, dur: a.dur }, { onConflict: 'user_id,id' })),
    deleteRecent: id => on && uid_ && safe(() => sb.from('recents').delete().eq('id', id)),
    putBlob: (key, blob) => on && uid_ && safe(() => sb.storage.from('voice-audio').upload(path(key), blob, { upsert: true, contentType: blob.type || 'audio/wav' })),
    async getBlob(key) { if (!on || !uid_) return undefined; const r = await safe(() => sb.storage.from('voice-audio').download(path(key))); return r?.data || undefined; },
    delBlob: key => on && uid_ && safe(() => sb.storage.from('voice-audio').remove([path(key)])),
  };
})();
/** Blob store: IndexedDB as a local cache, Supabase Storage as the source of truth when enabled. */
const blobs = {
  put: async (key, blob) => { await idb.put(key, blob); cloud.putBlob(key, blob); },
  get: async key => (await idb.get(key)) || (await cloud.getBlob(key).then(async b => { if (b) await idb.put(key, b); return b; })),
  del: key => { idb.del(key); cloud.delBlob(key); },
};

const PRESETS = [
  { id: 'pre-narrator', gender: 'female', name: 'Female Narrator', cat: 'English', pitch: 210, dur: 60, preset: true },
  { id: 'pre-anchor', gender: 'male', name: 'News Anchor', cat: 'Hindi', pitch: 115, dur: 60, preset: true },
  { id: 'pre-char', gender: 'female', name: 'Character 1', cat: 'Custom', pitch: 290, dur: 180, preset: true },
  { id: 'pre-deep', gender: 'male', name: 'Deep Voice', cat: 'English', pitch: 85, dur: 90, preset: true },
  { id: 'pre-man', gender: 'male', name: 'Young Man', cat: 'Male', pitch: 125, dur: 60, preset: true },
  { id: 'pre-elder', gender: 'male', name: 'Elderly Man', cat: 'Male', pitch: 100, dur: 60, preset: true },
  { id: 'pre-woman', gender: 'female', name: 'Soft Woman', cat: 'Female', pitch: 235, dur: 60, preset: true },
  { id: 'pre-grand', gender: 'female', name: 'Elderly Woman', cat: 'Female', pitch: 195, dur: 60, preset: true },
  { id: 'pre-child', gender: 'female', name: 'Child', cat: 'Character', pitch: 330, dur: 60, preset: true },
  { id: 'pre-monster', gender: 'male', name: 'Monster', cat: 'Character', pitch: 60, dur: 60, preset: true },
  { id: 'pre-chip', gender: 'female', name: 'Chipmunk', cat: 'Effects', pitch: 400, dur: 60, preset: true },
  { id: 'pre-robot', gender: 'male', name: 'Robot', cat: 'Effects', pitch: 140, fx: 'robot', dur: 60, preset: true },
  { id: 'pre-alien', gender: 'female', name: 'Alien', cat: 'Effects', pitch: 300, fx: 'robot', dur: 60, preset: true },
  { id: 'pre-whisper', gender: 'female', name: 'Whisper', cat: 'Effects', pitch: 160, fx: 'whisper', dur: 60, preset: true },
];
const CATEGORIES = ['Personal', 'English', 'Hindi', 'Male', 'Female', 'Character', 'Effects', 'Custom'];
const VS_DEFAULTS = { stability: .7, similarity: .6, style: 0, speed: 1, pitch: 0, volume: 1, boost: true };
const S = {
  user: ls.get('user', null),
  voices: ls.get('voices', []),
  recents: ls.get('recents', []),
  draft: null,                  // voice being created: { blob, buf, dur }
  consent: false,
  tts: { sysVoice: ls.get('sysvoice', ''), voiceId: null, text: 'Namaste, yeh ek test hai JoloVocals AI Voice Studio ka.' },
  vs: { ...VS_DEFAULTS, ...ls.get('voicesettings', {}) },   // voice control settings, shared by Text to Voice and Voice to Voice
  ttsResult: null, v2v: { sample: null, voiceId: null }, v2vResult: null,
  libTab: 'mine', libQuery: '', stopPlayback: null,
  elVoices: ls.get('elvoices', []),   // voices from the ElevenLabs account (hosted mode)
};
const allVoices = () => [...S.voices, ...S.elVoices, ...PRESETS];
const LANGS = { hi: 'Hindi', en: 'English', kn: 'Kannada', ta: 'Tamil', te: 'Telugu', mr: 'Marathi', bn: 'Bengali', pt: 'Portuguese', de: 'German', nl: 'Dutch', it: 'Italian', tr: 'Turkish' };
/**
 * ElevenLabs voice that speaks for a voice without its own (presets, local voices): same gender, calm rather than a
 * character voice, a native Hindi voice for Hindi when the plan allows it, else English. Undefined if none.
 */
const elVoiceFor = (male, hindi) => {
  const g = male ? 'male' : 'female', calm = v => !/kids|character|story|trickster|warrior|quirky/i.test(v.name);
  const pool = S.elVoices.filter(v => v.gender === g), lang = l => pool.filter(v => v.lang === l);
  return [...(hindi ? [lang('hi')] : []), lang('en'), pool].map(p => p.find(calm) || p[0]).find(Boolean);
};
/** Fetch the ElevenLabs account's own voices through voice-api; re-render screens that list voices. */
async function loadElVoices() {
  if (!cloud.hosted || !S.user) return;
  try {
    const { voices } = await (await cloud.fn('voices', '{}')).json();
    S.elVoices = voices.map(v => ({ id: 'el-' + v.voice_id, remote: v.voice_id, name: v.name, preview: v.preview_url, gender: v.gender === 'male' || v.gender === 'female' ? v.gender : undefined,
      lang: v.language, cat: ['ElevenLabs', LANGS[v.language] || v.language].filter(Boolean).join(' • '), dur: 0, preset: true, el: true }));
    ls.set('elvoices', S.elVoices);
    if (['#/tts', '#/v2v', '#/library'].includes(location.hash)) render();
  } catch (e) { console.warn('[elevenlabs voices]', e); }
}
/** Plays a remote audio URL (voice previews). */
const urlSource = url => ({ duration: 5, play(onEnd) {
  const el = new Audio(url); let off = false; el.onended = el.onerror = () => { if (!off) onEnd(); }; el.play().catch(() => { if (!off) onEnd(); });
  return () => { off = true; el.pause(); };
} });
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
    let best = 0, bestLag = 0; const rr = new Float32Array(maxLag + 1);
    for (let lag = minLag; lag <= maxLag; lag++) { let r = 0; for (let i = 0; i < W; i++) r += d[s + i] * d[s + i + lag]; rr[lag] = r / e; if (rr[lag] > best) { best = rr[lag]; bestLag = lag; } }
    for (let lag = minLag; bestLag && lag * 2 <= bestLag + 1; lag++) if (rr[lag] > best * .9 && Math.abs(lag * 2 - bestLag) <= 2) { bestLag = lag; break; }   // octave-down fix
    if (best > .5 && bestLag) pitches.push(rate / bestLag);
  }
  if (!pitches.length) return 0;
  pitches.sort((a, b) => a - b);
  return Math.round(pitches[pitches.length >> 1]);
}

/** Frame-wise f0 track (Hz, 0 = unvoiced) via autocorrelation. Returns { hop (samples at sr), f0 }. */
function pitchTrack(x, sr) {
  const f = Math.max(1, Math.round(sr / 11025)), n = Math.floor(x.length / f), d = new Float32Array(n), rate = sr / f;
  for (let i = 0; i < n; i++) { let s = 0; for (let k = 0; k < f; k++) s += x[i * f + k]; d[i] = s / f; }
  const W = Math.round(rate * .035), hop = Math.round(rate * .01), minLag = Math.floor(rate / 400), maxLag = Math.floor(rate / 70), f0 = [];
  let peak = 0; for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]));
  for (let s = 0; s + W + maxLag < n; s += hop) {
    let e = 0; for (let i = 0; i < W; i++) e += d[s + i] * d[s + i];
    if (e / W < (peak * .03) ** 2) { f0.push(0); continue; }
    const r = new Float32Array(maxLag + 1); let best = 0, bl = 0;
    for (let lag = minLag; lag <= maxLag; lag++) { let c = 0; for (let i = 0; i < W; i++) c += d[s + i] * d[s + i + lag]; r[lag] = c / e; if (r[lag] > best) { best = r[lag]; bl = lag; } }
    for (let lag = minLag; lag * 2 <= bl + 1 && bl; lag++) if (r[lag] > best * .9 && Math.abs(lag * 2 - bl) <= 2) { bl = lag; break; }   // octave-down fix
    f0.push(best > .5 && bl ? rate / bl : 0);
  }
  const sm = f0.map((v, i) => { if (!v) return 0; const w = []; for (let k = -2; k <= 2; k++) if (f0[i + k]) w.push(f0[i + k]); w.sort((p, q) => p - q); return w[w.length >> 1]; });
  return { hop: hop * f, f0: sm };   // median-smoothed so pitch marks don't jitter
}

/**
 * Formant-preserving pitch shift (TD-PSOLA). Pitch moves by `ratio`; formants move by `formant`
 * (default ratio^0.3, so a deeper voice gets a longer vocal tract, not a "slowed-down" one).
 * Returns null when too little of the audio is voiced – callers then fall back to pitchShift().
 */
function psolaShift(buf, ratio, formant = Math.pow(ratio, .3)) {
  const x = mono(buf), n = x.length, sr = buf.sampleRate, { hop, f0 } = pitchTrack(x, sr);
  if (f0.filter(Boolean).length < f0.length * .2) return null;
  const f0At = p => { const i = Math.min(f0.length - 1, Math.max(0, Math.round(p / hop))); return f0[i]; };
  // analysis pitch marks: peaks spaced one period apart (voiced) or fixed 10 ms steps (unvoiced)
  const marks = []; let pos = Math.round(sr * .005);
  while (pos < n - 2) {
    const hz = f0At(pos), T = hz ? Math.round(sr / hz) : Math.round(sr * .01);
    let p = pos;
    if (hz) { let bv = -Infinity; const q = Math.round(T / 4); for (let i = Math.max(0, pos - q); i <= Math.min(n - 1, pos + q); i++) if (x[i] > bv) { bv = x[i]; p = i; } }
    marks.push({ p, T, v: !!hz }); pos = p + T;
  }
  const out = new Float32Array(n), wsum = new Float32Array(n);
  let ts = marks[0].p, mi = 0;
  while (ts < n) {
    while (mi + 1 < marks.length && Math.abs(marks[mi + 1].p - ts) <= Math.abs(marks[mi].p - ts)) mi++;
    const m = marks[mi], r = m.v ? ratio : 1, fs = m.v ? formant : 1, L = m.T;
    for (let k = -L; k <= L; k++) {
      const o = ts + k, src = m.p + k * fs; if (o < 0 || o >= n || src < 0 || src >= n - 1) continue;
      const i0 = Math.floor(src), fr = src - i0, w = .5 + .5 * Math.cos(Math.PI * k / L);
      out[o] += (x[i0] * (1 - fr) + x[i0 + 1] * fr) * w; wsum[o] += w;
    }
    ts += Math.max(1, Math.round(m.T / r));
  }
  for (let i = 0; i < n; i++) out[i] = wsum[i] > .15 ? out[i] / wsum[i] : out[i] / .15;
  return { data: out, sr };
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

/** Voice effects applied after pitch shifting: 'robot' (ring modulation) and 'whisper' (noise shaped by the speech envelope). */
function applyFx(data, sr, fx) {
  if (!fx) return data;
  const out = new Float32Array(data.length);
  if (fx === 'robot') { for (let i = 0; i < data.length; i++) out[i] = data[i] * (.35 + .65 * Math.sin(2 * Math.PI * 60 * i / sr)); }
  else if (fx === 'whisper') { let env = 0; const k = 1 - Math.exp(-1 / (sr * .01)); for (let i = 0; i < data.length; i++) { env += (Math.abs(data[i]) - env) * k; out[i] = (Math.random() * 2 - 1) * env * 2.2; } }
  return out;
}

function encodeWav(data, sr) {
  const b = new DataView(new ArrayBuffer(44 + data.length * 2)), w = (o, s) => [...s].forEach((c, i) => b.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); b.setUint32(4, 36 + data.length * 2, true); w(8, 'WAVEfmt '); b.setUint32(16, 16, true); b.setUint16(20, 1, true); b.setUint16(22, 1, true);
  b.setUint32(24, sr, true); b.setUint32(28, sr * 2, true); b.setUint16(32, 2, true); b.setUint16(34, 16, true); w(36, 'data'); b.setUint32(40, data.length * 2, true);
  for (let i = 0; i < data.length; i++) b.setInt16(44 + i * 2, clamp(data[i], -1, 1) * 0x7fff, true);
  return new Blob([b], { type: 'audio/wav' });
}

/** Mono 22.05 kHz WAV of the first `maxSec` seconds – small enough to upload to the hosted voice API. */
function wavForUpload(buf, maxSec = 180, sr = 22050) {
  const x = mono(buf), step = buf.sampleRate / sr, n = Math.min(Math.floor(x.length / step), Math.floor(maxSec * sr)), d = new Float32Array(n);
  for (let i = 0; i < n; i++) { const p = i * step, i0 = Math.floor(p), fr = p - i0; d[i] = x[i0] * (1 - fr) + (x[i0 + 1] ?? x[i0]) * fr; }
  return encodeWav(d, sr);
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

/* Text tags: [pause 1s] works with every engine; expressive tags ([laughs], [whispers]…) are performed by ElevenLabs and dropped elsewhere. */
const TAG_GROUPS = [
  ['Emotion', ['happy', 'sad', 'excited', 'angry', 'calm', 'curious', 'sarcastic']],
  ['Delivery', ['whispers', 'shouts', 'laughs', 'sighs', 'clears throat']],
  ['Pause', ['pause 0.5s', 'pause 1s', 'pause 2s']],
];
const PAUSE_TAG = /\[pause\s*([\d.]+)\s*s\]/gi;
/** Splits text at [pause Ns] tags and removes other tags: [{ text, pause }] with pause in seconds after each piece. */
const tagSegments = text => {
  const out = []; let last = 0, m; PAUSE_TAG.lastIndex = 0;
  while ((m = PAUSE_TAG.exec(text))) { out.push({ text: text.slice(last, m.index), pause: Math.min(3, +m[1] || .5) }); last = PAUSE_TAG.lastIndex; }
  out.push({ text: text.slice(last), pause: 0 });
  return out.map(s => ({ ...s, text: s.text.replace(/\[[^\]\n]{1,40}\]/g, ' ').replace(/\s+/g, ' ').trim() }));
};
const stripTags = text => tagSegments(text).map(s => s.text).filter(Boolean).join('. ');

/**
 * Shapes stand-in ElevenLabs audio toward a preset or local voice: moves its pitch toward the voice's pitch
 * (Similarity slider = how far; small shifts are skipped because they add artifacts) and applies its effect.
 * Returns a new AudioBuffer, or null when nothing changes.
 */
function shapeToVoice(buf, voice, similarity) {
  let data = null; const bp = voice.pitch ? detectPitch(buf) : 0, eff = bp ? 1 + (voice.pitch / bp - 1) * similarity : 1;
  if (Math.abs(eff - 1) > .12) { const r = clamp(eff, .75, 1.35); data = (psolaShift(buf, r) || pitchShift(buf, r)).data; }
  if (voice.fx) data = applyFx(data || mono(buf), buf.sampleRate, voice.fx);
  if (!data) return null;
  const out = ac().createBuffer(1, data.length, buf.sampleRate); out.copyToChannel(data, 0); return out;
}

const FEMALE_RE = /female|woman|zira|samantha|susan|hazel|karen|victoria|moira|tessa|fiona|heera|kalpana|veena|serena|allison|ava|jenny|aria|google (us|uk) english(?! male)|google हिन्दी|google hindi/i;
const MALE_RE = /\bmale\b|david|daniel|alex\b|fred|mark|george|guy|james|ryan|thomas|rishi|aaron|arthur|hemant|ravi|prabhat|oliver|christopher|eric|roger|steffan/i;
const isMaleName = name => !FEMALE_RE.test(name) && MALE_RE.test(name);
const isMale = v => v.gender ? v.gender === 'male' : (v.pitch || 150) < 165;
/** Best matching system voice for a language and gender; null lets the browser use its default. */
function pickSystemVoice(voices, lang, male) {
  const pool = voices.filter(v => v.lang.toLowerCase().startsWith(lang));
  return pool.find(v => (male ? isMaleName(v.name) : FEMALE_RE.test(v.name))) || pool.find(v => v.localService) || pool[0] || null;
}
/** Browser speech synthesis shaped by a voice profile (pitch ratio), the stability/similarity sliders and the speed/pitch/volume controls. */
function speakSource(text, voice, stability, similarity, sysName = '', ctl = {}) {
  const words = text.trim().split(/\s+/).length;
  return { duration: Math.max(1, words * .4), play(onEnd) {
    const synth = window.speechSynthesis; let off = false; synth.cancel();
    const plain = stripTags(text) || text, parts = plain.match(/[^.!?।]+[.!?।]*/g) || [plain], hi = voice.cat === 'Hindi', male = isMale(voice);
    const all = synth.getVoices(), chosen = sysName && all.find(v => v.name === sysName), sv = chosen || pickSystemVoice(all, hi ? 'hi' : 'en', male);
    if (!chosen && male && sv && !isMaleName(sv.name)) toast('No male system voice found – pick one under “Base voice”');
    const base = !sv ? 160 : chosen && !isMaleName(sv.name) && !FEMALE_RE.test(sv.name) ? (male ? 115 : 200) : isMaleName(sv.name) ? 115 : FEMALE_RE.test(sv.name) ? 200 : 160, ratio = clamp((voice.pitch || 150) / base, .3, 2.5);
    parts.forEach((p, i) => {
      const u = new SpeechSynthesisUtterance(p.trim()); if (sv) { u.voice = sv; u.lang = sv.lang; }
      const jitter = (Math.random() - .5) * (1 - stability) * .6;
      u.pitch = clamp((1 + (ratio - 1) * similarity + jitter) * 2 ** ((ctl.pitch || 0) / 12), .1, 2); u.rate = clamp(ctl.speed ?? .8 + stability * .3, .5, 2); u.volume = clamp(ctl.volume ?? 1, 0, 1);
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
  const finish = async () => { clearInterval(tick); recBtn.classList.remove('live'); const s = session; session = null; if (s) onBlob(await s.stop(), true); };
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

/* ───────────── voice control settings ───────────── */
const CONTROLS = {
  stability: ['Stability', 0, 1, .05, v => v.toFixed(2), 'Higher is steadier, lower is more expressive'],
  similarity: ['Similarity', 0, 1, .05, v => v.toFixed(2), 'How closely to match the chosen voice'],
  style: ['Style', 0, 1, .05, v => v.toFixed(2), 'Extra expressiveness (ElevenLabs voices)'],
  speed: ['Speed', .7, 1.2, .05, v => v.toFixed(2) + '×', ''],
  pitch: ['Pitch', -6, 6, 1, v => (v > 0 ? '+' : '') + v + ' st', 'Semitones, applied to the finished audio'],
  volume: ['Volume', 0, 1.5, .05, v => Math.round(v * 100) + '%', ''],
};
const saveVs = () => ls.set('voicesettings', S.vs);
const settingsHtml = (keys, boost) => `<details class="vs" open><summary>Voice settings</summary>
  ${keys.map(k => { const [label, min, max, step, show, hint] = CONTROLS[k];
    return `<div class="slider" title="${esc(hint)}"><span>${label}</span><input type="range" data-vs="${k}" min="${min}" max="${max}" step="${step}" value="${S.vs[k]}" aria-label="${label}"><b data-vsv="${k}">${show(S.vs[k])}</b></div>`; }).join('')}
  ${boost ? `<label class="check" style="margin:8px 0"><input type="checkbox" data-vs="boost" ${S.vs.boost ? 'checked' : ''}><span>Speaker boost <span class="muted">– closer to the original speaker (ElevenLabs)</span></span></label>` : ''}
  <button type="button" class="btn ghost" data-vs-reset style="padding:10px;margin-top:6px">Reset to defaults</button></details>`;
function bindSettings(r) {
  const sync = () => $$('[data-vs]', r).forEach(i => { const k = i.dataset.vs; if (i.type === 'checkbox') i.checked = S.vs[k]; else { i.value = S.vs[k]; $(`[data-vsv="${k}"]`, r).textContent = CONTROLS[k][4](S.vs[k]); } });
  $$('[data-vs]', r).forEach(i => i.oninput = i.onchange = () => { const k = i.dataset.vs; S.vs[k] = i.type === 'checkbox' ? i.checked : +i.value; if (CONTROLS[k]) $(`[data-vsv="${k}"]`, r).textContent = CONTROLS[k][4](S.vs[k]); saveVs(); });
  const reset = $('[data-vs-reset]', r); if (reset) reset.onclick = () => { S.vs = { ...VS_DEFAULTS }; saveVs(); sync(); toast('Voice settings reset'); };
}
/** Applies the Pitch and Volume controls to finished audio. Returns a new AudioBuffer, or null when nothing changes. */
function applyControls(buf, vs = S.vs) {
  if (!vs.pitch && vs.volume === 1) return null;
  let data = mono(buf);
  if (vs.pitch) { const r = 2 ** (vs.pitch / 12); data = (psolaShift(buf, r) || pitchShift(buf, r)).data; }
  if (vs.volume !== 1) { data = data.map(x => x * vs.volume); if (vs.volume > 1) data = data.map(x => Math.tanh(x)); }   // soft-limit boosts so they don't clip
  const out = ac().createBuffer(1, data.length, buf.sampleRate); out.copyToChannel(data, 0); return out;
}

/* ───────────── views ───────────── */
const nav = on => `<nav class="bottom">
  ${[['home', 'home', 'Home'], ['tts', 'text', 'Generate']].map(([r, ic, l]) => `<button data-go="${r}" class="${on === r ? 'on' : ''}">${icon(ic)}${l}</button>`).join('')}
  <button class="mic" data-go="v2v" aria-label="Voice to voice">${icon('mic')}</button>
  ${[['library', 'lib', 'Library'], ['profile', 'user', 'Profile']].map(([r, ic, l]) => `<button data-go="${r}" class="${on === r ? 'on' : ''}">${icon(ic)}${l}</button>`).join('')}</nav>`;
const top = (title, back = true) => `<div class="top">${back ? `<button class="icon-btn" data-back aria-label="Back">${icon('back')}</button>` : ''}<h2>${title}</h2></div>`;
/** Custom dropdown. Renders <div class="dd" id=…>; after bind, `el.value` and a 'change' event work like a <select>. */
const ddHtml = (id, groups, sel) => {
  const flat = groups.flatMap(g => g.items), cur = flat.find(o => o.value === sel) || flat[0];
  return `<div class="dd" id="${id}" data-value="${esc(cur.value)}"><button type="button" class="field dd-btn" aria-haspopup="listbox" aria-expanded="false"><span class="dd-label">${esc(cur.label)}${cur.sub ? `<small>${esc(cur.sub)}</small>` : ''}</span><span class="dd-caret">${icon('chev')}</span></button>
    <ul class="dd-list" role="listbox" hidden>${groups.map(g => (g.title ? `<li class="dd-group" role="presentation">${esc(g.title)}</li>` : '') + g.items.map(o => `<li role="option" tabindex="-1" data-v="${esc(o.value)}" aria-selected="${o.value === cur.value}"><span>${esc(o.label)}</span>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</li>`).join('')).join('')}</ul></div>`;
};
function bindDropdowns(root) {
  $$('.dd', root).forEach(dd => {
    const btn = $('.dd-btn', dd), list = $('.dd-list', dd), opts = $$('[role=option]', dd);
    Object.defineProperty(dd, 'value', { get: () => dd.dataset.value });
    const close = () => { list.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    const open = () => { $$('.dd-list').forEach(l => { l.hidden = true; }); list.hidden = false; btn.setAttribute('aria-expanded', 'true');
      const s = $('[aria-selected=true]', dd); s?.scrollIntoView({ block: 'nearest' }); s?.focus(); };
    const pick = o => { dd.dataset.value = o.dataset.v; opts.forEach(x => x.setAttribute('aria-selected', x === o));
      $('.dd-label', dd).innerHTML = o.innerHTML; close(); btn.focus(); dd.dispatchEvent(new Event('change')); };
    btn.onclick = () => list.hidden ? open() : close();
    opts.forEach(o => { o.onclick = () => pick(o);
      o.onkeydown = e => { const i = opts.indexOf(o);
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(o); }
        else if (e.key === 'ArrowDown') { e.preventDefault(); opts[Math.min(i + 1, opts.length - 1)].focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); opts[Math.max(i - 1, 0)].focus(); }
        else if (e.key === 'Escape') { close(); btn.focus(); } }; });
  });
}
document.addEventListener('click', e => { if (!e.target.closest('.dd')) $$('.dd-list').forEach(l => { l.hidden = true; }); });
const baseVoiceDropdown = (id, sel) => {
  const dev = (window.speechSynthesis?.getVoices() || []).filter(v => /^(en|hi)/i.test(v.lang))
    .map(v => ({ value: v.name, label: v.name, sub: `${v.lang} • ${isMaleName(v.name) ? 'male' : FEMALE_RE.test(v.name) ? 'female' : 'unknown'} • device` }));
  return ddHtml(id, [{ items: [{ value: '', label: 'Automatic', sub: 'device voice matching male/female' }] }, ...(dev.length ? [{ title: 'Device voices', items: dev }] : [])], sel);
};
const voiceItem = v => ({ value: v.id, label: v.name, sub: `${v.gender && v.el ? v.gender + ' • ' : ''}${v.cat}${v.pitch ? ` • ${v.pitch} Hz` : ''}${v.fx ? ` • ${v.fx}` : ''}` });
const voiceDropdown = (id, sel) => {
  const hi = S.elVoices.filter(v => v.lang === 'hi'), other = S.elVoices.filter(v => v.lang !== 'hi');
  return ddHtml(id, [...(S.voices.length ? [{ title: 'My voices', items: S.voices.map(voiceItem) }] : []),
    ...(hi.length ? [{ title: 'ElevenLabs · Hindi', items: hi.map(voiceItem) }] : []), ...(other.length ? [{ title: 'ElevenLabs voices', items: other.map(voiceItem) }] : []),
    { title: 'Preset voices', items: PRESETS.map(voiceItem) }], sel);
};
const go = r => { location.hash = '#/' + r; };

const V = {};

/** After a cloud sign-in or session restore: set the user and replace local lists with the account's data. */
async function startSession(u) {
  const nm = (u.email || 'Friend').split('@')[0];
  S.user = { id: u.email, name: nm.charAt(0).toUpperCase() + nm.slice(1) }; ls.set('user', S.user);
  const d = await cloud.pull();
  if (d) { S.voices = d.voices; S.recents = d.recents; saveVoices(); saveRecents(); }
  loadElVoices();
}

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
    <p class="muted center" style="margin-top:14px">${cloud.on ? 'Your voices sync to your account.' : 'Demo mode: accounts are stored only in this browser.'}</p></section>`,
  bind: r => {
    $$('[data-demo]', r).forEach(b => b.onclick = () => toast('Social sign-in needs a backend – use email/phone for the demo'));
    $$('.tabs button', r).forEach(b => b.onclick = () => { mode = b.dataset.m; $$('.tabs button', r).forEach(x => x.classList.toggle('on', x === b)); $('#go', r).textContent = mode === 'in' ? 'Sign In' : 'Create Account'; });
    $('#f', r).onsubmit = async e => { e.preventDefault(); const id = $('#id', r).value.trim(), pw = $('#pw', r).value;
      if (cloud.on) {
        if (!id.includes('@')) return toast('Please sign in with your email address');
        const btn = $('#go', r); btn.disabled = true;
        try {
          const d = await cloud.auth(mode, id, pw);
          if (!d.session) { btn.disabled = false; return toast('Check your email to confirm your account, then sign in'); }
          await startSession(d.session.user); go('home');
        } catch (err) { btn.disabled = false; toast(err.message || 'Sign-in failed'); }
        return;
      }
      const nm = id.includes('@') ? id.split('@')[0] : 'Friend';
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
  if (a.kind === 'tts') { const blob = await blobs.get('audio:' + id), buf = blob ? await decode(blob).catch(() => null) : null; S.ttsResult = { text: a.text, voiceId: a.voiceId, id: a.id, ...(buf ? { buf, blob } : {}) }; return go('tts-result'); }
  const blob = await blobs.get('audio:' + id); if (!blob) return toast('That audio is no longer stored');
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
    const show = () => { $('#chosen', r).innerHTML = chosenHtml(S.draft); $('#next', r).disabled = false; halt = bindPlayer($('.filechip', r), async () => bufferSource(S.draft.buf));
      $('.retake', r).onclick = () => { const again = S.draft.rec; halt(); S.draft = null; $('#chosen', r).innerHTML = ''; $('#next', r).disabled = true; $('.rec-time', r).textContent = `00:00 / ${fmt(300)}`; if (again) $('.rec', r).click(); }; };
    if (d) show();
    const stopRec = bindCapture(r, async (blob, rec) => { const s = await loadSample(blob, 3); if (!s) return; if (s.dur < 60) toast('Tip: 1–5 minutes gives the best profile'); s.rec = rec; S.draft = s; show(); }, 300);
    $('#next', r).onclick = () => { stopRec(); go('consent'); };
    r._cleanup = () => { stopRec(); halt && halt(); };
  } };
};
const chosenHtml = d => `<div class="filechip" style="display:block">${playerHtml(peaks(d.buf, 30), d.dur)}<button type="button" class="btn outline retake" style="margin-top:12px">↺ Retake</button></div>`;

V.consent = () => ({
  html: `<section class="screen">${top('Voice Consent')}<div class="consent"><div class="ic">${icon('doc')}</div><h2>Confirm Permission</h2>
    <p class="muted">I confirm that I have the right and permission to clone this voice and will use it responsibly.</p>${cloud.hosted ? '<p class="muted">Your sample is sent to our voice provider (ElevenLabs) to build the clone, and deleted there when you delete the voice.</p>' : ''}</div>
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
    <div class="gap"></div>${ddHtml('cat', [{ items: CATEGORIES.map(c => ({ value: c, label: c })) }], 'Personal')}
    <label class="lbl">Voice type</label>${ddHtml('gender', [{ items: [{ value: 'auto', label: 'Automatic', sub: S.draft?.pitch ? `detected ${S.draft.pitch} Hz → ${S.draft.pitch < 165 ? 'male' : 'female'}` : 'pitch not detected' }, { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }] }], 'auto')}
    <p class="muted" style="margin-top:10px">Detected pitch: ${S.draft?.pitch ? S.draft.pitch + ' Hz' : 'unknown (default will be used)'}. Choose the type yourself if the guess is wrong.</p>
    <div class="grow"></div><div class="gap"></div><button class="btn" id="save">Save Voice</button><div class="gap"></div>
    <div class="btn ghost" style="padding:0" id="pl"><div style="width:100%;padding:10px 14px">${playerHtml(S.draft ? peaks(S.draft.buf, 24) : fakePeaks(3, 24), S.draft?.dur || 0)}</div></div></section>`,
  bind: r => {
    const d = S.draft; if (!d || !d.tmpId) return go('create');
    bindPlayer($('#pl', r), async () => bufferSource(d.buf));
    $('#save', r).onclick = async () => {
      const name = $('#name', r).value.trim(); if (!name) return toast('Please enter a name');
      const g = $('#gender', r).value, pitch = d.pitch || 150, v = { id: d.tmpId, name, cat: $('#cat', r).value, pitch, gender: g === 'auto' ? (pitch < 165 ? 'male' : 'female') : g, dur: d.dur, created: Date.now() };
      if (cloud.hosted) {
        const btn = $('#save', r); btn.disabled = true; btn.textContent = 'Cloning your voice…';
        try { const f = new FormData(); f.set('name', name); f.set('file', wavForUpload(d.buf), 'sample.wav'); v.remote = (await (await cloud.fn('clone', f)).json()).voice_id; }
        catch (e) { toast(`Hosted cloning failed (${String(e.message).slice(0, 70)}) – saved with the built-in profile`); }
      }
      S.voices.unshift(v); saveVoices(); await cloud.upsertVoice(v); cloud.putBlob('sample:' + v.id, d.blob); S.draft = null; if (v.remote) toast('Voice cloned and saved'); else if (!cloud.hosted) toast('Voice saved'); go('library');
    };
  } });

V.library = () => ({
  html: `<section class="screen has-nav">${top('Voice Library')}<div class="search"><input class="field" id="q" placeholder="Search voices…" value="${esc(S.libQuery)}"></div>
    <div class="seg"><button data-t="mine" class="${S.libTab === 'mine' ? 'on' : ''}">My Voices</button><button data-t="shared" class="${S.libTab === 'shared' ? 'on' : ''}">Shared</button></div>
    <div id="list"></div><div class="grow"></div><button class="btn" data-go="create">${icon('plus')} Create New Voice</button>${nav('library')}</section>`,
  bind: r => {
    const draw = () => {
      const list = (S.libTab === 'mine' ? S.voices : [...S.elVoices, ...PRESETS]).filter(v => v.name.toLowerCase().includes(S.libQuery.toLowerCase()));
      $('#list', r).innerHTML = list.length ? list.map(v => `<div class="row" data-id="${v.id}"><button class="play" data-play>${icon('play')}</button>
        <div class="info"><strong>${esc(v.name)}</strong><small>${esc(v.cat)}${v.el ? '' : ` • ${Math.max(1, Math.round(v.dur / 60))} min`}${v.pitch ? ` • ${v.pitch} Hz` : ''}</small></div>
        ${v.preset ? '' : '<button class="menu-btn" data-menu aria-label="Voice options">⋮</button>'}</div>`).join('')
        : `<div class="empty">${S.libTab === 'mine' ? 'No voices yet – create your first one.' : 'No matching voices.'}</div>`;
      $$('[data-play]', r).forEach(b => b.onclick = async () => {
        const v = findVoice(b.closest('.row').dataset.id); if (S.stopPlayback) S.stopPlayback();
        const sample = v.preset ? null : await blobs.get('sample:' + v.id), src = sample ? bufferSource(await decode(sample)) : v.preview ? urlSource(v.preview) : speakSource(`Hello, this is ${v.name}.`, v, .8, 1);
        let stop; const reset = () => { b.innerHTML = icon('play'); S.stopPlayback = null; };
        stop = src.play(reset); b.innerHTML = icon('pause'); S.stopPlayback = () => { stop(); reset(); };
      });
      $$('[data-menu]', r).forEach(b => b.onclick = async () => {
        const v = findVoice(b.closest('.row').dataset.id), a = prompt(`"${v.name}" – type "rename" or "delete"`, 'rename'); if (!a) return;
        if (a.toLowerCase() === 'delete' && confirm(`Delete ${v.name}?`)) { if (v.remote && cloud.hosted) await cloud.fn('delete', JSON.stringify({ voice_id: v.remote })).catch(e => toast(`Couldn’t remove the hosted voice (${String(e.message).slice(0, 60)})`)); S.voices = S.voices.filter(x => x.id !== v.id); saveVoices(); cloud.deleteVoice(v.id); blobs.del('sample:' + v.id); }
        else if (a.toLowerCase() === 'rename') { const n = prompt('New name', v.name); if (n && n.trim()) { v.name = n.trim().slice(0, 40); saveVoices(); cloud.upsertVoice(v); } }
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
    <label class="lbl" style="margin-top:0">Select Voice</label>${voiceDropdown('v', t.voiceId)}
    <label class="lbl">Offline voice <span class="muted" style="font-weight:400">– used only when ElevenLabs is unavailable</span></label>${baseVoiceDropdown('sys', t.sysVoice)}
    <label class="lbl">Enter Text</label>
    <div class="tags" aria-label="Insert a tag">${TAG_GROUPS.map(([g, tags]) => `<div class="tag-row"><span class="muted">${g}</span>${tags.map(x => `<button type="button" class="tag" data-tag="${x}">${x}</button>`).join('')}</div>`).join('')}</div>
    <textarea class="field" id="txt" maxlength="5000" placeholder="Type what the voice should say…">${esc(t.text)}</textarea>
    <div class="muted" style="display:flex;justify-content:space-between;font-size:12px"><span>Tags are performed by ElevenLabs voices; other voices keep pauses and skip the rest.</span><span style="white-space:nowrap;margin-left:8px"><span id="cnt">${t.text.length}</span>/5000</span></div>
    ${settingsHtml(['stability', 'similarity', 'style', 'speed', 'pitch', 'volume'], true)}
    <div class="grow"></div><button class="btn" id="gen">${icon('wave')} Generate Speech</button>${nav('tts')}</section>`,
  bind: r => {
    if (!('speechSynthesis' in window)) toast('Speech synthesis is not supported in this browser');
    $('#v', r).onchange = e => { t.voiceId = e.target.value; };
    $('#sys', r).onchange = e => { t.sysVoice = e.target.value; ls.set('sysvoice', t.sysVoice); toast(t.sysVoice ? 'Base voice set' : 'Base voice: automatic'); };
    if (!speechSynthesis.getVoices().length) speechSynthesis.addEventListener('voiceschanged', () => { if (location.hash === '#/tts') render(); }, { once: true });
    $('#txt', r).oninput = e => { t.text = e.target.value; $('#cnt', r).textContent = t.text.length; };
    $$('[data-tag]', r).forEach(b => b.onclick = () => {
      const ta = $('#txt', r), s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? s, ins = `[${b.dataset.tag}]` + (/^\s/.test(ta.value.slice(e)) ? '' : ' ');
      const pre = ta.value.slice(0, s), lead = pre && !/\s$/.test(pre) ? ' ' : '';
      if ((ta.value.length - (e - s) + lead.length + ins.length) > 5000) return toast('Text is at the 5000 character limit');
      ta.value = pre + lead + ins + ta.value.slice(e); const at = s + lead.length + ins.length; ta.focus(); ta.setSelectionRange(at, at);
      ta.dispatchEvent(new Event('input'));
    });
    bindSettings(r);
    $('#gen', r).onclick = () => {
      if (!t.text.trim()) return toast('Enter some text first');
      const id = uid(); S.ttsResult = { text: t.text, voiceId: t.voiceId, id, fresh: true }; go('tts-result');
    };
  } };
};

V['tts-result'] = () => {
  const res = S.ttsResult, v = res && findVoice(res.voiceId);
  if (!v) return { html: '', bind: () => go('tts') };
  return { html: `<section class="screen">${top('Generated Audio')}<div id="body"><div class="player center"><div class="muted" id="status">Preparing…</div>
    <div class="bar"><i id="barfill"></i></div><div class="muted" id="elapsed" style="margin-top:8px;font-size:12px"></div></div>
    <div class="gap"></div><button class="btn ghost" id="cancel">Cancel</button></div></section>`,
  bind: async r => {
    const body = $('#body', r), gone = () => !r.isConnected;
    let cancelled = false, device = false, buf = res.buf, blob = res.blob, standIn = null;
    const t0 = Date.now(), tick = setInterval(() => { if (gone()) return clearInterval(tick); $('#elapsed', r).textContent = `${Math.round((Date.now() - t0) / 1000)} s`; }, 500);
    const status = (t, f) => { if (gone()) return; $('#status', r).textContent = t; if (f != null) $('#barfill', r).style.width = Math.round(f * 100) + '%'; };
    if (!buf) {
      $('#cancel', r).onclick = () => { cancelled = true; go('tts'); };
      // Voices without their own ElevenLabs voice speak through an ElevenLabs voice of the same gender
      standIn = !v.remote && cloud.hosted ? elVoiceFor(isMale(v), v.cat === 'Hindi' || /[\u0900-\u097F]/.test(res.text)) : null;
      const hostedId = v.remote || standIn?.remote;
      if (hostedId) {
        try {
          status('Generating speech…', .3);
          blob = await (await cloud.fn('tts', JSON.stringify({ voice_id: hostedId, text: res.text, stability: S.vs.stability, similarity: S.vs.similarity, style: S.vs.style, speed: S.vs.speed, boost: S.vs.boost }))).blob();
          buf = await decode(blob);
          if (standIn) { const s = shapeToVoice(buf, v, S.vs.similarity); if (s) { buf = s; blob = encodeWav(mono(s), s.sampleRate); } }
        } catch (e) { if (cancelled) return; buf = blob = null; toast(`ElevenLabs unavailable (${String(e.message).slice(0, 60)}) – using the device voice`); }
      }
      if (!buf) device = true;
    }
    clearInterval(tick);
    if (gone()) return;
    if (buf && !res.buf) { const c = applyControls(buf); if (c) { buf = c; blob = encodeWav(mono(c), c.sampleRate); } }
    const src = device ? speakSource(res.text, v, S.vs.stability, S.vs.similarity, S.tts.sysVoice, S.vs) : bufferSource(buf);
    body.innerHTML = `<div class="player">${playerHtml(device ? fakePeaks(res.text.length) : peaks(buf), src.duration, true)}</div>
      <p class="muted center" style="margin-bottom:14px">“${esc(res.text.slice(0, 90))}${res.text.length > 90 ? '…' : ''}” — ${esc(v.name)}${standIn && buf ? ` (ElevenLabs ${esc(standIn.name.split(' - ')[0])})` : ''}${device ? ' (device voice)' : ''}</p>
      <div class="actions"><button class="act" id="dl" ${device ? 'disabled' : ''}>${icon('download')}Download</button>
        <button class="act" id="sh">${icon('share')}Share</button><button class="act del" id="rm">${icon('trash')}Delete</button></div>
      <button class="btn" id="again">Generate Again</button>`;
    const p = bindPlayer($('.player', r), async () => src);
    if (res.fresh) { res.fresh = false; const item = { id: res.id, kind: 'tts', title: res.text.slice(0, 32), text: res.text, voiceId: res.voiceId, ts: Date.now(), dur: src.duration }; S.recents.unshift(item); saveRecents(); cloud.upsertRecent(item); if (blob) blobs.put('audio:' + res.id, blob); }
    setTimeout(() => $('.play', r)?.click(), 250);
    $('#again', r).onclick = () => { if (device) { p(); $('.play', r).click(); } else { res.buf = res.blob = null; res.fresh = false; render(); } };
    $('#sh', r).onclick = async () => { if (blob && navigator.canShare?.({ files: [new File([blob], blob.type.includes('mpeg') ? 'jolovocals.mp3' : 'jolovocals.wav', { type: blob.type || 'audio/wav' })] })) return navigator.share({ files: [new File([blob], blob.type.includes('mpeg') ? 'jolovocals.mp3' : 'jolovocals.wav', { type: blob.type || 'audio/wav' })] }).catch(() => {});
      navigator.share ? navigator.share({ title: 'JoloVocals', text: res.text }).catch(() => {}) : navigator.clipboard?.writeText(res.text).then(() => toast('Text copied')); };
    $('#rm', r).onclick = () => { S.recents = S.recents.filter(a => a.id !== res.id); saveRecents(); cloud.deleteRecent(res.id); blobs.del('audio:' + res.id); S.ttsResult = null; go('tts'); };
    $('#dl', r).onclick = () => { if (!blob) return; const l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = `jolovocals-${res.id}.${blob.type.includes('mpeg') ? 'mp3' : 'wav'}`; l.click(); setTimeout(() => URL.revokeObjectURL(l.href), 1000); };
  } };
};

V.v2v = () => {
  const st = S.v2v; st.voiceId = findVoice(st.voiceId) ? st.voiceId : allVoices()[0].id;
  return { html: `<section class="screen has-nav">${top('Voice to Voice')}${captureHtml('Upload or Record Audio', 120)}
    <div id="chosen">${st.sample ? chosenHtml(st.sample) : ''}</div>
    <label class="lbl">Target Voice</label>${voiceDropdown('v', st.voiceId)}
    <div class="gap"></div>${settingsHtml(['stability', 'similarity', 'style', 'pitch', 'volume'], true)}
    <div class="grow"></div><div class="gap"></div><button class="btn" id="conv" ${st.sample ? '' : 'disabled'}>${icon('wave')} Convert Audio</button>${nav('v2v')}</section>`,
  bind: r => {
    const show = () => { $('#chosen', r).innerHTML = chosenHtml(st.sample); $('#conv', r).disabled = false; const halt = bindPlayer($('.filechip', r), async () => bufferSource(st.sample.buf));
      $('.retake', r).onclick = () => { const again = st.sample.rec; halt(); st.sample = null; $('#chosen', r).innerHTML = ''; $('#conv', r).disabled = true; $('.rec-time', r).textContent = `00:00 / ${fmt(120)}`; if (again) $('.rec', r).click(); }; };
    if (st.sample) show();
    const stopRec = bindCapture(r, async (blob, rec) => { const s = await loadSample(blob, 1); if (s) { s.rec = rec; st.sample = s; show(); } }, 120);
    $('#v', r).onchange = e => { st.voiceId = e.target.value; };
    bindSettings(r);
    $('#conv', r).onclick = async () => {
      const btn = $('#conv', r), voice = findVoice(st.voiceId); btn.disabled = true; btn.textContent = 'Converting…'; stopRec(); await sleep(30);
      try {
        let out, blob;
        if (voice.remote && cloud.hosted) {
          try {
            const f = new FormData(); f.set('voice_id', voice.remote); f.set('audio', wavForUpload(st.sample.buf, 120), 'input.wav'); f.set('stability', S.vs.stability); f.set('similarity', S.vs.similarity); f.set('style', S.vs.style); f.set('boost', S.vs.boost);
            blob = await (await cloud.fn('sts', f)).blob(); out = await decode(blob);
          } catch (e) { blob = out = null; toast(`Hosted conversion unavailable (${String(e.message).slice(0, 60)}) – using the built-in converter`); }
        }
        if (!out) {
          const srcPitch = detectPitch(st.sample.buf); if (!srcPitch) toast('Couldn’t detect the pitch of your audio – converting at neutral');
          const ratio = srcPitch ? clamp((voice.pitch || 150) / srcPitch, .5, 2) : 1, shifted = psolaShift(st.sample.buf, ratio) || pitchShift(st.sample.buf, ratio), sr = shifted.sr, data = applyFx(shifted.data, sr, voice.fx);
          out = ac().createBuffer(1, data.length, sr); out.copyToChannel(data, 0); blob = encodeWav(data, sr);
        }
        const c = applyControls(out); if (c) { out = c; blob = encodeWav(mono(c), c.sampleRate); }
        const id = uid(); await blobs.put('audio:' + id, blob);
        S.v2vResult = { id, original: st.sample.buf, converted: out, blob, voice: voice.name };
        const item = { id, kind: 'v2v', title: `Converted to ${voice.name}`, ts: Date.now(), dur: out.duration }; S.recents.unshift(item); saveRecents(); cloud.upsertRecent(item); go('v2v-result');
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
    $('#dl', r).onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(res.blob); a.download = `jolovocals-${res.id}.${res.blob.type.includes('mpeg') ? 'mp3' : 'wav'}`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
    $('#sh', r).onclick = async () => { const f = new File([res.blob], 'jolovocals.wav', { type: 'audio/wav' });
      if (navigator.canShare?.({ files: [f] })) navigator.share({ files: [f] }).catch(() => {}); else toast('Sharing files isn’t supported here – use Download'); };
    $('#rm', r).onclick = () => { S.recents = S.recents.filter(a => a.id !== res.id); saveRecents(); cloud.deleteRecent(res.id); blobs.del('audio:' + res.id); S.v2vResult = null; go('v2v'); };
    $('#more', r).onclick = () => { S.v2v.sample = null; go('v2v'); };
  } };
};

V.profile = () => ({
  html: `<section class="screen has-nav">${top('Profile', false)}<div class="center"><div class="okmark" style="background:var(--soft);color:var(--p);width:84px;height:84px">${icon('user')}</div>
    <h2>${esc(S.user.name)}</h2><p class="muted">${esc(S.user.id)}</p><p class="muted">${cloud.on ? '☁ Synced to your account' : 'Stored on this device only'}</p></div><div class="gap"></div>
    <div class="card"><strong>${S.voices.length}</strong> custom voice${S.voices.length === 1 ? '' : 's'} saved on this device</div>
    <div class="grow"></div><button class="btn outline" id="out">Sign out</button><div class="gap"></div><button class="btn outline" id="wipe" style="color:var(--red)">Delete all local data</button>${nav('profile')}</section>`,
  bind: r => {
    $('#out', r).onclick = async () => { await cloud.signOut(); S.user = null; S.elVoices = []; ls.set('user', null); ls.set('elvoices', []); go('login'); };
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
  bindDropdowns(app); const c = view.bind(app); app.scrollTo?.(0, 0); window.scrollTo(0, 0);
  if (c && c.catch) c.catch(console.error);
}
window.addEventListener('hashchange', render);
speechSynthesis?.getVoices();
(async () => {
  if (cloud.on) {
    const u = await cloud.session().catch(() => null);
    if (u) await startSession(u); else if (S.user) { S.user = null; ls.set('user', null); }
  }
  render();
})();
})();
