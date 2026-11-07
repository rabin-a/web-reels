# web-reels

A Claude Code skill that turns any business website into a series of short promo reels for TikTok,
Instagram Reels, YouTube Shorts and Facebook, built from **real screen captures of the site**.

- The site appears in a phone frame, with camera zooms, highlight rings and taps on the real page elements
- Bold captions, plus an AI voice-over (ElevenLabs) with word-timed captions, a synthesised whoosh/tap/bell, an optional music bed and loudness normalisation
- An end card with the logo, the domain and a teaser for the next reel
- Every reel comes in **9x16, 4x5, 1x1 and 16x9**, with a matching cover image for each
- **Fact-checked**: every number on screen has to match a quote saved from the site (`facts.json`), and the disclaimers and AI-voice labels are checked
- Safe by design: it only opens pages, taps and scrolls. It never types, submits forms, logs in or posts anything

## Install

In Claude Code:

```
/plugin marketplace add rbnacharya/web-reels
/plugin install web-reels@web-reels
```

Then ask Claude something like *"Make a reel series for https://my-bakery.example"*.

### Requirements

- Node 18.17+, with `playwright-core` installed in the engine folder: `npm install --prefix <plugin>/skills/web-reels/engine`
- Chrome, Chromium, Edge or Brave. To use another browser, set `CHROME_PATH`
- `ffmpeg` and `ffprobe`
- Python 3 (standard library only), for the audio mix
- Optional: an `ELEVENLABS_API_KEY` for the real voice. Without one you can still build complete review reels with a silent placeholder voice

Run `node <plugin>/skills/web-reels/engine/cli.mjs doctor` to check your setup.

## Commands

Run every command from your project folder, the one that contains `brand/brand.json`:

```bash
WR="node <plugin>/skills/web-reels/engine/cli.mjs"
$WR init-brand --name "Juniper Lane Laundry" --url https://example.com   # brand pack + colour/logo suggestions
$WR research https://example.com/ --follow 8     # page text + fact candidates
$WR init-series --start 2026-01-05 --every 2 --count 6
$WR new-reel 01-shirt-price
$WR all 01-shirt-price --silent                  # capture, placeholder voice, audio, render, check
$WR stills 01-shirt-price --format 9x16 --at 2,6,10
$WR voice 01-shirt-price                         # real voice (paid, logged to cost-log.jsonl)
$WR package                                      # checked reels -> ready-to-post/ + SCHEDULE.md
```

`$WR help` lists every command and option. The workflow Claude follows is in
[`skills/web-reels/SKILL.md`](skills/web-reels/SKILL.md). The file formats are documented in
[`skills/web-reels/reference/`](skills/web-reels/reference/).

## Try the demo

The repo includes a fictional laundry website and a finished reel spec for it:

```bash
node examples/demo-site/serve.mjs &              # http://localhost:8765
mkdir /tmp/demo && cp -r examples/demo-brand/. /tmp/demo && cd /tmp/demo
node <repo>/skills/web-reels/engine/cli.mjs all 01-shirt-price --silent
```

Running it produces `series/01-shirt-price/video/*.mp4` in all four formats, along with covers and `check/` contact sheets.

## Layout

```
.claude-plugin/        plugin.json, marketplace.json
skills/web-reels/
  SKILL.md             the workflow
  reference/           spec, brand, checks, troubleshooting
  engine/              cli.mjs, lib/*.mjs, scene.html, build_audio.py, fonts/ (Mukta, OFL)
  templates/           brand pack, reel and series templates
examples/
  demo-site/           static fictional business site + tiny server
  demo-brand/          brand pack, facts and one reel for the demo site
```

## Notes

- Videos are rendered frame by frame in a headless browser. A 30 s reel in four formats takes a few minutes.
- Music isn't included. Point `audio.music` in `brand.json` at a track you have the rights to.
- The bundled font is Mukta ExtraBold (Latin and Devanagari, SIL OFL 1.1, see `engine/fonts/OFL.txt`). For other scripts, add your own fonts in `brand.json`.
- Posts must carry the platforms' AI-generated-content labels for the voice. See `reference/checks.md`.

## Licence

MIT © 2026 Rabin Acharya. The bundled Mukta fonts are licensed under the SIL Open Font License 1.1.
