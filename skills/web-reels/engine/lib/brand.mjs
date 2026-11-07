// Loads and validates <project>/brand/brand.json. The full field list is in reference/brand.md.
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readJSON, exists, fail } from "./util.mjs";
import { ENGINE } from "./project.mjs";

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const BCP47 = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;
const RANGE = /^(?:\s*U\+[0-9A-Fa-f?]{1,6}(?:-[0-9A-Fa-f]{1,6})?\s*,?)+$/;

export const DEFAULTS = {
  logo_plate: "#ffffff",
  voice: { provider: "elevenlabs", voice_id: null, model: "eleven_v3", stability: 0.5, stt_model: "scribe_v1", stt_language: null },
  music: null,
  fonts: [],
  font_fallback: ["sans-serif"],
  end_card: { tagline: null },
  post: { time: "19:00", timezone: null, platforms: ["tiktok", "instagram", "facebook", "youtube"] },
  limits: { min_seconds: 15, max_seconds: 35 },
  audio: { lufs: -14, true_peak: -1.5, music_db: -5, duck_db: -17, sfx: true },
  decorations: { sparks: false, garland: false },
};

export function loadBrand(root) {
  const dir = path.join(root, "brand");
  const file = path.join(dir, "brand.json");
  if (!exists(file)) fail(`No brand pack at ${file}.\nCreate one with: node "${path.join(ENGINE, "cli.mjs")}" init-brand --name "<Business>" --url <https://site>`);
  const b = readJSON(file, "brand.json");
  const errs = [];
  const need = (cond, msg) => { if (!cond) errs.push(msg); };
  const str = (v) => typeof v === "string" && v.trim().length > 0;

  need(str(b.name), `"name" must be the business name, e.g. "Juniper Lane Laundry"`);
  need(str(b.domain), `"domain" must be the address shown on the end card, e.g. "example.com"`);
  need(str(b.site_url) && /^https?:\/\//.test(b.site_url), `"site_url" must be the site's http(s) URL; relative capture URLs are resolved against it`);
  need(str(b.language), `"language" must name the language of the reels, e.g. "English" or "Nepali"`);
  need(str(b.language_code) && BCP47.test(b.language_code), `"language_code" must be a BCP-47 tag such as "en-US", "ne-NP" or "hi"`);

  const c = b.colors || {};
  need(b.colors && typeof b.colors === "object", `"colors" is required: {"primary", "accent", "ink"} as #hex`);
  for (const k of ["primary", "accent", "ink"]) need(HEX.test(c[k] || ""), `"colors.${k}" must be a #hex colour (got ${JSON.stringify(c[k])})`);
  for (const k of ["primary_dark", "paper", "text_on_primary", "text_on_accent"]) if (c[k] != null) need(HEX.test(c[k]), `"colors.${k}" must be a #hex colour (got ${JSON.stringify(c[k])})`);

  need(str(b.logo), `"logo" must be a path to an SVG or PNG logo, relative to brand/`);
  if (str(b.logo)) need(exists(path.join(dir, b.logo)), `"logo" file not found: brand/${b.logo}`);
  if (b.logo_plate != null) need(HEX.test(b.logo_plate) || b.logo_plate === false, `"logo_plate" must be a #hex colour behind the logo, or false for none`);

  if (b.fonts != null) {
    need(Array.isArray(b.fonts), `"fonts" must be a list of {"file", "unicode_range"?, "weight"?}`);
    for (const [i, f] of (Array.isArray(b.fonts) ? b.fonts : []).entries()) {
      need(str(f.file), `"fonts[${i}].file" is required`);
      if (str(f.file)) need(exists(path.join(dir, f.file)), `"fonts[${i}].file" not found: brand/${f.file}`);
      if (f.unicode_range != null) need(RANGE.test(f.unicode_range), `"fonts[${i}].unicode_range" must look like "U+0000-00FF, U+2013" (got ${JSON.stringify(f.unicode_range)})`);
    }
  }
  if (b.font_fallback != null) need(Array.isArray(b.font_fallback) && b.font_fallback.every(str), `"font_fallback" must be a list of font family names`);

  const v = { ...DEFAULTS.voice, ...(b.voice || {}) };
  need(v.provider === "elevenlabs", `"voice.provider" must be "elevenlabs" (the only provider supported now)`);
  need(v.voice_id == null || str(v.voice_id), `"voice.voice_id" must be an ElevenLabs voice ID string, or null until one is chosen`);
  need(typeof v.stability === "number" && v.stability >= 0 && v.stability <= 1, `"voice.stability" must be between 0 and 1`);

  if (b.music != null) {
    need(str(b.music), `"music" must be a path relative to brand/ (an MP3/WAV you have the rights to), or null for no music`);
    if (str(b.music)) need(exists(path.join(dir, b.music)), `"music" file not found: brand/${b.music} (set "music": null for no music bed)`);
  }

  const d = b.disclaimers || {};
  need(str(d.short), `"disclaimers.short" is required: the small print shown on screen, e.g. "Prices are a guide. AI voice."`);
  need(str(d.long), `"disclaimers.long" is required: the disclaimer added to every post caption`);
  if (b.post?.time != null) need(/^\d{1,2}:\d{2}$/.test(b.post.time), `"post.time" must be HH:MM`);
  const lim = { ...DEFAULTS.limits, ...(b.limits || {}) };
  need(lim.min_seconds > 0 && lim.max_seconds > lim.min_seconds, `"limits" needs 0 < min_seconds < max_seconds`);

  if (errs.length) fail(`brand/brand.json has ${errs.length} problem${errs.length > 1 ? "s" : ""}:\n  - ${errs.join("\n  - ")}\nSee reference/brand.md for every field.`);

  const brand = {
    ...DEFAULTS, ...b,
    voice: v, limits: lim,
    end_card: { ...DEFAULTS.end_card, ...(b.end_card || {}) },
    post: { ...DEFAULTS.post, ...(b.post || {}) },
    audio: { ...DEFAULTS.audio, ...(b.audio || {}) },
    decorations: { ...DEFAULTS.decorations, ...(b.decorations || {}) },
    disclaimers: { ai_label: "AI voice", ...d },
    colors: {
      primary_dark: mix(c.primary, "#000000", 0.45), paper: "#FAF9F6", text_on_primary: "#ffffff", text_on_accent: c.ink, ...c,
    },
    dir,
    slug: (b.slug || b.name).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "brand",
  };
  brand.musicPath = brand.music ? path.join(dir, brand.music) : null;
  brand.logoPath = path.join(dir, brand.logo);
  return brand;
}

// CSS for the scene: brand fonts first ("WRBrand"), then the bundled Mukta ExtraBold (Latin + Devanagari, OFL), then fallbacks.
export function fontCss(brand) {
  const faces = [];
  for (const f of brand.fonts || []) {
    faces.push(`@font-face{font-family:WRBrand;src:url("${pathToFileURL(path.join(brand.dir, f.file)).href}");font-weight:${f.weight || 800};font-display:block${f.unicode_range ? `;unicode-range:${f.unicode_range}` : ""}}`);
  }
  const mk = (file, range) => `@font-face{font-family:WRDefault;src:url("${pathToFileURL(path.join(ENGINE, "fonts", file)).href}") format("woff2");font-weight:800;font-display:block;unicode-range:${range}}`;
  faces.push(mk("mukta-800-latin.woff2", "U+0000-00FF,U+2013-2014,U+2018-201F,U+2022,U+2026,U+20AC"));
  faces.push(mk("mukta-800-devanagari.woff2", "U+0900-097F,U+1CD0-1CF9,U+200C-200D,U+20A8,U+20B9,U+25CC,U+A830-A839,U+A8E0-A8FF"));
  const families = [...(brand.fonts?.length ? ["WRBrand"] : []), "WRDefault", ...brand.font_fallback.map((f) => (/^[a-z-]+$/.test(f) ? f : JSON.stringify(f)))];
  return { css: faces.join("\n"), family: families.join(","), primary: brand.fonts?.length ? "WRBrand" : "WRDefault" };
}

function mix(a, b, t) {
  const p = (h) => { h = h.replace("#", ""); if (h.length === 3) h = [...h].map((x) => x + x).join(""); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
  if (!HEX.test(a || "")) return "#000000";
  const A = p(a), B = p(b);
  return "#" + A.map((x, i) => Math.round(x + (B[i] - x) * t).toString(16).padStart(2, "0")).join("");
}
