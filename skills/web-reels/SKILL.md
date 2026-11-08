---
name: web-reels
description: Make a series of short promo reels (TikTok, Instagram Reels, YouTube Shorts, Facebook) from real screen captures of a business website. The site is shown in a phone frame with camera zooms, highlight rings and taps on real page elements, bold captions, an AI voice-over with word-timed captions, an optional music bed and an end card teasing the next reel, rendered in 9x16, 4x5, 1x1 and 16x9 with covers. Every on-screen claim is checked against text on the site. Use when the user says "make reels for my website", "promo videos from my site", "TikToks / Shorts / Reels for <business>", "screen-capture promo of <url>", "web reels", or asks for a reel series about a website.
---

# web-reels

Turn a business website into a series of short vertical promo reels built from real captures of that site.
Each reel answers one question a customer has ("What does a shirt cost?") using one or two screens of the site,
and ends by teasing the next reel.

The engine lives next to this file in `engine/`. Call it as:

```bash
node "<this skill's folder>/engine/cli.mjs" <command> ...   # referred to below as: wr <command>
```

Always run it **from the user's project folder** (the folder that holds `brand/brand.json`), never inside this
skill. All generated files go into the project. `wr help` lists every command.

Reference (read when you need it):
- `reference/spec.md`: lines.json and reel.json (captures, timeline, captions, shots, end card, cover)
- `reference/brand.md`: brand.json fields, fonts for other scripts, API keys
- `reference/checks.md`: facts, disclaimers, layout checks, platform AI labels, hear-checking the voice
- `reference/troubleshooting.md`: setup, capture, voice and render problems

## Ground rules (non-negotiable)

- **Never post, schedule or upload anything, and never create accounts.** The output is files for a person to post.
- **On the site: only open pages, tap and scroll.** Never type into, fill or submit forms, log in, or add to cart
  with personal data. The engine blocks submits, but do not try.
- **Every number and promise on screen and in the voice comes from text actually on the site**, recorded in
  `facts.json` with the URL and the exact quote. No superlatives, testimonials or offers the site does not state.
- **Keep the disclaimers**: the short one on screen, the long one and the AI-voice label in every post caption.
- **Paid calls only when asked.** ElevenLabs costs money. Build and review with `voice --silent` first; generate
  the real voice only when the user wants it and a voice ID is chosen. Every paid call is logged in `cost-log.jsonl`.
- Use only music, fonts and logos the business has the rights to. Do not download music.

## Workflow

### 1. Set up

```bash
mkdir -p <project> && cd <project>
wr doctor                                        # node, ffmpeg, python3, browser, playwright-core, API key
npm install --prefix "<skill>/engine"            # once, if doctor says playwright-core is missing
wr init-brand --name "Business Name" --url https://their-site.example
```

`init-brand --url` writes `brand/brand.json`, a placeholder logo, `facts.json`, `.gitignore`, and colour/logo
suggestions from the site in `brand/suggestions.json` and `brand/candidates/`. Fill in brand.json
(`reference/brand.md`): name, domain, language, colours, logo, disclaimers. **Ask the user to confirm** the
colours, logo, disclaimers and, before any paid voice, the ElevenLabs voice ID. Keys go in the environment or the
project's `.env`, never in files you commit.

### 2. Research the site

```bash
wr research https://their-site.example/ --follow 8
```

This saves plain text for each page in `research/pages/` and candidate sentences with numbers or promises in
`research/facts-candidates.json`. Read the pages. Note what a customer would want to know: prices, times,
coverage, steps, guarantees, contact. Copy the facts you will use into `facts.json` with `id`, `claim`, `url` and
the exact `quote`. Mobile layout matters: look at the pages at phone size (a `capture` run gives screenshots).

### 3. Plan the series

```bash
wr init-series --start 2026-01-05 --every 2 --count 6
```

This writes `series/plan.json` and `series/PLAN.md` with posting dates. Fill in one row per reel: the question
(hook), the screens and taps that answer it, the fact ids, and which reel the end card teases. Order the series so
each teaser leads naturally to the next. Show the plan to the user before building many reels.

### 4. Write each reel

```bash
wr new-reel 01-shirt-price
```

Edit `series/01-shirt-price/` (see `reference/spec.md` and `examples/demo-brand/` in the plugin repo):

- `lines.json`: 5–8 short spoken lines, 15–35 s in total: a hook question, the steps on screen, the answer
  with the facts, a call to action with the domain, and the teaser for the next reel. Use `say` for
  pronunciation (numbers as words, names spelled phonetically) and `claims` for the facts behind each line.
- `reel.json`: `capture` steps (goto/tap/shot with named element boxes), the `audio` plan (gaps, tempo, hits,
  taps), caption groups, camera `shots` that ring and zoom on the element the voice is talking about at that
  moment, the end card with the teaser, and the cover.
- `captions.txt`: post text per platform (`## TikTok / Instagram Reels / Facebook Reels`, `## YouTube Shorts`,
  `## Facebook feed`, `## X (x.com)`), with the long disclaimer, the AI label, and where each claim comes from.
  The X post must fit in 280 characters (links count 23), so it carries the short disclaimer and the AI label.

### 5. Build, look and fix

```bash
wr capture 01-shirt-price            # screenshots + boxes  -> capture/
wr voice 01-shirt-price --silent     # free placeholder timings (review build)
wr audio 01-shirt-price              # mix + cues.json
wr stills 01-shirt-price --format 9x16,16x9 --at 2,6,10   # quick frames to check/stills/
wr render 01-shirt-price             # 4 formats -> video/, covers -> covers/
wr check 01-shirt-price              # facts, disclaimers, layout, loudness, contact sheets
# or all at once:  wr all 01-shirt-price --silent
```

After `check`, **Read `check/report.md` and every `check/*-sheet.jpg`** and fix what you see: rings on the wrong
element, captions that do not match the voice, crowded end cards, unreadable covers. Use `stills` to check single
moments quickly. Re-run from the step you changed (lines → voice; reel.json → audio/render; capture steps → capture).

When the user approves the review build and a voice is chosen:

```bash
wr voice 01-shirt-price              # ElevenLabs TTS + Scribe word timings (paid); prints similarity per line
wr all 01-shirt-price                # audio, render, check with the real voice
```

Any take marked `CHECK` (or that sounds wrong) gets a `say` fix and a retake of just that line:
`wr voice 01-shirt-price v --force`. To hear-check the final mix: `wr transcribe series/01-shirt-price/audio/mix.wav`.

### 6. Package

```bash
wr package
```

Copies every reel whose check passed into `ready-to-post/` (dated folders, all formats, covers, captions) with
`SCHEDULE.md`. Next to each video it writes a paste-ready description with the same name (`…-9x16.txt` for
`…-9x16.mp4`: Reels/TikTok text; 16x9: YouTube text; 4x5 and 1x1: Facebook feed text) and one `…-X.txt` post. Placeholder-voice builds are skipped unless `--force`, and are marked "do not post". Tell the
user what is ready, what still needs attention, and how to label the AI voice on each platform
(`reference/checks.md`). Do not post it yourself.

## Report to the user

List the reels made (paths to videos and covers), the facts each one uses, the check verdicts, anything that
needs their decision (voice, colours, music, failed checks) and the money spent (sum `cost-log.jsonl`).
