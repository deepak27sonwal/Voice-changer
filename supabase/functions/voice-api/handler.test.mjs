// Run with: node --test supabase/functions/voice-api/handler.test.mjs   (Node 22.18+)
import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from './handler.ts';

const calls = [];
const mockFetch = (owned = true) => async (url, init = {}) => {
  calls.push({ url: String(url), init });
  if (String(url).includes('/rest/v1/voices')) return new Response(JSON.stringify(owned ? [{ id: 'x' }] : []), { status: 200 });
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
  const d = { ...deps(), fetch: async u => String(u).includes('/rest/') ? new Response('[{"id":1}]') : new Response('{"detail":{"message":"quota exceeded"}}', { status: 401 }) };
  const r = await handle(post('tts', { voice_id: 'abcdefghij123', text: 'hi' }), d);
  assert.equal(r.status, 401); assert.equal((await r.json()).error, 'quota exceeded');
});
