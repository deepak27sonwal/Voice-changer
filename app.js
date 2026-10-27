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
    /**
     * Same request as fn(), returning the response Blob and reporting real progress:
     * onEvt('upload', fraction) while sending, onEvt('wait') once sent, onEvt('download', fraction|null, bytes) while receiving.
     * ctl.abort() cancels.
     */
    async fnBlob(path, body, onEvt = () => {}, ctl = {}) {
      const { data } = await sb.auth.getSession(), token = data.session?.access_token;
      if (!token) throw new Error('sign in required');
      return new Promise((resolve, reject) => {
        const x = new XMLHttpRequest(); ctl.abort = () => x.abort();
        x.open('POST', `${cfg.SUPABASE_URL}/functions/v1/voice-api/${path}`); x.responseType = 'blob';
        x.setRequestHeader('authorization', `Bearer ${token}`); x.setRequestHeader('apikey', cfg.SUPABASE_KEY);
        // 'wait' fires once, when the body is fully sent; the fallbacks cover browsers that report no upload progress.
        let sent = false, uploading = false; const markSent = () => { if (!sent) { sent = true; onEvt('wait'); } };
        if (typeof body === 'string') x.setRequestHeader('content-type', 'application/json');
        else {
          x.upload.onprogress = e => { if (!e.lengthComputable) return; uploading = true; onEvt('upload', e.loaded / e.total); if (e.loaded >= e.total) markSent(); };
          x.upload.onloadend = markSent;
          setTimeout(() => { if (!uploading) markSent(); }, 1200);
        }
        x.onreadystatechange = () => { if (x.readyState >= 2) markSent(); };
        x.onprogress = e => onEvt('download', e.lengthComputable ? e.loaded / e.total : null, e.loaded);
        x.onload = async () => {
          if (x.status >= 200 && x.status < 300) return resolve(x.response);
          let msg = `request failed (${x.status})`; try { msg = JSON.parse(await x.response.text()).error || msg; } catch { /* keep default */ }
          reject(new Error(msg));
        };
        x.onerror = () => reject(new Error('network error')); x.onabort = () => reject(new Error('cancelled'));
        x.send(body); if (typeof body === 'string') markSent();
      });
    },
    async session() { const { data } = await sb.auth.getSession(); const u = data.session?.user || null; uid_ = u?.id || null; return u; },
    async auth(mode, email, password) {
      const { data, error } = mode === 'up' ? await sb.auth.signUp({ email, password }) : await sb.auth.signInWithPassword({ email, password });
      if (error) throw error; uid_ = data.session?.user?.id || null; return data;
    },
    signOut: () => safe(() => sb.auth.signOut()).then(() => { uid_ = null; }),
    /** Server-side generation history (own rows only, via row-level security), newest first. */
    async history(kind, from, count) {
      let q = sb.from('generation_history').select('id,kind,voice_id,model,text,characters,audio_path,bytes,created_at').order('created_at', { ascending: false }).range(from, from + count - 1);
      if (kind) q = q.eq('kind', kind);
      const { data, error } = await q; if (error) throw error; return data;
    },
    async usage() { return (await this.fn('usage', '{}')).json(); },
    /** Timestamps (ms) of the caller's generations in the last 90 days, for streak/week stats. */
    async historyDates() {
      const { data, error } = await sb.from('generation_history').select('created_at').gte('created_at', new Date(Date.now() - 90 * 864e5).toISOString()).order('created_at', { ascending: false }).limit(1000);
      if (error) throw error; return data.map(x => Date.parse(x.created_at));
    },
    async deleteHistory(id) { await this.fn('history-delete', JSON.stringify({ id })); },
    async historyAudio(path) { const { data, error } = await sb.storage.from('voice-audio').download(path); if (error) throw error; return data; },
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
  elVoices: ls.get('elvoices', []),
  live: { preset: 'robot', pitch: 0, echo: 0, reverb: 0, monitor: true, ...ls.get('live', {}) },   // voices from the ElevenLabs account (hosted mode)
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
  return { data: timeStretch(y, n), sr: buf.sampleRate };
}

/** WSOLA time-stretch: returns `y` stretched or squeezed to `n` samples without changing its pitch. */
function timeStretch(y, n) {
  const m = y.length, G = 2048, Hs = G / 2, tol = 256, win = new Float32Array(G);
  for (let i = 0; i < G; i++) win[i] = .5 - .5 * Math.cos(2 * Math.PI * i / G);
  const out = new Float32Array(n + G), wsum = new Float32Array(n + G);
  let last = 0;
  for (let o = 0; o < n; o += Hs) {
    const nominal = Math.round(o * m / n);
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
  return res;
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

/* ───────────── effects: live voice changer + FX rack ───────────── */
const FX_PRESETS = [
  { id: 'none', name: 'Natural', emoji: '🎙️' },
  { id: 'robot', name: 'Robot', emoji: '🤖', ring: 50 },
  { id: 'monster', name: 'Monster', emoji: '👹', pitch: -6, lowpass: 1800 },
  { id: 'chipmunk', name: 'Chipmunk', emoji: '🐿️', pitch: 7 },
  { id: 'alien', name: 'Alien', emoji: '👽', pitch: 4, ring: 30 },
  { id: 'radio', name: 'Radio', emoji: '📻', band: [500, 3000], drive: 4 },
  { id: 'phone', name: 'Telephone', emoji: '☎️', band: [400, 3400], drive: 2 },
  { id: 'echo', name: 'Echo', emoji: '🏔️', echo: .45 },
  { id: 'stadium', name: 'Stadium', emoji: '🏟️', reverb: .6, echo: .2 },
  { id: 'cave', name: 'Cave', emoji: '🕳️', pitch: -2, reverb: .8 },
  { id: 'ghost', name: 'Ghost', emoji: '👻', pitch: 3, highpass: 1200, reverb: .5 },
];
const fxPreset = id => FX_PRESETS.find(p => p.id === id) || FX_PRESETS[0];
/** Decaying-noise impulse response for the reverb. */
const makeImpulse = (ctx, seconds = 2.5, decay = 3) => {
  const n = Math.floor(ctx.sampleRate * seconds), ir = ctx.createBuffer(2, n, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n) ** decay; }
  return ir;
};
/**
 * Effect chain shared by live mode and offline rendering (pitch is handled separately).
 * `fx` = preset plus overrides { echo, reverb }. Connects `input` and returns the output node.
 */
function buildFxChain(ctx, fx, input) {
  let node = input;
  const link = n => { node.connect(n); node = n; };
  const filter = (type, f) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; link(b); };
  if (fx.lowpass) filter('lowpass', fx.lowpass);
  if (fx.highpass) filter('highpass', fx.highpass);
  if (fx.band) { filter('highpass', fx.band[0]); filter('lowpass', fx.band[1]); }
  const shelf = (type, f, db) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.gain.value = db; link(b); };
  if (fx.bass) shelf('lowshelf', 200, fx.bass);
  if (fx.treble) shelf('highshelf', 3500, fx.treble);
  if (fx.drive) {
    const ws = ctx.createWaveShaper(), k = fx.drive * 10, n = 1024, curve = new Float32Array(n);
    for (let i = 0; i < n; i++) { const x = i * 2 / n - 1; curve[i] = (1 + k) * x / (1 + k * Math.abs(x)); }
    ws.curve = curve; link(ws);
  }
  if (fx.ring) {   // ring modulation: signal × sine, blended with the dry signal by `ringMix` (default fully robotic)
    const g = ctx.createGain(), osc = ctx.createOscillator(), mix = fx.ringMix ?? 1; g.gain.value = 0; osc.frequency.value = fx.ring; osc.connect(g.gain); osc.start();
    if (mix >= 1) link(g);
    else { const sum = ctx.createGain(), d = ctx.createGain(), w = ctx.createGain(); d.gain.value = 1 - mix; w.gain.value = mix; node.connect(d); node.connect(g); g.connect(w); d.connect(sum); w.connect(sum); node = sum; }
  }
  const out = ctx.createGain(), dry = ctx.createGain(), echo = fx.echo || 0, reverb = fx.reverb || 0;
  dry.gain.value = 1 - reverb * .35; node.connect(dry); dry.connect(out);
  if (echo > 0) {
    const d = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain();
    d.delayTime.value = .28; fb.gain.value = Math.min(.75, echo * .9); wet.gain.value = echo;
    node.connect(d); d.connect(fb); fb.connect(d); d.connect(wet); wet.connect(out);
  }
  if (reverb > 0) { const cv = ctx.createConvolver(), wet = ctx.createGain(); cv.buffer = makeImpulse(ctx); wet.gain.value = reverb; node.connect(cv); cv.connect(wet); wet.connect(out); }
  return out;
}
/* Tune & FX for finished audio: presets are starting points for a set of sliders. */
const TUNE_DEFAULTS = { base: 'none', pitch: 0, character: 0, speed: 1, bass: 0, treble: 0, echo: 0, reverb: 0, robot: 0, drive: 0, volume: 1 };
const signed = (v, unit) => `${v > 0 ? '+' : ''}${v}${unit}`, pct = v => Math.round(v * 100) + '%';
const TUNE_CONTROLS = [
  ['Voice', [['pitch', 'Pitch', -12, 12, 1, v => signed(v, ' st')], ['character', 'Character', -30, 30, 1, v => signed(v, '%')], ['speed', 'Speed', .7, 1.3, .05, v => v.toFixed(2) + '×']]],
  ['Tone', [['bass', 'Bass', -12, 12, 1, v => signed(v, ' dB')], ['treble', 'Treble', -12, 12, 1, v => signed(v, ' dB')]]],
  ['Effects', [['echo', 'Echo', 0, .8, .05, pct], ['reverb', 'Reverb', 0, 1, .05, pct], ['robot', 'Robot', 0, 1, .05, pct], ['drive', 'Distortion', 0, 1, .05, pct]]],
  ['Output', [['volume', 'Volume', 0, 1.5, .05, pct]]],
];
const TUNE_LABEL = Object.fromEntries(TUNE_CONTROLS.flatMap(([, c]) => c.map(x => [x[0], x[5]])));
const presetTune = p => ({ ...TUNE_DEFAULTS, base: p.id, pitch: p.pitch || 0, echo: p.echo || 0, reverb: p.reverb || 0, robot: p.ring ? 1 : 0, drive: p.drive ? Math.min(1, p.drive / 4) : 0 });
const userPresets = () => ls.get('fxpresets', []);
const isNeutral = t => Object.keys(TUNE_DEFAULTS).every(k => k === 'base' || t[k] === TUNE_DEFAULTS[k]) && fxPreset(t.base).id === 'none';
/** Builds the effect-chain settings for a tune: the base preset's filter shape plus the slider amounts. */
const tuneToFx = t => { const b = fxPreset(t.base); return { lowpass: b.lowpass, highpass: b.highpass, band: b.band, bass: t.bass, treble: t.treble,
  ring: t.robot > 0 ? (b.ring || 50) : 0, ringMix: t.robot, drive: t.drive * 4, echo: t.echo, reverb: t.reverb }; };
/**
 * Renders a tune onto finished audio: speed (time-stretch, pitch kept), pitch + voice character (formant-preserving
 * shifter), then tone/effects through the offline effect chain, then volume with soft limiting.
 */
async function renderTune(buf, t) {
  const sr = buf.sampleRate; let data = mono(buf);
  if (Math.abs(t.speed - 1) > .01) data = timeStretch(data, Math.round(data.length / t.speed));
  if (t.pitch || t.character) {
    const tmp = ac().createBuffer(1, data.length, sr); tmp.copyToChannel(data, 0);
    const r = 2 ** (t.pitch / 12), shifted = psolaShift(tmp, r, r ** .3 * (1 + t.character / 100));
    data = shifted ? shifted.data : t.pitch ? pitchShift(tmp, r).data : data;
  }
  const fx = tuneToFx(t), tail = (fx.echo > 0 ? 1.5 : 0) + (fx.reverb > 0 ? 2.5 : 0);
  const octx = new OfflineAudioContext(1, data.length + Math.ceil(tail * sr), sr), src = octx.createBufferSource(), inBuf = octx.createBuffer(1, data.length, sr);
  inBuf.copyToChannel(data, 0); src.buffer = inBuf; buildFxChain(octx, fx, src).connect(octx.destination); src.start();
  const out = await octx.startRendering(), d = out.getChannelData(0); let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const gain = (peak > .95 ? .95 / peak : 1) * t.volume;
  for (let i = 0; i < d.length; i++) d[i] = t.volume > 1 ? Math.tanh(d[i] * gain) : d[i] * gain;   // soft-limit boosts
  return out;
}
const tuneChips = sel => [...FX_PRESETS.map(p => ({ id: p.id, label: `${p.emoji} ${p.name}` })), ...userPresets().map(p => ({ id: p.id, label: `⭐ ${p.name}`, user: true }))]
  .map(c => `<button type="button" class="fxchip ${c.id === sel ? 'on' : ''}" data-tp="${esc(c.id)}">${esc(c.label)}${c.user ? `<span class="tp-del" data-tpdel="${esc(c.id)}" role="button" aria-label="Delete preset">✕</span>` : ''}</button>`).join('');
const tuneHtml = t => `<div class="panel tune"><div class="panel-head"><strong>🎛️ Tune &amp; FX</strong><span class="muted tune-status" aria-live="polite"></span></div>
  <div class="fxrow" role="group" aria-label="Presets">${tuneChips(t.preset || t.base)}</div>
  <div class="tgroups">${TUNE_CONTROLS.map(([g, ctrls], gi) => `<details class="vs tgroup" ${gi === 0 || gi === 2 || matchMedia('(min-width: 960px)').matches ? 'open' : ''}><summary>${g}</summary>${ctrls.map(([k, label, min, max, step, show]) =>
    `<div class="slider"><span>${label}</span><input type="range" data-tk="${k}" min="${min}" max="${max}" step="${step}" value="${t[k]}" aria-label="${label}"><b data-tkv="${k}">${show(t[k])}</b></div>`).join('')}</details>`).join('')}</div>
  <div class="tune-actions"><button type="button" class="hact" data-tab>👂 Before</button><button type="button" class="hact" data-treset>↺ Reset</button><button type="button" class="hact" data-tsave>★ Save preset</button></div></div>`;
/**
 * Wires a Tune & FX panel. `s` = { tune, dry: { buf, blob }, apply(buf, blob) → shows the tuned result, stop() → stops playback }.
 * Every render starts from the unprocessed audio, ~350 ms after the last change.
 */
function bindTune(r, s) {
  const t = s.tune, status = $('.tune-status', r);
  let timer = 0, token = 0, before = null;
  const sync = () => $$('[data-tk]', r).forEach(i => { i.value = t[i.dataset.tk]; $(`[data-tkv="${i.dataset.tk}"]`, r).textContent = TUNE_LABEL[i.dataset.tk](t[i.dataset.tk]); });
  const markChip = id => { t.preset = id; $$('[data-tp]', r).forEach(c => c.classList.toggle('on', c.dataset.tp === id)); };
  const run = async () => {
    const my = ++token; status.textContent = 'Applying…'; await sleep(20);
    try {
      const neutral = isNeutral(t), out = neutral ? s.dry.buf : await renderTune(s.dry.buf, t);
      if (my !== token || !r.isConnected) return;
      s.apply(out, neutral ? s.dry.blob : encodeWav(mono(out), out.sampleRate)); status.textContent = neutral ? '' : 'Tuned';
    } catch (e) { console.error(e); if (my === token) { status.textContent = ''; toast('Couldn’t apply that tuning'); } }
  };
  const schedule = (ms = 350) => { clearTimeout(timer); status.textContent = '…'; timer = setTimeout(run, ms); };
  const bindChips = () => {
    $$('[data-tp]', r).forEach(c => c.onclick = e => {
      if (e.target.closest('[data-tpdel]')) {
        const id = e.target.closest('[data-tpdel]').dataset.tpdel; if (!confirm('Delete this preset?')) return;
        ls.set('fxpresets', userPresets().filter(p => p.id !== id)); $('.tune .fxrow', r).innerHTML = tuneChips(t.preset); return bindChips();
      }
      const user = userPresets().find(p => p.id === c.dataset.tp);
      Object.assign(t, user ? { ...TUNE_DEFAULTS, ...user.tune } : presetTune(fxPreset(c.dataset.tp))); markChip(c.dataset.tp); sync(); schedule(0);
    });
  };
  bindChips();
  $$('[data-tk]', r).forEach(i => i.oninput = () => { t[i.dataset.tk] = +i.value; $(`[data-tkv="${i.dataset.tk}"]`, r).textContent = TUNE_LABEL[i.dataset.tk](t[i.dataset.tk]); markChip(''); schedule(); });
  $('[data-treset]', r).onclick = () => { Object.assign(t, TUNE_DEFAULTS); markChip('none'); sync(); schedule(0); };
  $('[data-tsave]', r).onclick = () => {
    const name = (prompt('Name this preset', 'My voice') || '').trim().slice(0, 24); if (!name) return;
    const p = { id: 'u-' + uid(), name, tune: Object.fromEntries(Object.keys(TUNE_DEFAULTS).map(k => [k, t[k]])) };
    ls.set('fxpresets', [...userPresets(), p]); $('.tune .fxrow', r).innerHTML = tuneChips(p.id); t.preset = p.id; bindChips(); toast(`⭐ Saved “${name}”`);
  };
  const ab = $('[data-tab]', r);
  ab.onclick = () => {
    if (before) { before(); return; }
    s.stop(); const stop = bufferSource(s.dry.buf).play(() => { before = null; ab.textContent = '👂 Before'; ab.classList.remove('on'); });
    before = () => { stop(); before = null; ab.textContent = '👂 Before'; ab.classList.remove('on'); }; ab.textContent = '■ Stop'; ab.classList.add('on');
  };
  return () => { clearTimeout(timer); token++; if (before) before(); };
}
/* Real-time pitch shifter: two crossfaded taps sweeping through a short delay line (runs in the audio thread). */
const PITCH_WORKLET = `class PitchShifter extends AudioWorkletProcessor {
  static get parameterDescriptors() { return [{ name: 'ratio', defaultValue: 1, minValue: 0.25, maxValue: 4 }]; }
  constructor() { super(); this.N = 2048; this.buf = new Float32Array(this.N); this.w = 0; this.ph = 0; }
  read(pos) { const N = this.N, p = ((pos % N) + N) % N, i = Math.floor(p), f = p - i; return this.buf[i] * (1 - f) + this.buf[(i + 1) % N] * f; }
  process(inputs, outputs, params) {
    const inp = inputs[0] && inputs[0][0], out = outputs[0][0]; if (!out) return true;
    const ratio = params.ratio[0], N = this.N;
    for (let i = 0; i < out.length; i++) {
      this.buf[this.w] = inp ? inp[i] : 0;
      this.ph = (this.ph + (1 - ratio) / N + 1) % 1;
      const p2 = (this.ph + 0.5) % 1, g1 = 0.5 - 0.5 * Math.cos(2 * Math.PI * this.ph), g2 = 0.5 - 0.5 * Math.cos(2 * Math.PI * p2);
      out[i] = this.read(this.w - this.ph * N) * g1 + this.read(this.w - p2 * N) * g2;
      this.w = (this.w + 1) % N;
    }
    for (let c = 1; c < outputs[0].length; c++) outputs[0][c].set(out);
    return true;
  }
}
registerProcessor('pitch-shifter', PitchShifter);`;

/* ───────────── progress loader ───────────── */
/**
 * Ring loader with a percentage, a running mm:ss timer and a stage label, rendered into `el`.
 * set() only moves forward; creep() eases toward a ceiling while waiting on a step with no progress signal.
 */
function progressLoader(el) {
  el.innerHTML = `<div class="ring pl" style="--v:0"><div class="ring-in"><b class="pl-pct">0%</b><span class="pl-time">00:00</span></div></div><p class="center pl-stage">Preparing…</p>`;
  const ring = $('.pl', el), pctEl = $('.pl-pct', el), timeEl = $('.pl-time', el), stageEl = $('.pl-stage', el), t0 = performance.now();
  let pct = 0, shown = 0, creep = null;
  const draw = () => { ring.style.setProperty('--v', shown); pctEl.textContent = Math.floor(shown) + '%'; timeEl.textContent = fmt(Math.floor((performance.now() - t0) / 1000)); };
  const iv = setInterval(() => {
    if (!el.isConnected) return clearInterval(iv);
    if (creep) pct = Math.max(pct, creep.from + (creep.to - creep.from) * (1 - Math.exp(-(performance.now() - creep.t0) / 1000 / creep.tau)));
    shown += (pct - shown) * .35; if (pct - shown < .3) shown = pct; draw();
  }, 100);
  return {
    /** `snap` shows the value at once – used before blocking work, when the animation can't run. */
    set(p, stage, snap) { pct = Math.max(pct, Math.min(100, p)); if (stage) stageEl.textContent = stage; if (snap) { shown = pct; draw(); } },
    creep(from, to, tau, stage) { creep = { from, to, tau, t0: performance.now() }; this.set(from, stage); },
    endCreep() { creep = null; },
    done(stage = 'Done') { creep = null; pct = shown = 100; stageEl.textContent = stage; draw(); clearInterval(iv); },
    stop() { clearInterval(iv); },
  };
}
/**
 * Runs a voice-api request inside a loader: upload 5–35% and download 80–97% are measured from real bytes; the provider's
 * processing time in between has no progress signal, so it eases toward 80% based on the expected audio length.
 */
function hostedWithProgress(pl, path, body, expectSec, ctl, waitLabel) {
  const expectBytes = Math.max(8000, expectSec * 16000);   // 128 kbps MP3
  pl.set(5, 'Uploading…');
  return cloud.fnBlob(path, body, (k, f, bytes) => {
    if (k === 'upload') pl.set(5 + 30 * f, 'Uploading…');
    else if (k === 'wait') pl.creep(35, 80, Math.max(2, expectSec * .4), waitLabel);
    else if (k === 'download') { pl.endCreep(); pl.set(80 + 17 * Math.min(1, f ?? bytes / expectBytes), 'Receiving audio…'); }
  }, ctl);
}

/* ───────────── views ───────────── */
const TABS = ['home', 'tts', 'v2v', 'library', 'profile'];
const nav = on => `<nav class="bottom"><span class="ind" aria-hidden="true"></span>
  ${[['home', 'home', 'Home'], ['tts', 'text', 'Generate']].map(([r, ic, l]) => `<button data-go="${r}" class="${on === r ? 'on' : ''}">${icon(ic)}${l}</button>`).join('')}
  <button class="mic ${on === 'v2v' ? 'on' : ''}" data-go="v2v" aria-label="Voice to voice">${icon('mic')}<span class="nav-l">Voice to Voice</span></button>
  ${[['library', 'lib', 'Library'], ['profile', 'user', 'Profile']].map(([r, ic, l]) => `<button data-go="${r}" class="${on === r ? 'on' : ''}">${icon(ic)}${l}</button>`).join('')}</nav>`;
const top = (title, back = true) => `<div class="top">${back ? `<button class="icon-btn" data-back aria-label="Back">${icon('back')}</button>` : ''}<h2>${title}</h2></div>`;
/** Custom dropdown. Renders <div class="dd" id=…>; after bind, `el.value` and a 'change' event work like a <select>. */
const ddHtml = (id, groups, sel) => {
  const flat = groups.flatMap(g => g.items), cur = flat.find(o => o.value === sel) || flat[0];
  return `<div class="dd" id="${id}" data-value="${esc(cur.value)}"><button type="button" class="field dd-btn" aria-haspopup="listbox" aria-expanded="false"><span class="dd-label">${esc(cur.label)}${cur.sub ? `<small>${esc(cur.sub)}</small>` : ''}</span><span class="dd-caret">${icon('chev')}</span></button>
    <ul class="dd-list" role="listbox" hidden>${groups.map(g => (g.title ? `<li class="dd-group" role="presentation">${esc(g.title)}</li>` : '') + g.items.map(o => {
      const text = `<span>${esc(o.label)}</span>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}`;
      return o.acts
        ? `<li role="option" tabindex="-1" class="has-acts" data-v="${esc(o.value)}" aria-selected="${o.value === cur.value}"><span class="dd-text">${text}</span><span class="dd-acts">
            <button type="button" class="dd-act" data-prev="${esc(o.value)}" tabindex="-1" aria-label="Preview ${esc(o.label)}">${PREV_PLAY}</button>
            <button type="button" class="dd-act star" data-fav="${esc(o.value)}" tabindex="-1" aria-pressed="${!!o.fav}" aria-label="Favourite ${esc(o.label)}">★</button></span></li>`
        : `<li role="option" tabindex="-1" data-v="${esc(o.value)}" aria-selected="${o.value === cur.value}">${text}</li>`;
    }).join('')).join('')}</ul></div>`;
};
function bindDropdowns(root) {
  $$('.dd', root).forEach(dd => {
    const btn = $('.dd-btn', dd), list = $('.dd-list', dd), opts = $$('[role=option]', dd);
    Object.defineProperty(dd, 'value', { get: () => dd.dataset.value });
    const close = () => { list.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
    const open = () => { $$('.dd-list').forEach(l => { l.hidden = true; }); list.hidden = false; btn.setAttribute('aria-expanded', 'true');
      const s = $('[aria-selected=true]', dd); s?.scrollIntoView({ block: 'nearest' }); s?.focus(); };
    const pick = o => { dd.dataset.value = o.dataset.v; opts.forEach(x => x.setAttribute('aria-selected', x.dataset.v === o.dataset.v));
      $('.dd-label', dd).innerHTML = ($('.dd-text', o) || o).innerHTML; close(); btn.focus(); flash(btn, 'picked'); dd.dispatchEvent(new Event('change')); };
    btn.onclick = () => list.hidden ? open() : close();
    opts.forEach(o => { o.onclick = e => { if (!e.target.closest('.dd-act')) pick(o); };
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
/* Favourite and recently used voices (per browser). */
const favSet = () => new Set(ls.get('favvoices', []));
const toggleFav = id => { const f = favSet(); f.has(id) ? f.delete(id) : f.add(id); ls.set('favvoices', [...f]); return f.has(id); };
const noteVoiceUsed = id => ls.set('recentvoices', [id, ...ls.get('recentvoices', []).filter(x => x !== id)].slice(0, 5));
/** Plays a short preview of any voice: its own sample, its ElevenLabs preview, a stand-in's preview, or the device voice. */
async function previewVoice(v, btn) {
  if (!v) return;
  if (btn.classList.contains('playing') && S.stopPlayback) return S.stopPlayback();
  if (S.stopPlayback) S.stopPlayback();
  let src;
  const sample = !v.preset && !v.el ? await blobs.get('sample:' + v.id) : null;
  if (sample) src = bufferSource(await decode(sample));
  else if (v.preview) src = urlSource(v.preview);
  else { const si = cloud.hosted && !v.remote ? elVoiceFor(isMale(v), v.cat === 'Hindi') : null; src = si?.preview ? urlSource(si.preview) : speakSource(`Hello, this is ${v.name}.`, v, .8, 1); }
  const label = btn.innerHTML; btn.classList.add('playing'); btn.innerHTML = PREV_STOP;
  const reset = () => { btn.classList.remove('playing'); btn.innerHTML = label; S.stopPlayback = null; };
  const stop = src.play(reset); S.stopPlayback = () => { stop(); reset(); };
}
// Preview button glyphs; the triangle sits slightly right of centre so it looks centred.
const PREV_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13L18.5 12z"/></svg>';
const PREV_STOP = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="2"/></svg>';
/** Replays a one-shot CSS animation class on `el`. */
const flash = (el, cls) => { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), 500); };
// Star / preview buttons anywhere (dropdowns, library); capture phase so they never select the dropdown option.
document.addEventListener('click', e => {
  const fav = e.target.closest('[data-fav]'), prev = e.target.closest('[data-prev]');
  if (fav) { e.stopPropagation(); const on = toggleFav(fav.dataset.fav); $$('[data-fav]').forEach(b => { if (b.dataset.fav === fav.dataset.fav) b.setAttribute('aria-pressed', on); }); flash(fav, 'pop'); toast(on ? '★ Added to favourites' : 'Removed from favourites'); }
  else if (prev) { e.stopPropagation(); previewVoice(findVoice(prev.dataset.prev), prev); }
}, true);
const voiceDropdown = (id, sel) => {
  const favs = favSet(), item = v => ({ ...voiceItem(v), acts: true, fav: favs.has(v.id) });
  const fav = [...favs].map(findVoice).filter(Boolean), recent = ls.get('recentvoices', []).map(findVoice).filter(v => v && !favs.has(v.id));
  const hi = S.elVoices.filter(v => v.lang === 'hi'), other = S.elVoices.filter(v => v.lang !== 'hi');
  return ddHtml(id, [...(fav.length ? [{ title: '★ Favourites', items: fav.map(item) }] : []), ...(recent.length ? [{ title: 'Recently used', items: recent.map(item) }] : []),
    ...(S.voices.length ? [{ title: 'My voices', items: S.voices.map(item) }] : []),
    ...(hi.length ? [{ title: 'ElevenLabs · Hindi', items: hi.map(item) }] : []), ...(other.length ? [{ title: 'ElevenLabs voices', items: other.map(item) }] : []),
    { title: 'Preset voices', items: PRESETS.map(item) }], sel);
};

/* Templates and tips. */
const TEMPLATES = [
  { emoji: '🎂', title: 'Birthday wish', male: false, vs: { style: .4 }, text: '[excited] Happy birthday! [pause 0.5s] Wishing you a year full of laughter, adventure and cake. [laughs] Lots and lots of cake!' },
  { emoji: '📣', title: 'Product ad', male: true, vs: { style: .5, speed: 1.05 }, text: '[excited] Introducing JoloVocals – [pause 0.5s] the studio that turns your words into real voices. Try it free today!' },
  { emoji: '🌙', title: 'Bedtime story', male: false, vs: { stability: .8, speed: .9 }, text: '[calm] Once upon a time, in a quiet village by the sea, [pause 1s] there lived a little lighthouse that was afraid of the dark…' },
  { emoji: '🙏', title: 'Hindi greeting', male: true, hindi: true, vs: {}, text: 'नमस्ते! [pause 0.5s] JoloVocals में आपका स्वागत है। आज हम आपकी आवाज़ को एक नया रूप देंगे।' },
  { emoji: '🎙️', title: 'Podcast intro', male: true, vs: { style: .3 }, text: 'Welcome back to the show! [pause 0.5s] I’m your host, and today we’re diving into something [excited] really exciting.' },
  { emoji: '💪', title: 'Motivation', male: true, vs: { stability: .75 }, text: '[calm] Every expert was once a beginner. [pause 1s] Start small, stay consistent, and never stop learning.' },
  { emoji: '🇮🇳', title: 'Hindi quote', male: false, hindi: true, vs: { stability: .75 }, text: '[calm] सपने वो नहीं जो हम सोते हुए देखते हैं, [pause 0.5s] सपने वो हैं जो हमें सोने नहीं देते।' },
  { emoji: '📞', title: 'Phone menu', male: false, vs: { stability: .9 }, text: 'Thank you for calling. [pause 0.5s] For billing, press one. For technical support, press two. [pause 0.5s] Your call is important to us.' },
  { emoji: '🍕', title: 'Funny announcement', male: true, vs: { style: .6 }, text: 'Attention please! [pause 0.5s] The last slice of pizza has been spotted in the kitchen. [laughs] May the fastest one win!' },
  { emoji: '🎉', title: 'Big news', male: false, vs: { style: .6 }, text: '[excited] Guess what? [pause 0.5s] We did it! [laughs] The project is finally live!' },
  { emoji: '🤫', title: 'Whispered secret', male: false, vs: {}, text: '[whispers] Can you keep a secret? [pause 1s] The treasure is hidden under the old oak tree.' },
];
const TIPS = [
  'Add <b>[laughs]</b> or <b>[whispers]</b> to your text for expressive speech.',
  'Try the <a href="#/live">Live Voice Changer</a> – talk and hear yourself as a robot.',
  'Tap ★ next to a voice to keep it at the top of the list.',
  'Use <b>[pause 1s]</b> for a dramatic pause.',
  'Add an echo or stadium effect to any converted audio.',
  'Reuse anything from <a href="#/history">History</a> to edit and regenerate it.',
];
/** Loads a template into Text to Voice: text, a fitting voice and suggested settings. */
function applyTemplate(t) {
  const v = (cloud.hosted && elVoiceFor(t.male, !!t.hindi)) || findVoice(t.hindi ? (t.male ? 'pre-anchor' : 'pre-narrator') : (t.male ? 'pre-man' : 'pre-woman'));
  S.tts.text = t.text; if (v) S.tts.voiceId = v.id;
  S.vs = { ...VS_DEFAULTS, ...t.vs }; saveVs();
  toast(`${t.emoji} ${t.title} loaded – edit it or tap Generate`);
}
const templateCards = () => TEMPLATES.map((t, i) => `<button type="button" class="tpl" data-tpl="${i}"><span class="tpl-emoji">${t.emoji}</span><strong>${t.title}</strong><small>${esc(t.text.replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 48))}…</small></button>`).join('');

/* Usage dashboard: ElevenLabs credits plus streak/week stats from history (or local recents). */
const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; };
function usageStats(times) {
  const days = new Set(times.map(dayKey)), now = Date.now();
  let streak = 0, t = now; if (!days.has(dayKey(t))) t -= 864e5;
  while (days.has(dayKey(t))) { streak++; t -= 864e5; }
  return { streak, week: times.filter(x => now - x < 7 * 864e5).length, total: times.length };
}
async function loadUsage(el) {
  const now = Date.now();
  if (cloud.hosted && (!S.usageCache || now - S.usageCache.t > 60000)) {
    const [u, d] = await Promise.all([cloud.usage().catch(() => null), cloud.historyDates().catch(() => null)]);
    S.usageCache = { t: now, u, d };
  }
  const u = cloud.hosted ? S.usageCache?.u : null, times = (cloud.hosted && S.usageCache?.d) || S.recents.map(x => x.ts).filter(x => now - x < 90 * 864e5);
  const st = usageStats(times);
  if (!el.isConnected) return;
  const left = u && u.limit ? Math.max(0, u.limit - u.used) : null, pct = left === null ? 0 : Math.round(left / u.limit * 100);
  const reset = u?.resetUnix ? new Date(u.resetUnix * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';
  el.classList.toggle('low', left !== null && pct < 10);
  el.innerHTML = `${left !== null ? `<div class="u-row"><strong>Voice credits</strong><span><b>${left.toLocaleString()}</b> of ${u.limit.toLocaleString()} left</span></div>
      <div class="bar"><i style="width:${pct}%"></i></div><small class="muted">${u.tier ? esc(String(u.tier)).replace(/^./, c => c.toUpperCase()) + ' plan' : ''}${reset ? ` · resets ${reset}` : ''}${pct < 10 ? ' · running low' : ''}</small>` : ''}
    <div class="u-stats"><div><b>🔥 ${st.streak}</b><small>day streak</small></div><div><b>${st.week}</b><small>this week</small></div><div><b>${st.total}</b><small>last 90 days</small></div></div>`;
}

/* Installable app (PWA). */
let installEvt = null;
const installHtml = cls => `<button type="button" class="${cls}" data-install ${installEvt ? '' : 'hidden'}>⬇ Install app</button>`;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; $$('[data-install]').forEach(b => { b.hidden = false; }); });
window.addEventListener('appinstalled', () => { installEvt = null; $$('[data-install]').forEach(b => { b.hidden = true; }); toast('JoloVocals installed'); });
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
  return { html: `<section class="screen auth"><div class="center" style="margin:6px 0 18px"><div class="brand" style="font-size:34px">Jolo<b>Vocals</b></div><div class="muted">AI Voice Studio</div></div>
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
  const items = S.recents.slice(0, 3), tip = TIPS[Math.floor(Math.random() * TIPS.length)];
  return { html: `<section class="screen has-nav"><div class="top home-top"><div class="brand" style="font-size:24px;flex:1">Jolo<b>Vocals</b> <span class="pro">Pro</span></div>${installHtml('install-chip')}</div>
    <div class="hello">Hello, ${esc(S.user.name)} 👋</div><p class="muted tip">💡 ${tip}</p>
    <button type="button" class="ucard" id="usage" ${cloud.hosted ? 'data-go="history"' : ''} aria-label="Your usage"><div class="u-stats"><div><b>…</b><small>loading</small></div></div></button>
    <button class="mcard live-card" data-go="live"><span class="ic">${icon('mic')}</span><span class="grow"><strong>Live Voice Changer</strong><small>Talk and hear yourself as a robot, monster, alien…</small></span>${icon('arrow')}</button>
    <div class="menu">${[['tts', 'text', 'Text to Voice', 'Type it, hear it in any voice'], ['v2v', 'wave', 'Voice to Voice', 'Convert your audio'],
      ['create', 'adduser', 'Create Voice', 'Clone a new voice'], ['library', 'lib', 'Voice Library', 'Manage your voices']]
      .map(([r, ic, t, s]) => `<button class="mcard" data-go="${r}"><span class="ic">${icon(ic)}</span><span class="grow"><strong>${t}</strong><small>${s}</small></span>${icon('arrow')}</button>`).join('')}</div>
    <div class="sec"><span>Try a template</span></div><div class="tpl-row">${templateCards()}</div>
    <div class="sec"><span>Recent Audios</span>${cloud.hosted ? '<a href="#/history">See all history</a>' : ''}</div>
    ${items.length ? items.map(a => `<div class="row" data-recent="${a.id}" style="cursor:pointer"><span class="play">${icon('play')}</span><div class="info"><strong>${esc(a.title)}</strong><small>${ago(a.ts)} • ${fmt(a.dur)}</small></div></div>`).join('')
      : '<div class="empty">Nothing yet – generate some speech or convert a voice.</div>'}${nav('home')}</section>`,
  bind: r => {
    $$('[data-recent]', r).forEach(el => el.onclick = () => openRecent(el.dataset.recent));
    $$('[data-tpl]', r).forEach(b => b.onclick = () => { applyTemplate(TEMPLATES[+b.dataset.tpl]); go('tts'); });
    loadUsage($('#usage', r));
  } };
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
    <div class="seg seg3"><button data-t="mine" class="${S.libTab === 'mine' ? 'on' : ''}">My Voices</button><button data-t="fav" class="${S.libTab === 'fav' ? 'on' : ''}">★ Favourites</button><button data-t="shared" class="${S.libTab === 'shared' ? 'on' : ''}">Shared</button></div>
    <div id="list"></div><div class="grow"></div><button class="btn" data-go="create">${icon('plus')} Create New Voice</button>${nav('library')}</section>`,
  bind: r => {
    const draw = () => {
      const favs = favSet(), pool = S.libTab === 'mine' ? S.voices : S.libTab === 'fav' ? [...favs].map(findVoice).filter(Boolean) : [...S.elVoices, ...PRESETS];
      const list = pool.filter(v => v.name.toLowerCase().includes(S.libQuery.toLowerCase()));
      $('#list', r).innerHTML = list.length ? list.map(v => `<div class="row" data-id="${v.id}"><button class="play" data-play>${icon('play')}</button>
        <div class="info"><strong>${esc(v.name)}</strong><small>${esc(v.cat)}${v.el ? '' : ` • ${Math.max(1, Math.round(v.dur / 60))} min`}${v.pitch ? ` • ${v.pitch} Hz` : ''}</small></div>
        <button class="icon-btn star" data-fav="${v.id}" aria-pressed="${favs.has(v.id)}" aria-label="Favourite ${esc(v.name)}">★</button>
        ${v.preset ? '' : '<button class="menu-btn" data-menu aria-label="Voice options">⋮</button>'}</div>`).join('')
        : `<div class="empty">${S.libTab === 'mine' ? 'No voices yet – create your first one.' : S.libTab === 'fav' ? 'No favourites yet – tap ★ on any voice.' : 'No matching voices.'}</div>`;
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
  const TAG_ICON = { Emotion: '😊', Delivery: '🎭', Pause: '⏸️' };
  return { html: `<section class="screen has-nav tts-screen">${top('Text to Voice')}
    <div class="tts-grid"><div class="tts-main">
      <div class="panel"><div class="panel-head"><strong>Voice</strong><span class="muted">★ favourite · ▶ preview</span></div>${voiceDropdown('v', t.voiceId)}</div>
      <div class="panel editor">
        <div class="panel-head"><strong>Script</strong><button type="button" class="chip-btn" id="tpl-open">✨ Templates</button></div>
        <textarea class="editor-text" id="txt" maxlength="5000" placeholder="Type what the voice should say… Add tags like [laughs] or [pause 1s] for expression." aria-label="Text to speak">${esc(t.text)}</textarea>
        <div class="tagbar" aria-label="Insert a tag">
          <div class="tagtabs" role="tablist">${TAG_GROUPS.map(([g], k) => `<button type="button" role="tab" class="tagtab ${k ? '' : 'on'}" data-tg="${k}" aria-selected="${!k}">${TAG_ICON[g] || ''} ${g}</button>`).join('')}</div>
          ${TAG_GROUPS.map(([, tags], k) => `<div class="tagchips" data-tgp="${k}" role="tabpanel" ${k ? 'hidden' : ''}>${tags.map(x => `<button type="button" class="tag" data-tag="${x}">${x}</button>`).join('')}</div>`).join('')}
        </div>
        <div class="editor-foot"><span class="muted">Tags are performed by ElevenLabs voices</span><span class="muted"><span id="cnt">${t.text.length}</span> / 5000</span></div>
      </div>
    </div>
    <aside class="tts-side">
      ${settingsHtml(['stability', 'similarity', 'style', 'speed', 'pitch', 'volume'], true)}
      <details class="vs"><summary>Advanced</summary><label class="lbl" style="margin-top:6px">Offline voice</label>
        <p class="muted" style="font-size:12px;margin-bottom:8px">Used only when ElevenLabs is unavailable.</p>${baseVoiceDropdown('sys', t.sysVoice)}</details>
    </aside></div>
    <div class="overlay" id="tpl-sheet" hidden><div class="ov-card sheet" role="dialog" aria-label="Templates"><h3 class="center">Templates</h3><div class="tpl-list">${templateCards()}</div><button class="btn ghost" id="tpl-close">Close</button></div></div>
    <div class="gen-bar"><button class="btn" id="gen">${icon('wave')} Generate Speech</button></div>${nav('tts')}</section>`,
  bind: r => {
    if (!('speechSynthesis' in window)) toast('Speech synthesis is not supported in this browser');
    $('#v', r).onchange = e => { t.voiceId = e.target.value; };
    $('#sys', r).onchange = e => { t.sysVoice = e.target.value; ls.set('sysvoice', t.sysVoice); toast(t.sysVoice ? 'Base voice set' : 'Base voice: automatic'); };
    if (!speechSynthesis.getVoices().length) speechSynthesis.addEventListener('voiceschanged', () => { if (location.hash === '#/tts') render(); }, { once: true });
    const ta = $('#txt', r), grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(420, Math.max(140, ta.scrollHeight + 2)) + 'px'; };
    ta.oninput = e => { t.text = e.target.value; $('#cnt', r).textContent = t.text.length; grow(); }; grow();
    $$('[data-tg]', r).forEach(b => b.onclick = () => {
      $$('[data-tg]', r).forEach(x => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
      $$('[data-tgp]', r).forEach(p => { p.hidden = p.dataset.tgp !== b.dataset.tg; });
    });
    $$('[data-tag]', r).forEach(b => b.onclick = () => {
      const ta = $('#txt', r), s = ta.selectionStart ?? ta.value.length, e = ta.selectionEnd ?? s, ins = `[${b.dataset.tag}]` + (/^\s/.test(ta.value.slice(e)) ? '' : ' ');
      const pre = ta.value.slice(0, s), lead = pre && !/\s$/.test(pre) ? ' ' : '';
      if ((ta.value.length - (e - s) + lead.length + ins.length) > 5000) return toast('Text is at the 5000 character limit');
      ta.value = pre + lead + ins + ta.value.slice(e); const at = s + lead.length + ins.length; ta.focus(); ta.setSelectionRange(at, at);
      ta.dispatchEvent(new Event('input'));
    });
    bindSettings(r);
    const sheet = $('#tpl-sheet', r);
    $('#tpl-open', r).onclick = () => { sheet.hidden = false; };
    $('#tpl-close', r).onclick = () => { sheet.hidden = true; };
    sheet.onclick = e => { if (e.target === sheet) sheet.hidden = true; };
    $$('[data-tpl]', r).forEach(b => b.onclick = () => { applyTemplate(TEMPLATES[+b.dataset.tpl]); render(); setTimeout(() => $('#txt')?.focus(), 50); });
    $('#gen', r).onclick = () => {
      if (!t.text.trim()) return toast('Enter some text first');
      noteVoiceUsed(t.voiceId);
      const id = uid(); S.ttsResult = { text: t.text, voiceId: t.voiceId, id, fresh: true }; go('tts-result');
    };
  } };
};

V['tts-result'] = () => {
  const res = S.ttsResult, v = res && findVoice(res.voiceId);
  if (!v) return { html: '', bind: () => go('tts') };
  return { html: `<section class="screen">${top('Generated Audio')}<div id="body"><div id="loader"></div>
    <div class="gap"></div><button class="btn ghost" id="cancel">Cancel</button></div></section>`,
  bind: async r => {
    const body = $('#body', r), gone = () => !r.isConnected;
    let cancelled = false, device = false, buf = res.buf, blob = res.blob, standIn = null;
    const pl = progressLoader($('#loader', r)), ctl = {};
    if (!buf) {
      $('#cancel', r).onclick = () => { cancelled = true; ctl.abort?.(); go('tts'); };
      // Voices without their own ElevenLabs voice speak through an ElevenLabs voice of the same gender
      standIn = !v.remote && cloud.hosted ? elVoiceFor(isMale(v), v.cat === 'Hindi' || /[\u0900-\u097F]/.test(res.text)) : null;
      const hostedId = v.remote || standIn?.remote;
      if (hostedId) {
        try {
          const words = stripTags(res.text).split(/\s+/).filter(Boolean).length, expectSec = Math.max(2, words * .4 / (S.vs.speed || 1));
          blob = await hostedWithProgress(pl, 'tts', JSON.stringify({ voice_id: hostedId, text: res.text, stability: S.vs.stability, similarity: S.vs.similarity, style: S.vs.style, speed: S.vs.speed, boost: S.vs.boost }), expectSec, ctl, 'Generating with ElevenLabs…');
          pl.set(97, 'Decoding…'); buf = await decode(blob);
          if (standIn) { pl.set(97, 'Matching the voice…'); await sleep(20); const s = shapeToVoice(buf, v, S.vs.similarity); if (s) { buf = s; blob = encodeWav(mono(s), s.sampleRate); } }
        } catch (e) { if (cancelled) return; buf = blob = null; toast(`ElevenLabs unavailable (${String(e.message).slice(0, 60)}) – using the device voice`); }
      }
      if (!buf) device = true;
    }
    if (gone()) return;
    if (buf && !res.buf) { pl.set(98, 'Applying settings…'); await sleep(20); const c = applyControls(buf); if (c) { buf = c; blob = encodeWav(mono(c), c.sampleRate); } }
    if (buf && !res.buf) { pl.done(); await sleep(350); } else pl.stop();
    if (gone()) return;
    const src = device ? speakSource(res.text, v, S.vs.stability, S.vs.similarity, S.tts.sysVoice, S.vs) : bufferSource(buf), dry = { buf, blob };
    body.innerHTML = `<div class="player">${playerHtml(device ? fakePeaks(res.text.length) : peaks(buf), src.duration, true)}</div>
      ${device ? '' : tuneHtml(res.tune || (res.tune = { ...TUNE_DEFAULTS }))}
      <p class="muted center" style="margin-bottom:14px">“${esc(res.text.slice(0, 90))}${res.text.length > 90 ? '…' : ''}” — ${esc(v.name)}${standIn && buf ? ` (ElevenLabs ${esc(standIn.name.split(' - ')[0])})` : ''}${device ? ' (device voice)' : ''}</p>
      <div class="actions"><button class="act" id="dl" ${device ? 'disabled' : ''}>${icon('download')}Download</button>
        <button class="act" id="sh">${icon('share')}Share</button><button class="act del" id="rm">${icon('trash')}Delete</button></div>
      <button class="btn" id="again">Generate Again</button>`;
    let p = bindPlayer($('.player', r), async () => device ? src : bufferSource(buf));
    if (!device) r._cleanup = bindTune(r, { tune: res.tune, dry, stop: () => p(),
      apply: (b2, bl2) => { p(); buf = b2; blob = bl2; const pl = $('.player', r); pl.innerHTML = playerHtml(peaks(buf), buf.duration, true); p = bindPlayer(pl, async () => bufferSource(buf)); $('.play', pl).click(); } });
    if (res.fresh) { res.fresh = false; const item = { id: res.id, kind: 'tts', title: res.text.slice(0, 32), text: res.text, voiceId: res.voiceId, ts: Date.now(), dur: src.duration }; S.recents.unshift(item); saveRecents(); cloud.upsertRecent(item); if (blob) blobs.put('audio:' + res.id, blob); }
    setTimeout(() => $('.play', r)?.click(), 250);
    $('#again', r).onclick = () => { if (device) { p(); $('.play', r).click(); } else { res.buf = res.blob = null; res.fresh = false; res.tune = null; render(); } };
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
    <div class="overlay" id="conv-ov" hidden><div class="ov-card" role="dialog" aria-label="Converting audio"><h3 class="center">Converting audio</h3><div id="conv-pl"></div>
      <button class="btn ghost" id="conv-cancel">Cancel</button></div></div>
    <div class="grow"></div><div class="gap"></div><button class="btn" id="conv" ${st.sample ? '' : 'disabled'}>${icon('wave')} Convert Audio</button>${nav('v2v')}</section>`,
  bind: r => {
    const show = () => { $('#chosen', r).innerHTML = chosenHtml(st.sample); $('#conv', r).disabled = false; const halt = bindPlayer($('.filechip', r), async () => bufferSource(st.sample.buf));
      $('.retake', r).onclick = () => { const again = st.sample.rec; halt(); st.sample = null; $('#chosen', r).innerHTML = ''; $('#conv', r).disabled = true; $('.rec-time', r).textContent = `00:00 / ${fmt(120)}`; if (again) $('.rec', r).click(); }; };
    if (st.sample) show();
    const stopRec = bindCapture(r, async (blob, rec) => { const s = await loadSample(blob, 1); if (s) { s.rec = rec; st.sample = s; show(); } }, 120);
    $('#v', r).onchange = e => { st.voiceId = e.target.value; };
    bindSettings(r);
    $('#conv', r).onclick = async () => {
      const btn = $('#conv', r), voice = findVoice(st.voiceId), ov = $('#conv-ov', r), ctl = {}; let cancelled = false;
      btn.disabled = true; stopRec(); ov.hidden = false; noteVoiceUsed(voice.id);
      const pl = progressLoader($('#conv-pl', r)), step = async (p, label) => { pl.set(p, label, true); await sleep(50); if (cancelled) throw new Error('cancelled'); };
      const restore = () => { pl.stop(); ov.hidden = true; btn.disabled = false; };
      $('#conv-cancel', r).onclick = () => { cancelled = true; ctl.abort?.(); restore(); toast('Conversion cancelled'); };
      try {
        let out, blob;
        if (voice.remote && cloud.hosted) {
          try {
            await step(2, 'Preparing audio…');
            const f = new FormData(); f.set('voice_id', voice.remote); f.set('audio', wavForUpload(st.sample.buf, 120), 'input.wav'); f.set('stability', S.vs.stability); f.set('similarity', S.vs.similarity); f.set('style', S.vs.style); f.set('boost', S.vs.boost);
            blob = await hostedWithProgress(pl, 'sts', f, Math.min(120, st.sample.dur), ctl, 'Converting on ElevenLabs…');
            await step(97, 'Decoding…'); out = await decode(blob);
          } catch (e) { if (cancelled) throw e; blob = out = null; toast(`Hosted conversion unavailable (${String(e.message).slice(0, 60)}) – using the built-in converter`); }
        }
        if (!out) {
          await step(5, 'Analysing your voice…');
          const srcPitch = detectPitch(st.sample.buf); if (!srcPitch) toast('Couldn’t detect the pitch of your audio – converting at neutral');
          await step(30, 'Shifting the voice…');
          const ratio = srcPitch ? clamp((voice.pitch || 150) / srcPitch, .5, 2) : 1, shifted = psolaShift(st.sample.buf, ratio) || pitchShift(st.sample.buf, ratio);
          await step(85, voice.fx ? 'Applying effect…' : 'Finishing…');
          const sr = shifted.sr, data = applyFx(shifted.data, sr, voice.fx);
          out = ac().createBuffer(1, data.length, sr); out.copyToChannel(data, 0); blob = encodeWav(data, sr);
        }
        await step(98, 'Applying settings…');
        const c = applyControls(out); if (c) { out = c; blob = encodeWav(mono(c), c.sampleRate); }
        const id = uid(); await blobs.put('audio:' + id, blob);
        pl.done(); await sleep(350); if (cancelled) return;
        S.v2vResult = { id, original: st.sample.buf, converted: out, blob, voice: voice.name };
        const item = { id, kind: 'v2v', title: `Converted to ${voice.name}`, ts: Date.now(), dur: out.duration }; S.recents.unshift(item); saveRecents(); cloud.upsertRecent(item); go('v2v-result');
      } catch (e) { if (cancelled) return; console.error(e); toast('Conversion failed'); restore(); }
    };
  } };
};

V['v2v-result'] = () => {
  const res = S.v2vResult; if (!res) return { html: '', bind: () => go('v2v') };
  let which = 'converted';
  return { html: `<section class="screen">${top('Converted Audio')}
    <div class="seg"><button data-w="original" ${res.original ? '' : 'disabled'}>Original</button><button data-w="converted" class="on">Converted</button></div>
    <div class="player" id="pl"></div>
    ${tuneHtml(res.tune || (res.tune = { ...TUNE_DEFAULTS }))}
    <div class="actions"><button class="act" id="dl">${icon('download')}Download</button><button class="act" id="sh">${icon('share')}Share</button><button class="act del" id="rm">${icon('trash')}Delete</button></div>
    <div class="grow"></div><button class="btn" id="more">${icon('wave')} Convert Another</button></section>`,
  bind: r => {
    let halt;
    const draw = () => { const buf = res[which]; $('#pl', r).innerHTML = playerHtml(peaks(buf), buf.duration, true); halt = bindPlayer($('#pl', r), async () => bufferSource(res[which])); };
    draw();
    $$('.seg button', r).forEach(b => b.onclick = () => { if (b.disabled) return; halt(); which = b.dataset.w; $$('.seg button', r).forEach(x => x.classList.toggle('on', x === b)); draw(); });
    res.dry = res.dry || { buf: res.converted, blob: res.blob };   // tuning always starts from the unprocessed result
    r._cleanup = bindTune(r, { tune: res.tune, dry: res.dry, stop: () => halt(),
      apply: (buf, blob) => { halt(); res.converted = buf; res.blob = blob; which = 'converted'; $$('.seg button', r).forEach(x => x.classList.toggle('on', x.dataset.w === 'converted')); draw(); $('#pl .play', r).click(); } });
    $('#dl', r).onclick = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(res.blob); a.download = `jolovocals-${res.id}.${res.blob.type.includes('mpeg') ? 'mp3' : 'wav'}`; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };
    $('#sh', r).onclick = async () => { const f = new File([res.blob], 'jolovocals.wav', { type: 'audio/wav' });
      if (navigator.canShare?.({ files: [f] })) navigator.share({ files: [f] }).catch(() => {}); else toast('Sharing files isn’t supported here – use Download'); };
    $('#rm', r).onclick = () => { S.recents = S.recents.filter(a => a.id !== res.id); saveRecents(); cloud.deleteRecent(res.id); blobs.del('audio:' + res.id); S.v2vResult = null; go('v2v'); };
    $('#more', r).onclick = () => { S.v2v.sample = null; go('v2v'); };
  } };
};

/* Live voice changer: mic → pitch worklet → effect chain → speakers (+ recorder). */
/** Cuts trailing silence (below about −50 dBFS) to `keep` seconds after the last sound. */
function trimTail(buf, keep) {
  const sr = buf.sampleRate, chs = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
  let last = 0;
  for (let i = buf.length - 1; i >= 0 && !last; i--) for (const d of chs) if (Math.abs(d[i]) > .003) { last = i; break; }
  const n = Math.min(buf.length, last + Math.round(keep * sr));
  if (!last || n >= buf.length - sr * .05) return buf;
  const out = new AudioBuffer({ length: n, numberOfChannels: chs.length, sampleRate: sr });
  chs.forEach((d, c) => out.copyToChannel(d.subarray(0, n), c));
  return out;
}
V.live = () => {
  const L = S.live;
  return { html: `<section class="screen has-nav">${top('Live Voice Changer')}
    <p class="muted center">Talk and hear yourself transformed in real time. 🎧 Use headphones to avoid feedback.</p>
    <button class="livebtn" id="live-toggle" aria-pressed="false" aria-label="Start live voice">${icon('mic')}<span>Start</span></button>
    <div class="meter" aria-hidden="true"><i id="lvl"></i></div>
    <p class="center muted" id="live-status">Microphone is off</p>
    <div class="fxgrid" role="group" aria-label="Voice effect">${FX_PRESETS.map(p => `<button type="button" class="fxcard ${p.id === L.preset ? 'on' : ''}" data-live="${p.id}"><span>${p.emoji}</span>${p.name}</button>`).join('')}</div>
    <details class="vs" open><summary>Fine-tune</summary>
      <div class="slider"><span>Pitch</span><input type="range" id="lv-pitch" min="-12" max="12" step="1" value="${L.pitch}" aria-label="Pitch"><b id="lv-pitch-v">${L.pitch > 0 ? '+' : ''}${L.pitch} st</b></div>
      <div class="slider"><span>Echo</span><input type="range" id="lv-echo" min="0" max="0.8" step="0.05" value="${L.echo}" aria-label="Echo"><b id="lv-echo-v">${Math.round(L.echo * 100)}%</b></div>
      <div class="slider"><span>Reverb</span><input type="range" id="lv-reverb" min="0" max="1" step="0.05" value="${L.reverb}" aria-label="Reverb"><b id="lv-reverb-v">${Math.round(L.reverb * 100)}%</b></div>
      <label class="check" style="margin:8px 0"><input type="checkbox" id="lv-monitor" ${L.monitor ? 'checked' : ''}><span>Hear myself <span class="muted">– turn off to record silently</span></span></label>
      <label class="check" style="margin:8px 0"><input type="checkbox" id="lv-denoise" ${L.denoise ? 'checked' : ''}><span>Reduce background noise <span class="muted">– may clip quiet word endings</span></span></label>
    </details>
    <div class="grow"></div><button class="btn" id="live-rec" disabled>${icon('mic')} Record</button>${nav('live')}</section>`,
  bind: r => {
    let ctx = null, stream = null, src = null, shifter = null, chainOut = null, outGain = null, analyser = null, recDest = null, rec = null, chunks = [], recT0 = 0, raf = 0, tick = 0, finishing = null;
    const status = t => { $('#live-status', r).textContent = t; };
    const fx = () => ({ ...fxPreset(L.preset), echo: L.echo, reverb: L.reverb });
    const save = () => ls.set('live', L);
    // Raw mic by default: the browser's noise suppression gates quiet word endings and echo cancellation ducks the voice.
    const micConstraints = () => ({ echoCancellation: false, noiseSuppression: !!L.denoise, autoGainControl: false });
    /** How long sound keeps coming out of the chain after the voice stops: pitch delay line + echo repeats + reverb tail. */
    const tailMs = () => {
      const echo = L.echo || 0, fb = Math.min(.75, echo * .9);
      const echoMs = echo > 0 && fb > 0 ? Math.ceil(Math.log(.01 / echo) / Math.log(fb)) * 280 : 0;
      return Math.min(2500, 350 + Math.max(0, echoMs) + (L.reverb > 0 ? 1500 : 0));
    };
    /** Stops the recording after the effect tail has played out, so the last word isn't cut. */
    const finishRec = () => finishing || (finishing = new Promise(res => {
      if (!rec || rec.state !== 'recording') { finishing = null; return res(); }
      const btn = $('#live-rec', r); clearInterval(tick); btn.disabled = true; btn.innerHTML = 'Finishing…';
      const done = rec.onstop; rec.onstop = async e => { finishing = null; await done?.(e); res(); };
      setTimeout(() => { if (rec?.state === 'recording') rec.stop(); else { finishing = null; res(); } }, tailMs());
    }));
    const rewire = () => {   // (re)build the effect chain after a preset or mix change
      if (!ctx) return;
      const head = shifter || src;
      try { head.disconnect(); } catch { /* not connected yet */ }
      if (chainOut) try { chainOut.disconnect(); } catch { /* already gone */ }
      chainOut = buildFxChain(ctx, fx(), head); chainOut.connect(outGain);
      if (shifter) shifter.parameters.get('ratio').value = 2 ** (L.pitch / 12);
    };
    const stop = () => {
      cancelAnimationFrame(raf); clearInterval(tick); finishing = null;
      if (rec && rec.state !== 'inactive') rec.stop();
      stream?.getTracks().forEach(t => t.stop()); ctx?.close().catch(() => {});
      ctx = stream = src = shifter = chainOut = outGain = analyser = recDest = null;
      const b = $('#live-toggle', r); if (b) { b.classList.remove('on'); b.setAttribute('aria-pressed', 'false'); $('span', b).textContent = 'Start'; $('#live-rec', r).disabled = true; status('Microphone is off'); $('#lvl', r).style.width = '0'; }
    };
    const start = async () => {
      try { stream = await navigator.mediaDevices.getUserMedia({ audio: micConstraints() }); }
      catch { return toast('Microphone unavailable – allow access to use the live voice changer'); }
      ctx = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      src = ctx.createMediaStreamSource(stream);
      try {
        await ctx.audioWorklet.addModule(URL.createObjectURL(new Blob([PITCH_WORKLET], { type: 'application/javascript' })));
        shifter = new AudioWorkletNode(ctx, 'pitch-shifter'); src.connect(shifter);
      } catch (e) { console.warn('[live] pitch shifting unavailable', e); shifter = null; toast('Pitch shifting isn’t supported in this browser – other effects still work'); }
      outGain = ctx.createGain(); analyser = ctx.createAnalyser(); analyser.fftSize = 1024; recDest = ctx.createMediaStreamDestination();
      outGain.connect(analyser); outGain.connect(recDest); if (L.monitor) outGain.connect(ctx.destination);
      rewire();
      const lvl = $('#lvl', r), data = new Float32Array(analyser.fftSize);
      const draw = () => { if (!analyser) return; analyser.getFloatTimeDomainData(data); let s = 0; for (const x of data) s += x * x; lvl.style.width = Math.min(100, Math.sqrt(s / data.length) * 400) + '%'; raf = requestAnimationFrame(draw); };
      draw();
      const b = $('#live-toggle', r); b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); $('span', b).textContent = 'Stop'; $('#live-rec', r).disabled = false;
      status(`Live · ${fxPreset(L.preset).name}`);
    };
    $('#live-toggle', r).onclick = async () => {
      if (!ctx) return start();
      if (rec && rec.state === 'recording') { $('#live-toggle', r).disabled = true; await finishRec(); const t = $('#live-toggle', r); if (t) t.disabled = false; }
      stop();
    };
    $$('[data-live]', r).forEach(b => b.onclick = () => {
      const p = fxPreset(b.dataset.live); L.preset = p.id; L.pitch = p.pitch || 0; L.echo = p.echo || 0; L.reverb = p.reverb || 0; save();
      $$('[data-live]', r).forEach(x => x.classList.toggle('on', x === b));
      $('#lv-pitch', r).value = L.pitch; $('#lv-echo', r).value = L.echo; $('#lv-reverb', r).value = L.reverb;
      $('#lv-pitch-v', r).textContent = `${L.pitch > 0 ? '+' : ''}${L.pitch} st`; $('#lv-echo-v', r).textContent = Math.round(L.echo * 100) + '%'; $('#lv-reverb-v', r).textContent = Math.round(L.reverb * 100) + '%';
      rewire(); if (ctx) status(`Live · ${p.name}`);
    });
    [['pitch', v => `${v > 0 ? '+' : ''}${v} st`], ['echo', v => Math.round(v * 100) + '%'], ['reverb', v => Math.round(v * 100) + '%']].forEach(([k, show]) =>
      $('#lv-' + k, r).oninput = e => { L[k] = +e.target.value; $(`#lv-${k}-v`, r).textContent = show(L[k]); save(); if (k === 'pitch') { if (shifter) shifter.parameters.get('ratio').value = 2 ** (L.pitch / 12); } else rewire(); });
    $('#lv-denoise', r).onchange = async e => {
      L.denoise = e.target.checked; save();
      const track = stream?.getAudioTracks()[0]; if (!track) return;
      try { await track.applyConstraints(micConstraints()); }
      catch {   // some browsers can't change processing on a live track – reopen the mic
        if (rec && rec.state === 'recording') return toast('Takes effect after this recording');
        stop(); start();
      }
    };
    $('#lv-monitor', r).onchange = e => { L.monitor = e.target.checked; save(); if (outGain) { try { outGain.disconnect(ctx.destination); } catch { /* wasn't connected */ } if (L.monitor) outGain.connect(ctx.destination); } };
    $('#live-rec', r).onclick = () => {
      const btn = $('#live-rec', r);
      if (rec && rec.state === 'recording') { finishRec(); return; }
      chunks = []; rec = new MediaRecorder(recDest.stream); rec.ondataavailable = e => e.data.size && chunks.push(e.data);
      rec.onstop = async () => {
        clearInterval(tick); btn.innerHTML = `${icon('mic')} Record`; btn.classList.remove('rec-on'); btn.disabled = !ctx;
        if (!chunks.length) return;
        try {
          const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' }), buf = trimTail(await decode(blob), .3);
          if (buf.duration < .5) return toast('Recording too short');
          const wav = encodeWav(mono(buf), buf.sampleRate), id = uid(), name = fxPreset(L.preset).name;
          await blobs.put('audio:' + id, wav);
          S.v2vResult = { id, original: null, converted: buf, blob: wav, voice: `Live · ${name}` };
          const item = { id, kind: 'v2v', title: `Live · ${name}`, ts: Date.now(), dur: buf.duration }; S.recents.unshift(item); saveRecents(); cloud.upsertRecent(item);
          go('v2v-result');
        } catch (e) { console.error(e); toast('Couldn’t save the recording'); }
      };
      rec.start(); recT0 = Date.now(); btn.classList.add('rec-on');
      tick = setInterval(() => { btn.innerHTML = `■ Stop recording · ${fmt(Math.floor((Date.now() - recT0) / 1000))}`; }, 250);
      btn.innerHTML = '■ Stop recording · 00:00';
    };
    r._cleanup = stop;
  } };
};

/* Generation history kept on our server by voice-api (audio in storage, rows in generation_history). */
const voiceNameFor = id => (S.elVoices.find(v => v.remote === id) || S.voices.find(v => v.remote === id))?.name?.split(' - ')[0] || 'ElevenLabs voice';
const fmtWhen = iso => { const d = new Date(iso); return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }) + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); };
const fmtSize = b => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
V.history = () => {
  const PAGE = 20; let kind = '', from = 0, items = [];
  return { html: `<section class="screen">${top('History')}
    <div class="seg seg3"><button data-k="" class="on">All</button><button data-k="tts">Text to Voice</button><button data-k="sts">Voice to Voice</button></div>
    <div id="hist"></div><button class="btn ghost" id="more" hidden>Load more</button></section>`,
  bind: r => {
    if (!cloud.hosted) { $('#hist', r).innerHTML = '<div class="empty">History is kept on the server when you are signed in with hosted voices on.</div>'; return; }
    const audio = async h => { let b = await idb.get('hist:' + h.id); if (!b) { b = await cloud.historyAudio(h.audio_path); idb.put('hist:' + h.id, b); } return b; };
    const draw = () => {
      $('#hist', r).innerHTML = items.length ? items.map((h, i) => `<div class="row hrow" data-i="${i}"><button class="play" data-play aria-label="Play">${icon('play')}</button>
        <div class="info"><strong>${h.kind === 'tts' ? 'Text to Voice' : 'Voice to Voice'} · ${esc(voiceNameFor(h.voice_id))}</strong>
        ${h.text ? `<span class="htext">“${esc(h.text.length > 120 ? h.text.slice(0, 120) + '…' : h.text)}”</span>` : ''}
        <small>${fmtWhen(h.created_at)}${h.bytes ? ' • ' + fmtSize(h.bytes) : ''}${h.model ? ' • ' + esc(h.model.replace('eleven_', '').replace(/_/g, ' ')) : ''}</small>
        <div class="hacts"><button class="hact" data-reuse title="${h.kind === 'tts' ? 'Open the text and voice in Text to Voice to edit' : 'Load this audio into Voice to Voice'}">${icon('text')}Reuse</button>
          <button class="hact" data-dl>${icon('download')}Download</button><button class="hact del" data-del>${icon('trash')}Delete</button></div></div></div>`).join('')
        : '<div class="empty">Nothing here yet – generate speech or convert a voice with an ElevenLabs voice.</div>';
      $$('[data-play]', r).forEach(b => b.onclick = async () => {
        const h = items[+b.closest('.hrow').dataset.i]; if (S.stopPlayback) S.stopPlayback();
        b.disabled = true; let src;
        try { src = bufferSource(await decode(await audio(h))); } catch (e) { b.disabled = false; return toast(`Couldn’t load that audio (${String(e.message).slice(0, 50)})`); }
        b.disabled = false; const reset = () => { b.innerHTML = icon('play'); S.stopPlayback = null; };
        const stop = src.play(reset); b.innerHTML = icon('pause'); S.stopPlayback = () => { stop(); reset(); };
      });
      $$('[data-reuse]', r).forEach(b => b.onclick = async () => {
        const h = items[+b.closest('.hrow').dataset.i], voice = allVoices().find(v => v.remote === h.voice_id);
        if (h.kind === 'tts') {
          S.tts.text = h.text || ''; if (voice) S.tts.voiceId = voice.id;
          toast(voice ? 'Loaded – edit the text and generate again' : 'Text loaded – that voice is no longer available, pick another'); return go('tts');
        }
        b.disabled = true;
        try {
          const s = await loadSample(await audio(h), 1); if (!s) return;
          S.v2v.sample = s; if (voice) S.v2v.voiceId = voice.id; toast('Audio loaded into Voice to Voice'); go('v2v');
        } catch (e) { toast(`Couldn’t load that audio (${String(e.message).slice(0, 50)})`); } finally { b.disabled = false; }
      });
      $$('[data-del]', r).forEach(b => b.onclick = async () => {
        const row = b.closest('.hrow'), h = items[+row.dataset.i];
        if (!confirm('Delete this item from your history? The audio is removed from the server too.')) return;
        if (S.stopPlayback) S.stopPlayback(); b.disabled = true; row.classList.add('busy');
        try { await cloud.deleteHistory(h.id); idb.del('hist:' + h.id); items = items.filter(x => x !== h); from = Math.max(0, from - 1); draw(); toast('Deleted from history'); }
        catch (e) { b.disabled = false; row.classList.remove('busy'); toast(`Couldn’t delete (${String(e.message).slice(0, 60)})`); }
      });
      $$('[data-dl]', r).forEach(b => b.onclick = async () => {
        const h = items[+b.closest('.hrow').dataset.i];
        try { const blob = await audio(h), l = document.createElement('a'); l.href = URL.createObjectURL(blob); l.download = `jolovocals-${h.kind}-${h.created_at.slice(0, 10)}-${h.id.slice(0, 6)}.mp3`; l.click(); setTimeout(() => URL.revokeObjectURL(l.href), 1000); }
        catch (e) { toast(`Couldn’t download (${String(e.message).slice(0, 50)})`); }
      });
    };
    const load = async () => {
      const more = $('#more', r); more.disabled = true; more.textContent = 'Loading…';
      if (!items.length) $('#hist', r).innerHTML = '<div class="empty">Loading history…</div>';
      try { const page = await cloud.history(kind, from, PAGE); items = items.concat(page); from += page.length; more.hidden = page.length < PAGE; draw(); }
      catch (e) { $('#hist', r).innerHTML = `<div class="empty">Couldn’t load history (${esc(String(e.message).slice(0, 80))})</div>`; more.hidden = true; }
      more.disabled = false; more.textContent = 'Load more';
    };
    $$('.seg button', r).forEach(b => b.onclick = () => { if (S.stopPlayback) S.stopPlayback(); kind = b.dataset.k; from = 0; items = []; $$('.seg button', r).forEach(x => x.classList.toggle('on', x === b)); load(); });
    $('#more', r).onclick = load;
    load();
  } };
};

V.profile = () => ({
  html: `<section class="screen has-nav">${top('Profile', false)}<div class="center"><div class="okmark" style="background:var(--soft);color:var(--p);width:84px;height:84px">${icon('user')}</div>
    <h2>${esc(S.user.name)}</h2><p class="muted">${esc(S.user.id)}</p><p class="muted">${cloud.on ? '☁ Synced to your account' : 'Stored on this device only'}</p></div><div class="gap"></div>
    <div class="card"><strong>${S.voices.length}</strong> custom voice${S.voices.length === 1 ? '' : 's'} saved on this device</div>
    ${cloud.hosted ? `<div class="gap"></div><button class="btn ghost" data-go="history">${icon('lib')} Generation history</button>` : ''}
    <div class="gap"></div>${installHtml('btn ghost')}
    ${/iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone ? '<p class="muted center" style="margin-top:10px">On iPhone: tap Share → <b>Add to Home Screen</b> to install.</p>' : ''}
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
  const prev = $('.screen', app), dir = S.navSlide && S.navSlide[1] === name ? S.navSlide[0] : 0, fromTab = S.navFrom; S.navSlide = null;
  const view = V[name](); app.innerHTML = view.html; app._cleanup = null;
  const bar = $('.screen > nav.bottom', app); if (bar) app.appendChild(bar);   // outside the screen so slides don't move it
  S.navFrom = TABS.includes(name) ? name : null;
  $$('[data-go]', app).forEach(b => b.onclick = () => {
    const from = TABS.indexOf(S.navFrom), to = TABS.indexOf(b.dataset.go);
    if (b.closest('nav.bottom') && from >= 0 && to >= 0 && from !== to) S.navSlide = [Math.sign(to - from), b.dataset.go];
    go(b.dataset.go);
  });
  $$('[data-back]', app).forEach(b => b.onclick = () => history.length > 1 ? history.back() : go('home'));
  $$('[data-install]', app).forEach(b => b.onclick = async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice.catch(() => {}); installEvt = null; $$('[data-install]').forEach(x => { x.hidden = true; }); });
  document.body.classList.toggle('with-nav', !!$('nav.bottom', app));
  const next = $('.screen', app), y = window.scrollY;
  bindDropdowns(app); const c = view.bind(app); app.scrollTo?.(0, 0); window.scrollTo(0, 0);
  if (dir && prev && next?.isConnected && !matchMedia('(prefers-reduced-motion: reduce)').matches) slideScreens(app, prev, next, dir, y);
  if (bar?.isConnected) moveNavInd(bar, fromTab);
  if (c && c.catch) c.catch(console.error);
}
/** Slides the old screen out and the new one in; `dir` 1 = to a tab on the right/below, -1 = to the left/above. */
function slideScreens(app, prev, next, dir, y) {
  prev.querySelectorAll('[id]').forEach(e => e.removeAttribute('id'));
  prev.style.top = -y + 'px';
  prev.classList.add('leaving', dir > 0 ? 'to-l' : 'to-r'); prev.setAttribute('aria-hidden', 'true'); prev.inert = true;
  next.classList.add(dir > 0 ? 'from-r' : 'from-l');
  app.classList.add('sliding'); app.appendChild(prev);
  const done = () => { prev.remove(); next.classList.remove('from-r', 'from-l'); if (!$('.screen.leaving', app)) app.classList.remove('sliding'); };
  prev.addEventListener('animationend', done, { once: true }); setTimeout(done, 600);
}
/** Glides the nav indicator from the previously active tab to the current one. */
function moveNavInd(bar, fromTab) {
  const ind = $('.ind', bar), cur = $('button.on', bar), from = fromTab && $(`button[data-go="${fromTab}"]`, bar);
  if (!cur) return;
  const place = b => { ind.style.setProperty('--x', b.offsetLeft + 'px'); ind.style.setProperty('--y', b.offsetTop + 'px');
    ind.style.setProperty('--w', b.offsetWidth + 'px'); ind.style.setProperty('--h', b.offsetHeight + 'px'); ind.classList.toggle('at-mic', b.classList.contains('mic')); };
  ind.style.transition = 'none'; place(from || cur); bar.classList.add('has-ind');
  void ind.offsetWidth; ind.style.transition = ''; place(cur);
}
window.addEventListener('hashchange', render);
window.addEventListener('resize', () => { const bar = $('#app > nav.bottom'); if (bar) moveNavInd(bar, null); });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(e => console.warn('[sw]', e));
speechSynthesis?.getVoices();
(async () => {
  if (cloud.on) {
    const u = await cloud.session().catch(() => null);
    if (u) await startSession(u); else if (S.user) { S.user = null; ls.set('user', null); }
  }
  render();
})();
})();
