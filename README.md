# JoloVocals – AI Voice Studio

A dependency-free voice changer web app (HTML/CSS/JS). Open `index.html` or serve the folder, e.g. `python3 -m http.server`.
Microphone recording needs `localhost` or HTTPS.

## Screens
Splash → Login/Sign up → Home → Create Voice (upload/record) → Consent → Processing → Voice Created → Voice Library
→ Text to Voice → Generated Audio → Voice to Voice → Converted Audio (+ Profile).

## What is real vs. demo
- **Voice to Voice**: real. Detects the pitch of your audio (autocorrelation), then shifts it toward the target voice's pitch with a duration-preserving WSOLA pitch shifter. Download as WAV.
- **Create Voice**: records/uploads a sample and stores a *voice profile* (average pitch + the sample) in IndexedDB. This is not neural cloning.
- **Text to Voice**: real neural speech. [Kokoro](https://github.com/hexgrad/kokoro) (82M-parameter open model, via `kokoro-js`) runs in the browser with a male or female base voice, then the app moves its pitch toward your saved voice with the formant-preserving shifter. The Similarity slider sets how far, Stability sets speed. The model (~90 MB) downloads on first use and is cached. Output is exportable WAV. English only: Hindi text, or a chosen device voice, falls back to the browser's SpeechSynthesis (no download). This is not timbre cloning.
- **Auth** is a local demo (stored in this browser only); Google/mobile sign-in are stubs.

For true timbre cloning, put a model API (e.g. an RVC/XTTS service) behind the Create/TTS/Convert steps in `app.js`.

`config.js` may set `KOKORO_URL` to self-host the engine module.
