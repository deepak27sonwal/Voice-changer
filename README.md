# JoloVocals – AI Voice Studio

A dependency-free voice changer web app (HTML/CSS/JS). Open `index.html` or serve the folder, e.g. `python3 -m http.server`.
Microphone recording needs `localhost` or HTTPS.

## Screens
Splash → Login/Sign up → Home → Create Voice (upload/record) → Consent → Processing → Voice Created → Voice Library
→ Text to Voice → Generated Audio → Voice to Voice → Converted Audio (+ Profile).

## What is real vs. demo
- **Voice to Voice**: real. Detects the pitch of your audio (autocorrelation), then shifts it toward the target voice's pitch with a duration-preserving WSOLA pitch shifter. Download as WAV.
- **Create Voice**: records/uploads a sample and stores a *voice profile* (average pitch + the sample). With hosted voices on, the sample is also cloned on ElevenLabs (paid ElevenLabs plans only).
- **Text to Voice**: ElevenLabs speech through the `voice-api` function (see below). Voices without their own ElevenLabs voice (presets, local voices) speak through an ElevenLabs voice of the same gender, shaped toward their pitch and effect. Without ElevenLabs, or if it fails, the browser's SpeechSynthesis is used (not exportable).
- **Auth** is a local demo (stored in this browser only); Google/mobile sign-in are stubs.

For true timbre cloning, put a model API (e.g. an RVC/XTTS service) behind the Create/TTS/Convert steps in `app.js`.


## Hosted voice cloning (optional, real timbre cloning)
The in-browser path matches pitch only. For voices that actually sound like the speaker, deploy the `voice-api` Edge Function, which proxies ElevenLabs so the API key stays on the server:

1. Run `supabase/schema.sql` in the Supabase SQL editor (adds the `remote_id` column).
2. `supabase functions deploy voice-api --project-ref <ref>`
3. `supabase secrets set ELEVENLABS_API_KEY=<key> --project-ref <ref>` (instant voice cloning needs an ElevenLabs paid plan).
4. Set `HOSTED_VOICES: true` in `config.js`.

With it on, signed-in users get: real cloning when a voice is saved, Text to Voice in the cloned voice (multilingual, including Hindi, with Stability/Similarity mapped to the provider), and Voice to Voice conversion. Voices without a hosted clone, and any provider error, fall back to the in-browser engines. Samples are sent to ElevenLabs (the consent screen says so) and removed when the voice is deleted. The function only serves voices that belong to the caller (checked through row-level security). Tests: `node --test supabase/functions/voice-api/index.test.mjs`.
