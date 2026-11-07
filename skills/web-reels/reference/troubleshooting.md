# Troubleshooting

Start with `node <engine>/cli.mjs doctor`. It checks Node 18.17+, ffmpeg/ffprobe, Python 3, playwright-core,
a browser and whether an ElevenLabs key is set (never printing it).

## Setup

| Problem | Fix |
|---------|-----|
| `playwright-core is not installed` | `npm install --prefix "<engine>"` once (only playwright-core; no browser download). |
| `No Chrome or Chromium found` | Install Chrome/Chromium/Edge, or set `CHROME_PATH=/path/to/chrome`, or download playwright's Chromium once: `node <engine>/node_modules/playwright-core/cli.js install chromium`. |
| `ffmpeg is not installed` | macOS `brew install ffmpeg`; Debian/Ubuntu `sudo apt install ffmpeg`; Windows `winget install ffmpeg`. |
| Python not found | Install Python 3 (standard library only; `python3`, `python` or `py` on PATH). |
| `Refusing to work inside the web-reels skill/plugin folder` | Run commands from the user's project folder (or pass `--project <dir>`). The skill folder is read-only. |

## Capture

| Problem | Fix |
|---------|-----|
| `nothing on <page> matches {...}` | Copy the exact text from `research/pages/*.txt`; use `{"css": ...}` or `"nth"`; add a `wait` before the step for content that loads late. |
| `refusing to tap a form submit button / a text field` | Captures never submit or type. Show the form as it is, or pick an option button instead. |
| `BLOCKED a POST navigation` | A tap tried to submit something; it was stopped. Choose a different step. |
| `Cannot reach <url>` | Check the URL and network; for a local site, start its server first. |
| Cookie banner or chat bubble covers the page | Add `{ "hide": "<css>" }` before the shot. Never hide content a claim relies on. |
| Header repeats or covers content | Sticky bars are made static by default; set `"unstick"` to a CSS selector for other bars, or `false` to keep them. |
| `<shot>.<box> is below the kept part of the page` | Raise `"max_height"` on that shot. |
| Page looks different from a real phone | Some sites serve desktop layouts to unknown agents; try `research` to see what loads, or capture a mobile URL. |
| Site blocks automated browsers | Do not work around it. Ask the business for a staging URL or permission. |

## Voice and audio

| Problem | Fix |
|---------|-----|
| `ELEVENLABS_API_KEY is not set` | Export it, or put `ELEVENLABS_API_KEY=...` in the project's `.env`. For review builds use `voice <reel> --silent`. |
| `"voice.voice_id" is empty` | Pick a voice with the business and set `brand.voice.voice_id`. |
| 401 / quota error | Check the key and credits on the ElevenLabs account. Nothing was charged for a failed call. |
| A word is mispronounced | Put the spoken form in `say` (spell it out, phonetic, numbers as words), then `voice <reel> <id> --force`, `audio`, `render`, `check`. |
| `CHECK similarity 0.6` | Listen to that take; Scribe heard something different. Retake as above. |
| Line too fast or slow | Change its tempo in `audio.plan` (1.0–1.12 sounds natural), then `audio` and `render` (no new voice cost). |
| Music too loud/quiet | `brand.audio.music_db` / `duck_db`; no music file means a voice-and-effects mix. |

## Render and layout

| Problem | Fix |
|---------|-----|
| `runs off the frame` | Shorten the line or lower its `size`; long words need a line of their own. |
| `captions ... overlap` | Fewer lines per group, or split the group in time. |
| `highlight ring ... cut off` | Lower `z`, or set `cx`/`y` on the shot so the box fits. |
| Wrong glyphs or boxes instead of letters | Add a font covering the script to `brand.fonts` with its `unicode_range`. |
| `older than reel.json; render again` | Re-run `render` (and `audio` if lines changed). |
| Render is slow | `--jobs 1` on small machines, `--formats 9x16` while iterating, `stills` for single frames, `--draft` for a quick 15 fps video. |
| `cues.json` missing | Run `audio` (after `voice`). |
