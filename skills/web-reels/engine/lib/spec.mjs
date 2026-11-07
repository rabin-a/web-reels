// Reel spec: lines.json (what is said, and the facts behind it) + reel.json (capture steps, audio plan, captions,
// camera shots, end card, cover). Times and boxes in reel.json are small expressions resolved here against the
// voice timeline (cues.json) and the capture manifest. Full reference: reference/spec.md.
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readJSON, exists, fail } from "./util.mjs";

export const FORMATS = { "9x16": [1080, 1920], "4x5": [1080, 1350], "1x1": [1080, 1080], "16x9": [1920, 1080] };
export const LOOKS = { "": "primary", primary: "primary", accent: "accent", ink: "ink", light: "light" };
const ID = /^[A-Za-z_][A-Za-z0-9_]*$/;
const NUM = /^[+-]?\d*\.?\d+$/;
const TIME = /^(?:tap:([A-Za-z0-9_]+)|([A-Za-z_][A-Za-z0-9_]*)(?:\.(s|e|w(-?\d+)))?)([+-]\d*\.?\d+)?$/;
const REF = /^(?:@([A-Za-z_]\w*)|([A-Za-z_]\w*)\.([A-Za-z_]\w*))$/;
const YEXPR = /^(@[A-Za-z_]\w*|[A-Za-z_]\w*\.[A-Za-z_]\w*)(?::(top|bottom|center))?([+-]\d*\.?\d+)?$/;

export function loadLines(dir) {
  const raw = readJSON(path.join(dir, "lines.json"), "lines.json");
  const doc = Array.isArray(raw) ? { lines: raw } : raw;
  const name = path.basename(dir), errs = [], seen = new Set();
  if (!Array.isArray(doc.lines) || !doc.lines.length) fail(`${name}/lines.json needs a non-empty "lines" list`);
  doc.lines.forEach((l, i) => {
    if (!ID.test(l.id || "")) errs.push(`lines[${i}].id must be a short id of letters, digits or _ (got ${JSON.stringify(l.id)})`);
    if (["tap", "total"].includes(l.id)) errs.push(`lines[${i}].id "${l.id}" is reserved`);
    if (seen.has(l.id)) errs.push(`lines[${i}].id "${l.id}" is used twice`);
    seen.add(l.id);
    if (typeof l.text !== "string" || !l.text.trim()) errs.push(`lines[${i}] (${l.id}) needs "text": the words as they should read on screen`);
    if (l.say != null && typeof l.say !== "string") errs.push(`lines[${i}] (${l.id}) "say" must be a string (what the voice reads, e.g. numbers spelled out)`);
    if (l.claims != null && !Array.isArray(l.claims)) errs.push(`lines[${i}] (${l.id}) "claims" must be a list of fact ids from facts.json`);
  });
  if (errs.length) fail(`${name}/lines.json:\n  - ${errs.join("\n  - ")}`);
  return { lines: doc.lines, allow_numbers: (doc.allow_numbers || []).map(String), byId: Object.fromEntries(doc.lines.map((l) => [l.id, l])) };
}

export function loadSpec(dir) {
  const spec = readJSON(path.join(dir, "reel.json"), "reel.json");
  const name = path.basename(dir), errs = [];
  const lines = loadLines(dir);
  if (!Array.isArray(spec.capture) || !spec.capture.length) errs.push(`"capture" must list the capture steps ({goto}, {tap}, {shot})`);
  for (const [i, s] of (spec.capture || []).entries()) {
    // "wait" (ms) may stand alone or ride along with goto/tap as the pause afterwards.
    const kinds = ["goto", "tap", "shot", "hide", "scroll"].filter((k) => s[k] != null);
    if (kinds.length > 1 || (!kinds.length && s.wait == null)) errs.push(`capture[${i}] must have exactly one of goto/tap/shot/hide/scroll, or only wait (got ${JSON.stringify(s)})`);
    if (s.type || s.fill || s.press || s.submit) errs.push(`capture[${i}]: typing, filling or submitting is not allowed; taps and scrolling only`);
    if (s.shot != null && !ID.test(s.shot)) errs.push(`capture[${i}].shot must be a short name like "s0" (got ${JSON.stringify(s.shot)})`);
    for (const k of Object.keys(s.boxes || {})) if (!ID.test(k)) errs.push(`capture[${i}].boxes key ${JSON.stringify(k)} must be letters, digits or _`);
  }
  const plan = audioPlan(spec, lines);
  for (const p of plan) if (!lines.byId[p.id]) errs.push(`audio.plan line "${p.id}" is not in lines.json`);
  for (const h of spec.audio?.hits || []) if (!lines.byId[h]) errs.push(`audio.hits line "${h}" is not in lines.json`);
  for (const [k, v] of Object.entries(spec.audio?.taps || {})) if (!Array.isArray(v) || !lines.byId[v[0]] || !Number.isInteger(v[1])) errs.push(`audio.taps.${k} must be ["<line id>", <word index; -1 = last>]`);
  if (!Array.isArray(spec.captions) || !spec.captions.length) errs.push(`"captions" must list caption groups`);
  if (!Array.isArray(spec.shots) || !spec.shots.length) errs.push(`"shots" must list camera shots over the captures`);
  if (!spec.end || spec.end.from == null) errs.push(`"end.from" is required: when the end card appears`);
  if (!spec.cover || !Array.isArray(spec.cover.lines)) errs.push(`"cover.lines" is required: the caption lines on the cover image`);
  if (errs.length) fail(`${name}/reel.json:\n  - ${errs.join("\n  - ")}\nSee reference/spec.md.`);
  return { spec, lines, plan };
}

// [["h", gap, tempo], ...] or [{id, gap, tempo}]; default: every line in order, 0.12 s apart, normal speed.
export function audioPlan(spec, lines) {
  const raw = spec.audio?.plan;
  if (!raw) return lines.lines.map((l, i) => ({ id: l.id, gap: i ? 0.12 : 0, tempo: 1 }));
  return raw.map((p) => (Array.isArray(p) ? { id: p[0], gap: p[1] ?? 0.12, tempo: p[2] ?? 1 } : { gap: 0.12, tempo: 1, ...p }));
}

// Box helpers, also handed to an optional reel.js hook.
export const pad = (b, p = 6) => { const [px, py] = Array.isArray(p) ? p : [p, p]; return { x: b.x - px, y: b.y - py, w: b.w + 2 * px, h: b.h + 2 * py }; };
export const join = (...bs) => {
  const x = Math.min(...bs.map((b) => b.x)), y = Math.min(...bs.map((b) => b.y));
  return { x, y, w: Math.max(...bs.map((b) => b.x + b.w)) - x, h: Math.max(...bs.map((b) => b.y + b.h)) - y };
};
export const clip = (b, right = 390, left = 0) => { const x = Math.max(b.x, left); return { ...b, x, w: Math.min(b.x + b.w, right) - x }; };
export const cy = (b) => b.y + b.h / 2;

// Turns reel.json into plain numbers for the scene, using cues.json (voice timeline) and capture/manifest.json.
export async function resolveSpec(dir, brand, { root, cues, man, placeholder = false } = {}) {
  root = root || path.dirname(path.dirname(dir));
  const { spec, lines } = loadSpec(dir);
  const name = path.basename(dir);
  cues = cues || readJSON(path.join(dir, "cues.json"), `cues.json (run the audio step first)`);
  man = man || readJSON(path.join(dir, "capture", "manifest.json"), `capture/manifest.json (run the capture step first)`);
  const L = cues.lines, T = cues.taps || {};
  const where = (f) => `${name}/reel.json ${f}`;

  const time = (e, f) => {
    if (typeof e === "number") return e;
    if (typeof e !== "string") fail(`${where(f)}: expected a time like "q", "q.e", "q.w3", "tap:car" or 2.5 (got ${JSON.stringify(e)})`);
    const s = e.replace(/\s+/g, "");
    if (NUM.test(s)) return +s;
    const m = s.match(TIME);
    if (!m) fail(`${where(f)}: cannot read time ${JSON.stringify(e)}. Use <line>[.s|.e|.wN][±sec] or tap:<name>[±sec].`);
    const off = m[5] ? +m[5] : 0;
    if (m[1]) {
      if (T[m[1]] == null) fail(`${where(f)}: no tap "${m[1]}" in audio.taps (have: ${Object.keys(T).join(", ") || "none"})`);
      return T[m[1]] + off;
    }
    const c = L[m[2]];
    if (!c) fail(`${where(f)}: line "${m[2]}" is not on the voice timeline (audio.plan). Lines: ${Object.keys(L).join(", ")}`);
    if (!m[3] || m[3] === "s") return c.s + off;
    if (m[3] === "e") return c.e + off;
    const i = +m[4], k = i < 0 ? c.w.length + i : i;
    if (k < 0 || k >= c.w.length) fail(`${where(f)}: line "${m[2]}" has ${c.w.length} timed words, so w${i} is out of range`);
    return c.w[k] + off;
  };

  const derived = spec.boxes || {}, done = {}, busy = new Set();
  const ref = (r, f) => {
    const m = String(r).match(REF);
    if (!m) fail(`${where(f)}: box reference ${JSON.stringify(r)} must be "<shot>.<box>" or "@<name>"`);
    if (m[1]) {
      if (done[m[1]]) return done[m[1]];
      if (!derived[m[1]]) fail(`${where(f)}: no box "@${m[1]}" in "boxes" (have: ${Object.keys(derived).join(", ") || "none"})`);
      if (busy.has(m[1])) fail(`${where(f)}: box "@${m[1]}" refers to itself`);
      busy.add(m[1]);
      return (done[m[1]] = box(derived[m[1]], `boxes.${m[1]}`));
    }
    const shot = man[m[2]];
    if (!shot) fail(`${where(f)}: no capture "${m[2]}" (captures: ${Object.keys(man).filter((k) => !k.startsWith("_")).join(", ")})`);
    const b = shot.boxes?.[m[3]];
    if (!b) fail(`${where(f)}: capture "${m[2]}" has no box "${m[3]}" (boxes: ${Object.keys(shot.boxes || {}).join(", ")})`);
    return b;
  };
  const box = (e, f) => {
    if (e == null) return null;
    if (typeof e === "string") return ref(e, f);
    if (typeof e !== "object") fail(`${where(f)}: a box must be "<shot>.<box>", "@name" or an object`);
    let b;
    if (e.of != null) b = Array.isArray(e.of) ? join(...e.of.map((r, i) => ref(r, `${f}.of[${i}]`))) : ref(e.of, `${f}.of`);
    else {
      for (const k of ["x", "y", "w", "h"]) if (typeof e[k] !== "number") fail(`${where(f)}: a literal box needs numeric x, y, w, h (or use "of")`);
      b = { x: e.x, y: e.y, w: e.w, h: e.h };
    }
    b = { ...b };
    if (e.pad != null) b = pad(b, e.pad);
    b.x += e.dx || 0; b.y += e.dy || 0; b.w += e.dw || 0; b.h += e.dh || 0;
    if (e.of != null) for (const k of ["x", "y", "w", "h"]) if (typeof e[k] === "number") b[k] = e[k];
    if (e.max_right != null) b = clip(b, e.max_right);
    return b;
  };
  const ypos = (e, f) => {
    if (typeof e === "number") return e;
    if (e && typeof e === "object" && Array.isArray(e.mid)) return (ypos(e.mid[0], f) + ypos(e.mid[1], f)) / 2;
    if (e && typeof e === "object") return cy(box(e, f));
    const s = String(e).replace(/\s+/g, "");
    if (NUM.test(s)) return +s;
    const m = s.match(YEXPR);
    if (!m) fail(`${where(f)}: cannot read page position ${JSON.stringify(e)}. Use a number, "<shot>.<box>[:top|:bottom][±px]", "@name" or {"mid": [a, b]}`);
    const b = ref(m[1], f), off = m[3] ? +m[3] : 0;
    return (m[2] === "top" ? b.y : m[2] === "bottom" ? b.y + b.h : cy(b)) + off;
  };

  // End card first: caption groups default to ending when it starts.
  const E = spec.end;
  const endFrom = time(E.from, "end.from");
  const brandNote = (E.note ?? brand.disclaimers.short) || "";
  const ai = brand.disclaimers.ai_label;
  const endNote = !placeholder && E.note == null && ai && !brandNote.toLowerCase().includes(ai.toLowerCase()) ? `${brandNote} ${ai}.`.trim() : brandNote;
  const end = {
    from: endFrom, urlAt: E.url_at != null ? time(E.url_at, "end.url_at") : endFrom + 0.3, url: E.url ?? brand.domain,
    tag: E.tag === undefined ? brand.end_card.tagline : E.tag, tagAt: E.tag_at != null ? time(E.tag_at, "end.tag_at") : null,
    teaser: E.teaser ? { kicker: E.teaser.kicker || "", text: E.teaser.text || "", at: E.teaser.at != null ? time(E.teaser.at, "end.teaser.at") : endFrom + 0.8 } : null,
    note: endNote, photo: !!E.photo,
  };

  const line = (l, g, f) => {
    const o = Array.isArray(l) ? { text: l[0], at: l[1], look: l[2], size: l[3] } : l;
    if (typeof o.text !== "string") fail(`${where(f)}: caption line needs text`);
    const look = LOOKS[o.look ?? ""];
    if (!look) fail(`${where(f)}: look ${JSON.stringify(o.look)} must be one of primary, accent, ink, light`);
    return { text: o.text, at: o.at == null || o.at === -1 ? g.from : Math.max(time(o.at, `${f}.at`), g.from), look, size: o.size || null };
  };
  const groups = spec.captions.map((g) => ({ ...g }));
  const captions = [];
  groups.forEach((g, i) => {
    const f = `captions[${i}]`;
    const from = g.from != null ? time(g.from, `${f}.from`) : i ? captions[i - 1].to : 0;
    const out = { from, to: 0, place: g.place || (g.hook ? "hook" : g.mid ? "middle" : "caption"), lines: [] };
    if (!["caption", "hook", "middle"].includes(out.place)) fail(`${where(f)}.place must be caption, hook or middle`);
    captions.push(out);
    out.lines = (g.lines || []).map((l, j) => line(l, out, `${f}.lines[${j}]`));
    if (!out.lines.length) fail(`${where(f)}: a caption group needs at least one line`);
  });
  captions.forEach((c, i) => {
    const g = groups[i];
    c.to = g.to != null ? time(g.to, `captions[${i}].to`) : i + 1 < captions.length ? captions[i + 1].from : end.from;
    if (c.to <= c.from) fail(`${where(`captions[${i}]`)}: ends (${c.to.toFixed(2)} s) before it starts (${c.from.toFixed(2)} s)`);
  });

  const ringPad = spec.ring_pad ?? 6;
  const shots = [];
  spec.shots.forEach((s, i) => {
    const f = `shots[${i}]`, prev = shots[i - 1];
    const img = s.img ?? prev?.img;
    if (!img) fail(`${where(f)}: the first shot needs "img" (a capture name)`);
    if (!man[img]) fail(`${where(f)}: no capture "${img}" (captures: ${Object.keys(man).filter((k) => !k.startsWith("_")).join(", ")})`);
    const b = box(s.box, `${f}.box`);
    const y = s.y != null ? ypos(s.y, `${f}.y`) : b ? cy(b) : prev && prev.img === img ? prev.y : 0;
    const z = s.z ?? 1;
    shots.push({
      from: time(s.from, `${f}.from`), img, y, y0: s.y0 != null ? ypos(s.y0, `${f}.y0`) : prev && prev.img === img ? prev.y : y,
      z, z0: s.z0 ?? (prev && prev.img === img ? prev.z : z), cx: s.cx ?? (b ? b.x + b.w / 2 : null), dur: s.dur ?? 0.4,
      box: b ? pad(b, s.ring_pad ?? ringPad) : null, dim: s.dim ?? 0.26, tap: s.tap != null ? time(s.tap, `${f}.tap`) : null,
    });
  });
  shots.sort((a, b) => a.from - b.from);

  const bg = resolveBg(spec.bg, brand, time, dir, root);
  const note = spec.note === false || spec.note == null ? null : {
    text: spec.note.text ?? brand.disclaimers.short, from: time(spec.note.from, "note.from"), to: spec.note.to != null ? time(spec.note.to, "note.to") : end.from,
  };
  const C = spec.cover;
  const cover = { at: C.at != null ? time(C.at, "cover.at") : null, greet: C.greet || null, lines: C.lines.map((l, j) => line(l, { from: 0 }, `cover.lines[${j}]`)) };

  let out = {
    name, bg, decorations: { ...brand.decorations, ...(spec.decorations || {}) },
    phoneFrom: spec.phone_from != null ? time(spec.phone_from, "phone_from") : shots[0].from,
    captions, shots, note, end, cover, total: cues.total,
  };
  // Escape hatch: <reel>/reel.js may export default (spec, helpers) => spec, for layouts the data format cannot say.
  const hook = path.join(dir, "reel.js");
  if (exists(hook)) {
    const mod = await import(pathToFileURL(hook).href + `?t=${fs.statSync(hook).mtimeMs}`);
    const r = await mod.default?.(out, { L, T, M: man, cy, pad, join, clip, brand, time, box, ypos });
    if (r) out = r;
  }
  return { reel: out, cues, man, lines };
}

function resolveBg(bg, brand, time, dir, root) {
  const c = brand.colors;
  const gradient = `radial-gradient(120% 70% at 50% 0%, color-mix(in srgb, ${c.primary} 55%, #000) 0, color-mix(in srgb, ${c.primary_dark} 45%, ${c.ink}) 42%, ${c.ink} 78%)`;
  if (!bg) return { gradient };
  if (bg.gradient) return { gradient: bg.gradient };
  if (!bg.image) fail(`${path.basename(dir)}/reel.json bg: give "gradient" (CSS) or "image" (path relative to the project)`);
  const abs = (p) => { const a = path.resolve(root, p); if (!exists(a)) fail(`${path.basename(dir)}/reel.json bg image not found: ${p} (paths are relative to the project folder)`); return pathToFileURL(a).href; };
  return {
    gradient, image: abs(bg.image), imageWide: bg.image_wide ? abs(bg.image_wide) : null,
    zoomUntil: bg.zoom_until != null ? time(bg.zoom_until, "bg.zoom_until") : null,
    blurFrom: bg.blur_from != null ? time(bg.blur_from, "bg.blur_from") : null,
    tint: (bg.tint || []).map((t, i) => ({ until: t.until != null ? time(t.until, `bg.tint[${i}].until`) : 1e9, css: t.css })),
  };
}
