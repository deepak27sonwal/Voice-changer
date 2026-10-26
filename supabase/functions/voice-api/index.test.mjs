// Run with: node --test supabase/functions/voice-api/index.test.mjs   (Node 22.18+)
import test from 'node:test';
import assert from 'node:assert/strict';
import { handle } from './index.ts';

const calls = [];
const lastTo = part => [...calls].reverse().find(c => c.url.includes(part));
let tier = 'starter';
const mockFetch = (owned = true) => async (url, init = {}) => {
  calls.push({ url: String(url), init });
  if (String(url).endsWith('/user/subscription')) return new Response(JSON.stringify({ tier, character_count: 3760, character_limit: 10000, next_character_count_reset_unix: 1793750400 }), { status: 200 });
  if (String(url).endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: 'u1' }), { status: init.headers?.authorization === 'Bearer t' ? 200 : 401 });
  if (String(url).includes('/v1/history?')) return new Response(JSON.stringify({ history: [] }), { status: 200 });
  if (String(url).includes('/v1/history/') && init.method === 'DELETE') return new Response('{}', { status: 200 });
  if (String(url).includes('/storage/v1/object/')) return new Response('{}', { status: 200 });
  if (String(url).includes('/rest/v1/generation_history')) return new Response('', { status: 201 });
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
  assert.equal(lastTo('/voices/add').init.headers['xi-api-key'], 'k');
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
  const sent = JSON.parse(lastTo('/text-to-speech/').init.body); assert.deepEqual(sent.voice_settings, { stability: 1, similarity_boost: 0, style: 0, use_speaker_boost: true });
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
test('tts passes style, speed (clamped to 0.7–1.2) and speaker boost', async () => {
  await handle(post('tts', { voice_id: 'abcdefghij123', text: 'hi', style: .4, speed: 3, boost: false }), deps());
  assert.deepEqual(JSON.parse(lastTo('/text-to-speech/').init.body).voice_settings, { stability: .5, similarity_boost: .75, style: .4, use_speaker_boost: false, speed: 1.2 });
});
test('sts passes style and speaker boost from the form', async () => {
  const f = new FormData(); f.set('voice_id', 'abcdefghij123'); f.set('audio', new Blob([new Uint8Array(20)])); f.set('style', '0.3'); f.set('boost', 'false');
  await handle(post('sts', f), deps());
  const vs = JSON.parse(lastTo('/speech-to-speech/').init.body.get('voice_settings')); assert.equal(vs.style, .3); assert.equal(vs.use_speaker_boost, false);
});
test('expressive tags use eleven_v3 with tags kept, pauses as ellipses and stability snapped', async () => {
  await handle(post('tts', { voice_id: 'abcdefghij123', text: '[excited] Hello! [pause 1s] [laughs] Bye', stability: .7 }), deps());
  const sent = JSON.parse(lastTo('/text-to-speech/').init.body);
  assert.equal(sent.model_id, 'eleven_v3'); assert.equal(sent.text, '[excited] Hello! … … [laughs] Bye'); assert.deepEqual(sent.voice_settings, { stability: .5, similarity_boost: .75 });
});
test('pause-only text stays on multilingual_v2 with break tags', async () => {
  await handle(post('tts', { voice_id: 'abcdefghij123', text: 'One [pause 0.5s] two [pause 9s] three' }), deps());
  const sent = JSON.parse(lastTo('/text-to-speech/').init.body);
  assert.equal(sent.model_id, 'eleven_multilingual_v2'); assert.equal(sent.text, 'One <break time="0.5s" /> two <break time="3s" /> three');
});
test('falls back to multilingual_v2 without tags when eleven_v3 rejects the request', async () => {
  const seen = [];
  const d = { ...deps(), fetch: async (u, init = {}) => {
    if (String(u).endsWith('/auth/v1/user')) return new Response('{}');
    if (String(u).includes('/rest/')) return new Response('[{"id":1}]');
    if (String(u).includes('/text-to-speech/')) { const b = JSON.parse(init.body); seen.push(b); return b.model_id === 'eleven_v3' ? new Response('{"detail":"bad model"}', { status: 400 }) : new Response(new Uint8Array([1])); }
    return new Response('{}');
  } };
  const r = await handle(post('tts', { voice_id: 'abcdefghij123', text: '[whispers] secret [pause 1s] done' }), d);
  assert.equal(r.status, 200); assert.deepEqual(seen.map(x => x.model_id), ['eleven_v3', 'eleven_multilingual_v2']);
  assert.equal(seen[1].text, 'secret <break time="1s" /> done');
});

const histDeps = (over = {}) => ({ ...deps(), serviceKey: 'svc', ...over });
test('generated audio is deleted from ElevenLabs history (by header id) and saved to our history', async () => {
  calls.length = 0;
  const d = histDeps({ fetch: async (u, init = {}) => {
    calls.push({ url: String(u), init });
    if (String(u).endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: 'u1' }));
    if (String(u).includes('/rest/v1/voices')) return new Response('[{"id":1}]');
    if (String(u).includes('/text-to-speech/')) return new Response(new Uint8Array([9, 9, 9]), { headers: { 'history-item-id': 'HIST123' } });
    return new Response('{}', { status: init.method === 'POST' && String(u).includes('/rest/') ? 201 : 200 });
  } });
  const r = await handle(post('tts', { voice_id: 'abcdefghij123', text: 'hello' }), d);
  assert.equal(r.status, 200); assert.deepEqual([...new Uint8Array(await r.arrayBuffer())], [9, 9, 9]);
  const del = calls.find(c => c.init.method === 'DELETE'); assert.ok(del.url.endsWith('/v1/history/HIST123'));
  const up = lastTo('/storage/v1/object/voice-audio/u1/history/'); assert.equal(up.init.headers.authorization, 'Bearer svc');
  const row = JSON.parse(lastTo('/rest/v1/generation_history').init.body);
  assert.equal(row.user_id, 'u1'); assert.equal(row.kind, 'tts'); assert.equal(row.model, 'eleven_multilingual_v2'); assert.equal(row.text, 'hello'); assert.equal(row.bytes, 3);
  assert.equal(r.headers.get('x-history-id'), row.id);
});
test('without a history id header, recent items for the voice are found and deleted', async () => {
  calls.length = 0; const now = Math.floor(Date.now() / 1000);
  const d = histDeps({ fetch: async (u, init = {}) => {
    calls.push({ url: String(u), init });
    if (String(u).endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: 'u1' }));
    if (String(u).includes('/rest/v1/voices')) return new Response('[{"id":1}]');
    if (String(u).includes('/speech-to-speech/')) return new Response(new Uint8Array([1]));
    if (String(u).includes('/v1/history?')) return new Response(JSON.stringify({ history: [{ history_item_id: 'NEW1', date_unix: now }, { history_item_id: 'OLD1', date_unix: now - 3600 }] }));
    return new Response('{}', { status: 200 });
  } });
  const f = new FormData(); f.set('voice_id', 'abcdefghij123'); f.set('audio', new Blob([new Uint8Array(20)]));
  assert.equal((await handle(post('sts', f), d)).status, 200);
  const deleted = calls.filter(c => c.init.method === 'DELETE').map(c => c.url.split('/').pop());
  assert.deepEqual(deleted, ['NEW1']);
  assert.equal(JSON.parse(lastTo('/rest/v1/generation_history').init.body).kind, 'sts');
});
test('history problems never block the audio', async () => {
  const d = histDeps({ fetch: async (u, init = {}) => {
    if (String(u).endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: 'u1' }));
    if (String(u).includes('/rest/v1/voices')) return new Response('[{"id":1}]');
    if (String(u).includes('/text-to-speech/')) return new Response(new Uint8Array([5]));
    return new Response('boom', { status: 500 });
  } });
  const r = await handle(post('tts', { voice_id: 'abcdefghij123', text: 'hi' }), d);
  assert.equal(r.status, 200); assert.equal(r.headers.get('x-history-id'), null);
});
test('if our copy cannot be saved, the ElevenLabs history item is kept', async () => {
  calls.length = 0;
  const d = histDeps({ fetch: async (u, init = {}) => {
    calls.push({ url: String(u), init });
    if (String(u).endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: 'u1' }));
    if (String(u).includes('/rest/v1/voices')) return new Response('[{"id":1}]');
    if (String(u).includes('/text-to-speech/')) return new Response(new Uint8Array([5]), { headers: { 'history-item-id': 'KEEP1' } });
    if (String(u).includes('generation_history')) return new Response('relation does not exist', { status: 404 });
    return new Response('{}', { status: 200 });
  } });
  assert.equal((await handle(post('tts', { voice_id: 'abcdefghij123', text: 'hi' }), d)).status, 200);
  assert.equal(calls.filter(c => c.init.method === 'DELETE').length, 0);
});
test('failed generations are not saved to history', async () => {
  calls.length = 0;
  const d = histDeps({ fetch: async (u, init = {}) => {
    calls.push({ url: String(u), init });
    if (String(u).endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: 'u1' }));
    if (String(u).includes('/rest/v1/voices')) return new Response('[{"id":1}]');
    return new Response('{"detail":{"message":"quota"}}', { status: 401 });
  } });
  assert.equal((await handle(post('tts', { voice_id: 'abcdefghij123', text: 'hi' }), d)).status, 401);
  assert.equal(calls.filter(c => c.url.includes('/storage/') || c.url.includes('generation_history')).length, 0);
});

const HID = '11111111-2222-3333-4444-555555555555';
const historyStore = owner => async (u, init = {}) => {
  calls.push({ url: String(u), init });
  if (String(u).endsWith('/auth/v1/user')) return new Response(JSON.stringify({ id: 'u1' }));
  if (String(u).includes('/rest/v1/generation_history') && (init.method ?? 'GET') === 'GET')
    return new Response(JSON.stringify(String(u).includes(`user_id=eq.${owner}`) ? [{ audio_path: `${owner}/history/${HID}.mp3` }] : []));
  return new Response('{}', { status: 200 });
};
test('history-delete removes the caller\'s own audio file and row', async () => {
  calls.length = 0;
  const r = await handle(post('history-delete', { id: HID }), histDeps({ fetch: historyStore('u1') }));
  assert.equal(r.status, 200);
  const file = calls.find(c => c.url.endsWith('/storage/v1/object/voice-audio') && c.init.method === 'DELETE');
  assert.deepEqual(JSON.parse(file.init.body), { prefixes: [`u1/history/${HID}.mp3`] });
  const row = calls.find(c => c.url.includes('/rest/v1/generation_history') && c.init.method === 'DELETE');
  assert.ok(row.url.includes(`id=eq.${HID}`) && row.url.includes('user_id=eq.u1'));
});
test('history-delete refuses items that belong to someone else', async () => {
  calls.length = 0;
  const r = await handle(post('history-delete', { id: HID }), histDeps({ fetch: historyStore('someone-else') }));
  assert.equal(r.status, 404); assert.equal(calls.filter(c => c.init.method === 'DELETE').length, 0);
});
test('history-delete rejects malformed ids', async () => {
  assert.equal((await handle(post('history-delete', { id: '../../x' }), histDeps({ fetch: historyStore('u1') }))).status, 404);
});

test('usage reports the plan, characters used, limit and reset time', async () => {
  const r = await handle(post('usage', {}), deps()); assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { tier: 'starter', used: 3760, limit: 10000, resetUnix: 1793750400 });
});
test('usage requires sign-in', async () => assert.equal((await handle(post('usage', {}, false), deps())).status, 401));
test('usage reports a clear error when ElevenLabs is unreachable', async () => {
  const d = { ...deps(), fetch: async u => String(u).endsWith('/auth/v1/user') ? new Response('{"id":"u1"}') : new Response('nope', { status: 500 }) };
  const r = await handle(post('usage', {}), d); assert.equal(r.status, 502); assert.equal((await r.json()).error, 'usage unavailable');
});
