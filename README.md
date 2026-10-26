# JoloVocals – AI Voice Studio

A dependency-free voice changer web app (HTML/CSS/JS). Open `index.html` or serve the folder, e.g. `python3 -m http.server`.
Microphone recording needs `localhost` or HTTPS.

## Screens
Splash → Login/Sign up → Home → Create Voice (upload/record) → Consent → Processing → Voice Created → Voice Library
→ Text to Voice → Generated Audio → Voice to Voice → Converted Audio (+ Profile).

## What is real vs. demo
- **Voice to Voice**: real. Detects the pitch of your audio (autocorrelation), then shifts it toward the target voice's pitch with a duration-preserving WSOLA pitch shifter. Download as WAV.
- **Create Voice**: records/uploads a sample and stores a *voice profile* (average pitch + the sample) in IndexedDB. This is not neural cloning.
- **Text to Voice**: uses the browser's SpeechSynthesis, with pitch/rate shaped by the voice profile and the Stability/Similarity sliders. Browsers cannot export this audio, so Download is disabled there.
- **Auth** is a local demo (stored in this browser only); Google/mobile sign-in are stubs.

For true cloning and exportable TTS, put a model API (e.g. an RVC/XTTS service) behind the Create/TTS/Convert steps in `app.js`.
