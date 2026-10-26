// Run with: node --test supabase/functions/voice-api/index.test.mjs   (Node 22.18+)
import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from './index.ts';

const calls = [];
let tier = 'starter';
const mockFetch = (owned = true) => async (url, init = {}) => {
  calls.push({ url: String(url), init });
  if (String(url).endsWith('/user/subscription')) return new Response(JSON.stringify({ tier }), { status: 200 });
  if (String(url).endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: 'u1' }), { status: init.headers?.authorization === 'Bearer t' ? 200 : 401 });
  if (String(url).includes('/rest/v1/voices')) return new Response(JSON.stringify(owned ? [{ id: 'x' }] : []), { status: 200 });
  if (String(url).endsWith('/v1/voices')) return new Response(JSON.stringify({ voices: [
    { voice_id: 'premadeVoice0001', name: 'Roger', category: 'premade', labels: { gender: 'male', language: 'en' }, preview_url: 'https://x/p.mp3' },
    { voice_id: 'someonesClone001', name: 'Clone', category: 'cloned', labels: {}, preview_url: '' },
    { voice_id: 'libraryHindi0001', name: 'Adarsh', category: 'professional', labels: { gender: 'male', language: 'hi' }, preview_url: '' }] }), { status: 200 });
  if (String(url).endsWith('/voices/add')) return new Response(JSON.stringify({ voice_id: 'abcdefghij123' }), { status: 200 });
  if (String(url).includes('/text-to-speech/')) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
  if (String(url).includes('/speech-to-speech/')) return new Response(new Uint8Array([4, 5]), { status: 200 });
  if (init.method === 'DELETE') return new Response('{}', { status: 200 });
  return new Response(JSON.stringify({ detail: { message: 'quota exceeded' } }), { status: 401 });
};
const deps = (o = true) => ({ elevenKey: 'k', supabaseUrl: 'https://p.supabase.co', anonKey: 'anon', fetch: mockFetch(o) });
const post = (path, body, auth = true) => new Request(`https://p.supabase.co/functions/v1/voice-api/${path}`, {
  method: 'POST', headers: { ...(auth ? { authorization: 'Bearer t' } : {}), ...(body instanceof FormData ? {} : { 'content-type': 'application/json' }) },
  body: body instanceof FormData ? body : JSON.stringify(body),
});

test('requires sign-in', async () => assert.equal((await handle(post('tts', {}, false), deps())).status, 401));
test('rejects the public app key used as a bearer token', async () => {
  const req = new Request('https://p.supabase.co/functions/v1/voice-api/clone', { method: 'POST', headers: { authorization: 'Bearer anon-key' }, body: new FormData() });
  assert.equal((await handle(req, deps())).status, 401);
});
test('clone returns the provider voice id and never leaks the key', async () => {
  const f = new FormData(); f.set('name', 'Me'); f.set('file', new Blob([new Uint8Array(10)], { type: 'audio/wav' }));
  const r = await handle(post('clone', f), deps()); assert.equal((await r.json()).voice_id, 'abcdefghij123');
  assert.equal(calls.at(-1).init.headers['xi-api-key'], 'k');
});
test('clone rejects empty or oversized samples', async () => {
  const f = new FormData(); f.set('file', new Blob([]));
  assert.equal((await handle(post('clone', f), deps())).status, 400);
  const big = new FormData(); big.set('file', new Blob([new Uint8Array(13 * 1024 * 1024)]));
  assert.equal((await handle(post('clone', big), deps())).status, 413);
});
test('tts streams audio for an owned voice', async () => {
  const r = await handle(post('tts', { voice_id: 'abcdefghij123', text: 'hi', stability: 2, similarity: -1 }), deps());
  assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'audio/mpeg');
  const sent = JSON.parse(calls.at(-1).init.body); assert.deepEqual(sent.voice_settings, { stability: 1, similarity_boost: 0 });
});
test('tts refuses voices the caller does not own', async () => assert.equal((await handle(post('tts', { voice_id: 'abcdefghij123', text: 'hi' }), deps(false))).status, 404));
test('tts validates text and voice id', async () => {
  assert.equal((await handle(post('tts', { voice_id: 'abcdefghij123', text: '' }), deps())).status, 400);
  assert.equal((await handle(post('tts', { voice_id: '../x', text: 'hi' }), deps())).status, 404);
});
test('sts converts uploaded audio', async () => {
  const f = new FormData(); f.set('voice_id', 'abcdefghij123'); f.set('audio', new Blob([new Uint8Array(20)]));
  assert.equal((await handle(post('sts', f), deps())).status, 200);
});
test('delete removes an owned voice', async () => assert.equal((await handle(post('delete', { voice_id: 'abcdefghij123' }), deps())).status, 200));
test('provider errors surface as readable messages', async () => {
  const d = { ...deps(), fetch: async u => String(u).endsWith('/auth/v1/user') ? new Response('{}') : String(u).includes('/rest/') ? new Response('[{"id":1}]') : new Response('{"detail":{"message":"quota exceeded"}}', { status: 401 }) };
  const r = await handle(post('tts', { voice_id: 'abcdefghij123', text: 'hi' }), d);
  assert.equal(r.status, 401); assert.equal((await r.json()).error, 'ElevenLabs 401: quota exceeded');
});

test('voices lists account voices but not other users\' clones', async () => {
  const r = await handle(post('voices', {}), deps()); const { voices } = await r.json();
  assert.deepEqual(voices.map(v => v.name), ['Roger', 'Adarsh']); assert.equal(voices[0].gender, 'male');
});
test('tts allows an account voice the caller does not own', async () => assert.equal((await handle(post('tts', { voice_id: 'premadeVoice0001', text: 'hi' }), deps(false))).status, 200));
test('tts still refuses unknown voices and account clones', async () => {
  assert.equal((await handle(post('tts', { voice_id: 'someonesClone001', text: 'hi' }), deps(false))).status, 404);
  assert.equal((await handle(post('tts', { voice_id: 'unknownVoice0001', text: 'hi' }), deps(false))).status, 404);
});
test('delete never removes account voices the caller does not own', async () => assert.equal((await handle(post('delete', { voice_id: 'premadeVoice0001' }), deps(false))).status, 404));
test('free plan only offers premade voices (library voices return 402 there)', async () => {
  tier = 'free';
  try {
    const { voices } = await (await handle(post('voices', {}), deps())).json();
    assert.deepEqual(voices.map(v => v.name), ['Roger']);
    assert.equal((await handle(post('tts', { voice_id: 'libraryHindi0001', text: 'hi' }), deps(false))).status, 404);
  } finally { tier = 'starter'; }
});
