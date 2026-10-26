// Runs the neural TTS engine off the main thread so the UI never freezes.
// Protocol: {type:'load', url, model} → stage/progress/ready;  {type:'gen', id, text, voice, speed} → audio | error
let tts = null;
const post = (m, t) => self.postMessage(m, t || []);

self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'load') {
      post({ type: 'stage', text: 'Loading voice engine…' });
      const mod = await import(data.url), files = {};
      post({ type: 'stage', text: 'Downloading voice model…' });
      tts = await mod.KokoroTTS.from_pretrained(data.model, {
        dtype: 'q8', device: 'wasm',
        progress_callback: p => {
          if (p.status !== 'progress' || !p.total) return;
          files[p.file] = p; const all = Object.values(files);
          const f = all.reduce((s, x) => s + x.loaded, 0) / all.reduce((s, x) => s + x.total, 0);
          post({ type: 'progress', f });
          if (f >= .999) post({ type: 'stage', text: 'Starting voice model…' });
        },
      });
      post({ type: 'ready' });
    } else if (data.type === 'gen') {
      const a = await tts.generate(data.text, { voice: data.voice, speed: data.speed });
      post({ type: 'audio', id: data.id, audio: a.audio, sr: a.sampling_rate }, [a.audio.buffer]);
    }
  } catch (e) {
    post({ type: 'error', id: data.id, message: String((e && e.message) || e) });
  }
};
