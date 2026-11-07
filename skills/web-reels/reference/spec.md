# Reel spec: lines.json and reel.json

A reel is a folder `series/NN-slug/` in the user's project with three hand-written files:

| File | What it holds |
|------|---------------|
| `lines.json` | What the voice says (and how to pronounce it), and which facts back each line |
| `reel.json` | The site steps to capture, the audio plan, captions, camera shots, end card and cover |
| `captions.txt` | The post text for each platform (see checks.md) |

Everything else in the folder (`capture/`, `audio/`, `cues.json`, `video/`, `covers/`, `check/`) is generated.
A worked example is in `examples/demo-brand/series/01-shirt-price/`.

## lines.json

```json
{
  "allow_numbers": ["2"],
  "lines": [
    { "id": "h", "text": "Shirts piling up again?", "say": "[curious] Shirts piling up again?" },
    { "id": "v", "text": "$2.50 a shirt. Most orders are back in 48 hours.",
      "say": "Two dollars fifty a shirt. Most orders are back in forty-eight hours.",
      "claims": ["shirt-press", "turnaround"] }
  ]
}
```

- `id`: a short name (letters, digits, `_`; not `total`). Times in reel.json refer to it.
- `text`: the words as written. They appear in the word-timed data and are checked against `facts.json`.
- `say` (optional): what the voice reads instead, e.g. numbers spelled out, a phonetic spelling of a name, or
  ElevenLabs v3 audio tags such as `[curious]` and `[excited]`. Leave it out when it would match `text`.
  This text/say split is how you fix mispronunciations without changing what is on screen.
- `claims`: ids from `facts.json`. Every number and promise in `text` needs one. `check` fails a line that has
  a number with no claim, unless the number is in `allow_numbers` (for things like "2 taps" or step numbers).

## reel.json

```json
{
  "title": "What does a shirt cost?",
  "capture": [ ... ],
  "audio": { "plan": [ ... ], "hits": [ ... ], "taps": { ... }, "bell": "x" },
  "captions": [ ... ],
  "shots": [ ... ],
  "note": { "from": "v-0.03", "to": "c-0.1" },
  "end": { "from": "c-0.1", "url_at": "c.w0", "teaser": { "kicker": "Next time", "text": "...", "at": "x" } },
  "cover": { "at": "v.w3", "lines": [["What does a shirt cost", -1, "accent"], ["at Juniper Lane?", -1]] }
}
```

Optional top-level keys: `boxes` (named derived boxes), `bg`, `phone_from`, `ring_pad`, `decorations`.

### capture: what to do on the site

A list of steps, run in order on a 390×844 phone viewport (3× pixel density, iPhone user agent):

| Step | Meaning |
|------|---------|
| `{ "goto": "/prices.html" }` | Open a page. Relative paths resolve against `brand.site_url`. |
| `{ "tap": <locator>, "wait": 500 }` | Tap an element, then wait (ms, default 800). |
| `{ "shot": "s0", "boxes": { "name": <locator> } }` | Full-page screenshot `capture/s0.jpg` and the page boxes of the named elements. |
| `{ "wait": 1000 }` | Pause. |
| `{ "hide": "#cookie-banner" }` | Hide overlays (cookie banners, chat bubbles). Never hide content a claim depends on. |
| `{ "scroll": 600 }` | Scroll to a y position (rarely needed: shots are full-page). |

A locator is one of:

- `{ "text": "Price finder" }` (add `"exact": true` for whole-text match)
- `{ "button": "Shirts" }` (buttons, links and labels containing the text; `"has"` filters further)
- `{ "css": "#result" }` (optionally `"has": "text"`)
- `{ "role": "link", "name": "Prices" }`

Add `"nth": 1` to pick a later match. Copy the text exactly as on the page (`research/pages/*.txt`).

Shot options: `"unstick": false` keeps sticky headers (by default `header, nav` become static so they do not
repeat in a full-page shot; give a CSS selector to unstick other bars), `"max_height": 4500` caps very tall pages.

**Safety:** capture only taps and scrolls. Form submits and non-GET navigations are blocked, and taps on text
fields or submit buttons are refused. Never log in, never type, never create accounts.

`capture/manifest.json` records each shot's URL, time and boxes (`{x, y, w, h}` in CSS pixels of the 390-wide page).

### audio: the voice timeline

```json
"audio": {
  "plan": [["h", 0, 1.05], ["q", 0.1, 1.08], ["t", 0.14, 1.05], ["v", 0.14, 1.05], ["c", 0.2, 1.0], ["x", 0.2, 1.0]],
  "hits": ["q", "v"],
  "taps": { "shirts": ["t", 5], "press": ["t", -1] },
  "bell": "x"
}
```

- `plan`: `[line id, gap before (s), tempo]`, in order. Tempo 1.05 = 5% faster (pitch kept). Every line in
  lines.json must be in the plan exactly once.
- `hits`: lines that start with a whoosh.
- `taps`: named tap clicks at a word: `[line, word index]` (negative counts from the end). The name becomes a
  time (`tap:shirts`) for shots and captions.
- `bell`: a soft bell at the start of this line (usually the teaser).

`audio` writes `cues.json`: each line's start `s`, end `e` and word times `w`, tap times and the total length.

### Times

Anywhere reel.json wants a time you can write a number of seconds or an expression:

| Expression | Meaning |
|------------|---------|
| `"q"` or `"q.s"` | Line q starts |
| `"q.e"` | Line q ends |
| `"q.w3"` | Word 3 of line q (0-based); `"q.w-1"` is the last word |
| `"tap:shirts"` | The tap named in audio.taps |
| `"q-0.03"`, `"tap:shirts+0.2"` | Any of the above plus/minus seconds |

Errors name the file, field and the valid choices.

### Boxes

Where a box is wanted (shot `box`): `"s0.shirts"` (capture s0, box shirts), `"@name"` (from top-level `boxes`),
or an object: `{ "of": ["s2.price", "s2.note"], "pad": [8, 4] }` (the union of several boxes, padded) or a literal
`{ "x": 16, "y": 300, "w": 358, "h": 80 }`.

### captions: groups of lines over time

```json
{ "from": "q-0.03", "lines": [["What does a shirt cost", -1], ["washed & pressed?", "q.w7", "accent"]] }
```

- A group shows from `from` until the next group starts (or `to`, or the end card).
- `place`: `"caption"` (default, above the phone), `"hook"` (big, before the phone appears) or `"middle"`.
- A line is `[text, at, look, size]` or `{ "text", "at", "look", "size" }`:
  `at` = when it pops in (`-1` = with the group); `look` = `primary` (default), `accent`, `ink` or `light`;
  `size` = scale factor (e.g. 1.3 for a big price, 0.6 for a small label).
- Keep lines short (about 28 characters); `check` flags lines that run off the frame or overlap.

### shots: the camera on the phone screen

```json
{ "from": "tap:shirts-0.45", "img": "s0", "box": "s0.shirts", "z": 1.25, "dur": 0.42, "tap": "tap:shirts" }
```

| Key | Meaning (default) |
|-----|-------------------|
| `from` | When this shot starts |
| `img` | Capture to show (previous shot's) |
| `box` | Highlight ring around this box; the camera centres on it |
| `y` | Page y to centre: a number, `"s0.box"`, `"s0.box:top"`, `"s0.box:bottom+40"` (box centre, or previous) |
| `cx` | Page x to centre when zoomed (box centre, or 195) |
| `z`, `z0` | Zoom at the end and the start of the move (1, previous) — capped so the ring fits the screen |
| `dur` | Move duration in seconds (0.4) |
| `dim` | Darken the page outside the ring, 0–1 (0.26) |
| `tap` | Draw a tap ripple at the box at this time |
| `ring_pad` | Ring padding in px (6), also settable for the whole reel |

The phone appears at the first shot (`phone_from` to change). Show each fact on the real page: zoom on the price,
ring the promise, tap the real buttons in the order a visitor would.

### note, end, cover

- `note`: the small disclaimer line over the video, `{ "from", "to", "text" }`; text defaults to
  `brand.disclaimers.short`. Do not remove it; `"note": false` is only for reels with no claims.
- `end`: the end card from `from`: logo plate, `url` (default `brand.domain`) at `url_at`, `tag`
  (default `brand.end_card.tagline`, `null` hides it) at `tag_at`, `teaser` `{ kicker, text, at }` for the next reel,
  `note` (defaults to the short disclaimer plus the AI-voice label), `photo: true` to keep the background photo.
- `cover`: `at` = a time whose frame becomes the cover background; `lines` = caption lines drawn big over it;
  optional `greet`. Without `at`, the cover is the background alone.

### bg and decorations (optional)

- `"bg": { "gradient": "<CSS>" }` or `{ "image": "brand/photo.jpg", "image_wide": "...", "zoom_until": "q",
  "blur_from": "q", "tint": [{ "until": "v", "css": "rgba(0,0,0,.4)" }] }` (paths relative to the project).
  Default: a radial gradient from the brand colours.
- `"decorations": { "sparks": true, "garland": true }` for festive reels (floating sparks, a marigold-style
  garland), overriding `brand.decorations`.

### Escape hatch: reel.js

For layouts reel.json cannot express, add `reel.js` next to it:

```js
export default (reel, { L, T, M, cy, pad, join, clip, brand, time, box, ypos }) => {
  reel.shots.push({ ...reel.shots.at(-1), from: time("v.w5"), z: 1.4 });
  return reel;
};
```

It receives the resolved scene data (numbers only) and the helpers; return the changed object. Keep it rare.
