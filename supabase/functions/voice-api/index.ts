// JoloVocals hosted voice API: a thin, authenticated proxy to ElevenLabs so the API key never reaches the browser.
// Routes (POST, signed-in users only): /voices, /clone, /tts, /sts, /delete
// Single file so it can be pasted straight into the Supabase dashboard editor. Function name: voice-api
const EL = 'https://api.elevenlabs.io/v1';
const MAX_SAMPLE = 12 * 1024 * 1024;
const VOICE_ID = /^[A-Za-z0-9]{10,40}$/;

export interface Deps { elevenKey: string; supabaseUrl: string; anonKey: string; fetch?: typeof fetch }

const cors = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, apikey, content-type, x-client-info',
  'access-control-allow-methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
const clamp01 = (v: unknown, d: number) => { const n = Number(v); return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : d; };

async function upstreamError(r: Response): Promise<Response> {
  let msg = 'no details';
  try { const b = await r.json(); const d = b?.detail; msg = typeof d === 'string' ? d : [d?.message, d?.status && `[${d.status}]`].filter(Boolean).join(' ') || JSON.stringify(b).slice(0, 200); } catch { /* keep default */ }
  msg = `ElevenLabs ${r.status}: ${msg}`;
  console.error('[voice-api] upstream', msg);
  const status = [401, 402, 403, 429].includes(r.status) ? r.status : 502;
  return json({ error: msg }, status);
}

export async function handle(req: Request, deps: Deps): Promise<Response> {
  const f = deps.fetch ?? fetch;
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (!req.headers.get('authorization')) return json({ error: 'sign in required' }, 401);
  if (!deps.elevenKey) return json({ error: 'voice provider is not configured' }, 500);

  // Require a real signed-in user, not just the public app key (works whether or not "Verify JWT" is on).
  const who = await f(`${deps.supabaseUrl}/auth/v1/user`, { headers: { apikey: deps.anonKey, authorization: req.headers.get('authorization')! } });
  if (!who.ok) return json({ error: 'sign in required' }, 401);

  const xi = { 'xi-api-key': deps.elevenKey };
  // Row-level security makes this query return only voices that belong to the caller.
  const owns = async (id: string) => {
    if (!VOICE_ID.test(id)) return false;
    const r = await f(`${deps.supabaseUrl}/rest/v1/voices?remote_id=eq.${id}&select=id&limit=1`, { headers: { apikey: deps.anonKey, authorization: req.headers.get('authorization')! } });
    if (!r.ok) { console.error('[voice-api] ownership lookup failed', r.status, await r.text()); return false; }
    const rows = await r.json();
    return Array.isArray(rows) && rows.length > 0;
  };
  // Voices in the ElevenLabs account itself (premade + saved library voices) may be used by any signed-in user.
  let accountVoices: { voice_id: string; name: string; category: string; labels: Record<string, string>; preview_url: string }[] | null = null;
  const listAccountVoices = async () => {
    if (accountVoices) return accountVoices;
    const r = await f(`${EL}/voices`, { headers: xi });
    if (!r.ok) { console.error('[voice-api] voice list failed', r.status); return []; }
    const b = await r.json();
    return accountVoices = (b.voices ?? []).filter((v: { category?: string }) => v.category !== 'cloned');
  };
  const usable = async (id: string) => VOICE_ID.test(id) && ((await owns(id)) || (await listAccountVoices()).some(v => v.voice_id === id));
  const settings = (stability: unknown, similarity: unknown) => ({ stability: clamp01(stability, .5), similarity_boost: clamp01(similarity, .75) });

  const path = new URL(req.url).pathname, route = path.split('/').filter(Boolean).pop();
  console.log('[voice-api]', req.method, path);
  try {
    if (route === 'voices') {
      const list = await listAccountVoices();
      return json({ voices: list.map(v => ({ voice_id: v.voice_id, name: v.name, category: v.category, preview_url: v.preview_url,
        gender: v.labels?.gender ?? null, language: v.labels?.language ?? null, accent: v.labels?.accent ?? null })) });
    }

    if (route === 'clone') {
      const form = await req.formData(), file = form.get('file');
      if (!(file instanceof Blob) || file.size === 0) return json({ error: 'audio sample required' }, 400);
      if (file.size > MAX_SAMPLE) return json({ error: 'sample too large' }, 413);
      const up = new FormData();
      up.set('name', `JoloVocals ${String(form.get('name') ?? 'voice').slice(0, 60)}`);
      up.set('description', 'Created in JoloVocals with the voice owner’s consent');
      up.set('remove_background_noise', 'true');
      up.append('files', file, 'sample.wav');
      const r = await f(`${EL}/voices/add`, { method: 'POST', headers: xi, body: up });
      if (!r.ok) return upstreamError(r);
      const { voice_id } = await r.json();
      return json({ voice_id });
    }

    if (route === 'tts') {
      const b = await req.json(), text = String(b.text ?? '').trim();
      if (!text || text.length > 5000) return json({ error: 'text must be 1–5000 characters' }, 400);
      if (!(await usable(String(b.voice_id)))) return json({ error: `voice not found for this account (${route})` }, 404);
      const r = await f(`${EL}/text-to-speech/${b.voice_id}?output_format=mp3_44100_128`, {
        method: 'POST', headers: { ...xi, 'content-type': 'application/json' },
        body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: settings(b.stability, b.similarity) }),
      });
      return r.ok ? new Response(r.body, { headers: { ...cors, 'content-type': 'audio/mpeg' } }) : upstreamError(r);
    }

    if (route === 'sts') {
      const form = await req.formData(), audio = form.get('audio'), id = String(form.get('voice_id'));
      if (!(audio instanceof Blob) || audio.size === 0) return json({ error: 'audio required' }, 400);
      if (audio.size > MAX_SAMPLE) return json({ error: 'audio too large' }, 413);
      if (!(await usable(id))) return json({ error: `voice not found for this account (${route})` }, 404);
      const up = new FormData();
      up.append('audio', audio, 'input.wav');
      up.set('model_id', 'eleven_multilingual_sts_v2');
      up.set('voice_settings', JSON.stringify(settings(form.get('stability'), form.get('similarity'))));
      up.set('remove_background_noise', 'true');
      const r = await f(`${EL}/speech-to-speech/${id}?output_format=mp3_44100_128`, { method: 'POST', headers: xi, body: up });
      return r.ok ? new Response(r.body, { headers: { ...cors, 'content-type': 'audio/mpeg' } }) : upstreamError(r);
    }

    if (route === 'delete') {
      const b = await req.json(), id = String(b.voice_id);
      if (!(await owns(id))) return json({ error: `voice not found for this account (${route})` }, 404);
      const r = await f(`${EL}/voices/${id}`, { method: 'DELETE', headers: xi });
      return r.ok || r.status === 404 ? json({ ok: true }) : upstreamError(r);
    }
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'bad request' }, 400);
  }
  return json({ error: `unknown route ${path}` }, 404);
}

// Guarded so the unit tests can import this file under Node.
if (typeof Deno !== 'undefined') {
  Deno.serve(req => handle(req, {
    elevenKey: Deno.env.get('ELEVENLABS_API_KEY') ?? '',
    supabaseUrl: Deno.env.get('SUPABASE_URL')!,
    anonKey: Deno.env.get('SUPABASE_ANON_KEY')!,
  }));
}
