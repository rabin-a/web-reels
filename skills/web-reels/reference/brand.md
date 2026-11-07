# brand.json: the brand pack

`brand/brand.json` in the user's project holds everything business-specific. The engine validates it on every
command and lists all problems at once. Paths are relative to `brand/`. `init-brand` writes a starting file;
`init-brand --url` also saves colour and logo suggestions in `brand/suggestions.json` and `brand/candidates/`.
**Confirm colours, logo, disclaimers and voice with the business.** Suggestions are only a starting point.

```json
{
  "name": "Juniper Lane Laundry",
  "domain": "juniperlane.example",
  "site_url": "https://juniperlane.example/",
  "language": "English",
  "language_code": "en-US",
  "colors": { "primary": "#1F6F5C", "accent": "#F2B544", "ink": "#14161A" },
  "logo": "logo.svg",
  "logo_plate": "#ffffff",
  "fonts": [],
  "font_fallback": ["Helvetica Neue", "Arial", "sans-serif"],
  "voice": { "provider": "elevenlabs", "voice_id": null, "model": "eleven_v3", "stability": 0.5 },
  "music": null,
  "disclaimers": {
    "short": "Prices are a guide; confirm at pickup.",
    "long": "Prices are a guide; the final price is confirmed at pickup. The voice is AI-generated.",
    "ai_label": "AI voice"
  },
  "end_card": { "tagline": "Laundry and dry cleaning in Brookfield" },
  "post": { "time": "18:30", "timezone": "America/New_York", "platforms": ["tiktok", "instagram", "facebook", "youtube"] },
  "limits": { "min_seconds": 15, "max_seconds": 35 },
  "audio": { "lufs": -14, "true_peak": -1.5, "music_db": -5, "duck_db": -17, "sfx": true },
  "decorations": { "sparks": false, "garland": false }
}
```

## Fields

| Field | Required | Meaning |
|-------|----------|---------|
| `name` | yes | Business name (logo alt text, file names via `slug`). |
| `slug` | no | File-name prefix; default is the name lower-cased with dashes. |
| `domain` | yes | Address shown on the end card, e.g. `example.com`. |
| `site_url` | yes | `http(s)` URL; relative `goto` paths in reel.json resolve against it. |
| `language` | yes | Language of the reels (used in prompts and checks), e.g. `English`, `Nepali`. |
| `language_code` | yes | BCP-47 tag, e.g. `en-US`, `ne-NP`, `hi`. Sets the scene's `lang` and the Scribe language. |
| `colors.primary` / `accent` / `ink` | yes | `#hex`. Primary: highlight ring, buttons, gradient. Accent: emphasised caption words. Ink: dark text and background. |
| `colors.primary_dark`, `paper`, `text_on_primary`, `text_on_accent` | no | Defaults: primary darkened 45%, `#FAF9F6`, white, ink. |
| `logo` | yes | SVG or PNG in `brand/`. A wide logo reads best on the end card; square logos are size-capped. |
| `logo_plate` | no | `#hex` card colour behind the logo (default white), or `false` for none (logo must work on dark). |
| `fonts` | no | `[{ "file": "fonts/Brand.woff2", "unicode_range": "U+0000-00FF", "weight": 800 }]`. Use fonts whose licence allows embedding in video. Several entries with different ranges cover several scripts. |
| `font_fallback` | no | Families tried after the brand fonts and the bundled Mukta ExtraBold (Latin and Devanagari, OFL). |
| `voice.voice_id` | for paid voice | ElevenLabs voice ID. `null` until the business picks one; `voice --silent` works without it. |
| `voice.model` | no | Default `eleven_v3` (supports `[tags]` in `say`). |
| `voice.stability` | no | 0–1, default 0.5. |
| `voice.tts_options` | no | Extra fields for the ElevenLabs request, e.g. `{ "seed": 7, "voice_settings": { "similarity_boost": 0.8, "style": 0.3 } }`. |
| `voice.stt_model`, `voice.stt_language` | no | Scribe model (default `scribe_v1`) and language code (default from `language_code`). |
| `music` | no | Path to a music bed you have the rights to (MP3/WAV), or `null` for none. Never ship tracks of unclear licence. |
| `disclaimers.short` | yes | Small print shown on screen and on the end card. |
| `disclaimers.long` | yes | Must appear in every post caption (`check` enforces it). |
| `disclaimers.ai_label` | no | Default `AI voice`. Appended to the end-card note and required in captions. |
| `end_card.tagline` | no | Line under the URL; empty or `null` to hide. |
| `post.time`, `post.timezone`, `post.platforms` | no | Default posting time (`HH:MM`), IANA zone, and platforms for `package`. |
| `limits.min_seconds`, `max_seconds` | no | Reel length window `check` warns about (15–35 s). |
| `audio.lufs`, `true_peak` | no | Loudness target (-14 LUFS, -1.5 dBTP). |
| `audio.music_db`, `duck_db` | no | Music level when alone and under the voice (dB). |
| `audio.sfx` | no | `false` turns off whooshes, taps and the bell. |
| `decorations.sparks`, `garland` | no | Festive overlays; per-reel override in reel.json. |

## Non-Latin scripts

Bundled Mukta covers Latin and Devanagari. For other scripts (Arabic, Bengali, Tamil, CJK…) add an OFL or
otherwise embeddable font to `brand/fonts/` with its licence, list it in `fonts` with the right `unicode_range`,
and check stills for missing glyphs (boxes) and line breaks. Caption width is measured in the browser, so
longer scripts wrap correctly as long as the font loads.

## Keys

`ELEVENLABS_API_KEY` is read from the environment, else from `.env` in the project folder. Never put it in
brand.json or commit `.env` (the project `.gitignore` excludes it). `doctor` reports whether a key is set
without printing it.
