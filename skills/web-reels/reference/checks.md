# Checks before a reel is ready

`node <engine>/cli.mjs check <reel>` writes `<reel>/check/report.md`, `check/status.json` and one contact sheet
per format (`check/<fmt>-sheet.jpg`, 12 frames). It exits non-zero on errors. `package` only takes reels whose
last check passed (and not placeholder-voice builds unless `--force`).

The automatic checks catch most mistakes, but **look at every contact sheet yourself** (Read the JPGs) before
calling a reel done.

## Facts: every on-screen claim comes from the site

`facts.json` (project root) is the claim register:

```json
{ "facts": [
  { "id": "shirt-press", "claim": "Shirt $2.50 washed and pressed",
    "url": "https://juniperlane.example/prices.html", "quote": "Shirt $2.50 wash & press" }
] }
```

- `quote` must be text actually on the page, copied from `research/pages/*.txt`. `check` normalises whitespace,
  quotes and dashes, then requires the quote in the saved page text. Run `research <url>` for every page a fact
  comes from. If the page changes, research it again and fix the facts.
- Each line's `claims` lists the facts behind it. Every number in a line's `text`, and in captions, the cover
  and the end card, must appear in the quotes of the claimed facts (or in `allow_numbers` for non-claims such as
  "2 taps"). Numbers are compared after removing thousands separators and normalising non-Latin digits.
- Wording can be shortened, but do not change meaning: no "cheapest", "best", "guaranteed", "free" or "instant"
  unless the page says so. No invented testimonials, ratings or offers.
- The screen must show the fact: a shot should ring or zoom on the element where the claim lives.

| Check | Level |
|-------|-------|
| Claimed fact missing from facts.json | error |
| Number in a line/caption/cover/end card not in any claimed quote | error |
| Fact without url and quote | error |
| Quote not found in saved page text | error |
| No saved page text for a fact's URL | warning |

## Disclaimers and labels

| Check | Level |
|-------|-------|
| Short disclaimer not on screen (note or end card) | error |
| `captions.txt` missing the long disclaimer or the AI label | error |
| X post (`## X` section) over 280 characters, or missing the short disclaimer or the AI label | error |
| No `## X` section in `captions.txt` | warning |

Platform labels for AI voice (do this when posting; the reel cannot set them):

- **TikTok**: turn on "AI-generated content" in the post settings.
- **Instagram / Facebook**: add the "AI info" label when Meta asks or offers it.
- **X**: the AI label is in the post text; add X's AI/synthetic media label if the upload screen offers one.
- **YouTube Shorts**: answer "Yes" to "Altered or synthetic content" only if the voice could pass for a real
  person saying something they did not; either way keep "AI voice" in the description.

## Layout (in every format)

Sampled at each caption group, the end card and the cover:

| Check | Level |
|-------|-------|
| Caption, URL, tag, teaser or note runs off the frame | error |
| Two caption lines overlap | error |
| Highlight ring cut off by the phone screen | error |
| Text smaller than 1.2% of the frame height (23 px in 9x16) | warning |
| 9x16 caption in the bottom 20% (platform buttons and post text) | warning |

## Audio and files

| Check | Level |
|-------|-------|
| Placeholder (silent) voice | warning, verdict "REVIEW BUILD" |
| Length outside `brand.limits` | warning |
| Mix loudness more than 1 LU off target, or peaks over the limit | warning |
| Video has the wrong size or no audio track | error |
| Video length differs from the timeline, or older than reel.json/lines.json/cues.json | warning (render again) |
| Missing video or cover for a format | warning |

## What to look at by eye

On every contact sheet and a few stills (`stills <reel> --format 9x16,16x9 --at ...`):

- The ring sits on the element the voice is talking about, at the moment it says it.
- The page shown is the right page (manifest URLs) and nothing personal or third-party is on screen.
- Captions are readable, short, and say the same as the voice.
- The end card shows logo, domain, teaser and disclaimer without crowding.
- The cover reads at thumbnail size.

## Hear-check the voice

TTS can misread names, prices and abbreviations. After `voice`, each line is transcribed with Scribe and the
similarity is printed; `CHECK` marks a take below 0.8. Listen to those, and to the final mix
(`transcribe <reel>/audio/mix.wav` gives a transcript). To fix a word, add or change `say` in lines.json
(spell it out or phonetically) and re-run `voice <reel> <id> --force` for that line only, then `audio`, `render`
and `check`. Each paid call is logged in `cost-log.jsonl`.
