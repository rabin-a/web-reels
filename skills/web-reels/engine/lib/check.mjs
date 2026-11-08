// Automatic checks for one reel. Writes <reel>/check/report.md and one contact sheet per rendered format.
// Errors mean "do not post"; warnings need a human look. The contact sheets still need to be looked at.
import fs from "node:fs";
import path from "node:path";
import { launch } from "./browser.mjs";
import { FORMATS, loadLines } from "./spec.mjs";
import { sceneData, openScene, outName } from "./render.mjs";
import { readJSON, exists, mkdirp, run, numbersIn, normText, ffprobeDuration, captionSections, findSection, xWeight } from "./util.mjs";

// Facts live in <project>/facts.json: { "facts": [{ "id", "claim", "url", "quote" }] }.
// Quotes are matched against the page text saved by `research` (research/pages.json -> research/pages/*.txt).
function pageTexts(root) {
  const idx = path.join(root, "research", "pages.json");
  const out = new Map();
  if (!exists(idx)) return out;
  for (const p of readJSON(idx, "research/pages.json").pages || []) {
    const f = path.join(root, "research", p.file);
    if (exists(f)) out.set(p.url, normText(fs.readFileSync(f, "utf8")));
  }
  return out;
}
const sameUrl = (a, b) => String(a).replace(/[#?].*$/, "").replace(/\/$/, "") === String(b).replace(/[#?].*$/, "").replace(/\/$/, "");

function factChecks(root, dir, reel, R) {
  const { lines, allow_numbers } = loadLines(dir);
  const factsFile = path.join(root, "facts.json");
  if (!exists(factsFile)) { R.err("facts.json is missing in the project folder: every on-screen claim needs a fact with its source quote (reference/checks.md)."); return; }
  const facts = Object.fromEntries((readJSON(factsFile, "facts.json").facts || []).map((f) => [f.id, f]));
  const pages = pageTexts(root);
  const used = new Set();

  for (const l of lines) {
    const claims = l.claims || [];
    const quotes = [];
    for (const id of claims) {
      const f = facts[id];
      if (!f) { R.err(`line "${l.id}" claims fact "${id}", which is not in facts.json`); continue; }
      used.add(id); quotes.push(f.quote || "");
    }
    const allowed = new Set([...allow_numbers, ...quotes.flatMap(numbersIn)]);
    for (const n of numbersIn(l.text)) if (!allowed.has(n)) R.err(`line "${l.id}" says ${n}, which is in none of its facts' quotes (${claims.join(", ") || "no claims"}): "${l.text}"`);
  }

  for (const id of used) {
    const f = facts[id];
    if (!f.url || !f.quote) { R.err(`fact "${id}" needs both "url" and "quote" (the exact text on the page)`); continue; }
    const text = [...pages].find(([u]) => sameUrl(u, f.url))?.[1];
    if (text == null) R.warn(`fact "${id}": no saved text for ${f.url}; run \`research ${f.url}\` so the quote can be checked`);
    else if (!text.includes(normText(f.quote))) R.err(`fact "${id}": the quote is not on ${f.url} (as saved by research). Quote: "${f.quote}"`);
    else R.ok(`fact "${id}" quote found on ${f.url}`);
  }

  // On-screen text that is not a voice line: captions, cover, end card. Numbers must come from this reel's facts.
  const reelNumbers = new Set([...allow_numbers, ...[...used].flatMap((id) => numbersIn(facts[id].quote || ""))]);
  const screen = [
    ...reel.captions.flatMap((g) => g.lines.map((l) => ["caption", l.text])),
    ...reel.cover.lines.map((l) => ["cover", l.text]),
    ...(reel.end.teaser ? [["teaser", reel.end.teaser.text]] : []),
    ["end tag", reel.end.tag || ""],
  ];
  for (const [where, t] of screen) for (const n of numbersIn(t)) if (!reelNumbers.has(n))
    R.err(`${where} text "${t}" shows ${n}, which is in none of the facts this reel's lines claim (add the fact to a line's "claims", or to allow_numbers if it is not a claim)`);
}

function layoutIssues(L, fmt, label, R) {
  const { W, H, items, view } = L;
  const m = 2;
  for (const it of items) {
    if (it.x < -m || it.y < -m || it.x + it.w > W + m || it.y + it.h > H + m) R.err(`${fmt} ${label}: ${it.kind} "${it.text.trim().slice(0, 40)}" runs off the frame`);
    if (it.font < H * 0.012 && it.kind !== "logoPlate") R.warn(`${fmt} ${label}: ${it.kind} "${it.text.trim().slice(0, 40)}" is small (${it.font.toFixed(0)} px)`);
    // 9x16 platform UI covers roughly the bottom 20% and a right-hand strip; keep captions clear of it.
    if (fmt === "9x16" && it.kind === "caption" && it.y + it.h > H * 0.8) R.warn(`${fmt} ${label}: caption "${it.text.trim().slice(0, 40)}" sits in the bottom 20% (platform buttons and post text go there)`);
  }
  const caps = items.filter((i) => i.kind === "caption");
  for (let i = 0; i < caps.length; i++) for (let j = i + 1; j < caps.length; j++) {
    const a = caps[i], b = caps[j];
    // Stacked lines in a group may touch (their plates nest); flag only real overlaps.
    const ov = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 4 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0.3 * Math.min(a.h, b.h);
    if (ov) R.err(`${fmt} ${label}: captions "${a.text.trim().slice(0, 30)}" and "${b.text.trim().slice(0, 30)}" overlap`);
  }
  if (view && view.box && view.settled) {
    const b = view.box, t = 3;
    if (b.x < view.x - t || b.y < view.y - t || b.x + b.w > view.x + view.w + t || b.y + b.h > view.y + view.h + t)
      R.err(`${fmt} ${label}: the highlight ring on "${view.img}" is cut off by the phone screen (lower the zoom, or set "cx"/"y" on the shot)`);
  }
}

function sheet(video, total, out) {
  const n = 12, step = total / n;
  const sel = Array.from({ length: n }, (_, i) => `lt(prev_pts*TB\\,${((i + 0.5) * step).toFixed(2)})*gte(pts*TB\\,${((i + 0.5) * step).toFixed(2)})`).join("+");
  run("ffmpeg", ["-v", "error", "-y", "-i", video, "-vf", `select='${sel}',scale=360:-2,tile=6x2:padding=6:color=white`, "-frames:v", "1", out]);
}

function loudness(file) {
  const r = run("ffmpeg", ["-nostdin", "-hide_banner", "-i", file, "-af", "ebur128=peak=true", "-f", "null", "-"], { allowFail: true });
  const s = (r.stderr || "").split("Summary:").pop();
  const I = s.match(/I:\s+(-?[\d.]+|-inf) LUFS/), P = s.match(/Peak:\s+(-?[\d.]+|-inf) dBFS/);
  return { I: I ? parseFloat(I[1]) : null, peak: P ? parseFloat(P[1]) : null };
}

export async function check(root, dir, brand) {
  const name = path.basename(dir);
  const lines = [];
  let errors = 0, warnings = 0;
  const R = {
    err: (m) => { errors++; lines.push(`- ❌ ${m}`); console.log(`ERROR ${m}`); },
    warn: (m) => { warnings++; lines.push(`- ⚠️ ${m}`); console.log(`WARN  ${m}`); },
    ok: (m) => { lines.push(`- ✅ ${m}`); },
  };
  const { data, reel, cues } = await sceneData(root, dir, brand);

  if (cues.placeholder_voice) R.warn("silent placeholder voice: this is a review build. Run `voice` with an API key, then audio/render/check again before posting.");
  if (reel.total < brand.limits.min_seconds || reel.total > brand.limits.max_seconds) R.warn(`runs ${reel.total.toFixed(1)} s; brand limits are ${brand.limits.min_seconds}-${brand.limits.max_seconds} s`);
  else R.ok(`length ${reel.total.toFixed(1)} s`);

  factChecks(root, dir, reel, R);

  const short = normText(brand.disclaimers.short || "");
  const shown = [reel.note?.text, reel.end.note].filter(Boolean).map(normText);
  if (short && !shown.some((t) => t.includes(short))) R.err(`the short disclaimer is not on screen (reel.json "note" or the end card): "${brand.disclaimers.short}"`);
  else if (short) R.ok("short disclaimer on screen");
  const capFile = path.join(dir, "captions.txt");
  if (!exists(capFile)) R.warn("captions.txt (the posting text) is not written yet");
  else {
    const t = normText(fs.readFileSync(capFile, "utf8"));
    for (const [k, v] of [["long disclaimer", brand.disclaimers.long], ["AI label", brand.disclaimers.ai_label]]) if (v && !t.includes(normText(v))) R.err(`captions.txt is missing the ${k}: "${v}"`);
    // The X post is short, so it carries the short disclaimer and the AI label instead of the long one.
    const x = findSection(captionSections(fs.readFileSync(capFile, "utf8")), /^X\b/);
    if (!x) R.warn('captions.txt has no "## X (x.com)" section; package will not write an X post');
    else {
      const w = xWeight(x);
      if (w > 280) R.err(`X post is ${w}/280 characters (links count 23)`);
      else R.ok(`X post ${w}/280 characters`);
      for (const [k, v] of [["short disclaimer", brand.disclaimers.short], ["AI label", brand.disclaimers.ai_label]]) if (v && !normText(x).includes(normText(v))) R.err(`X post is missing the ${k}: "${v}"`);
    }
  }

  const mix = path.join(dir, "audio", "mix.wav");
  if (exists(mix) && !cues.placeholder_voice) {
    const { I, peak } = loudness(mix);
    if (I == null || Math.abs(I - brand.audio.lufs) > 1) R.warn(`mix loudness ${I} LUFS; target ${brand.audio.lufs}`);
    else R.ok(`mix loudness ${I} LUFS`);
    if (peak != null && peak > brand.audio.true_peak + 0.5) R.warn(`mix peaks at ${peak} dBFS (limit ${brand.audio.true_peak})`);
  }

  // Layout: sample each caption group, the end card and the cover, in every format.
  const times = [...new Set([...reel.captions.map((g) => +(Math.min(g.to - 0.05, Math.max(...g.lines.map((l) => l.at)) + 0.6)).toFixed(2)),
    ...reel.shots.map((s) => +(s.from + s.dur + 0.05).toFixed(2)), +(reel.total - 0.1).toFixed(2)])].filter((t) => t > 0 && t < reel.total).sort((a, b) => a - b);
  const browser = await launch();
  try {
    for (const fmt of Object.keys(FORMATS)) {
      const [W, H] = FORMATS[fmt];
      const page = await openScene(browser, data, W, H);
      for (const t of times) layoutIssues(await page.evaluate((x) => window.layoutAt(x), t), fmt, `at ${t.toFixed(2)} s`, R);
      await page.close();
      const cp = await openScene(browser, data, W, H, { cover: true });
      layoutIssues(await cp.evaluate(() => window.layoutAt("cover")), fmt, "cover", R);
      await cp.close();
    }
  } finally { await browser.close(); }

  const out = path.join(dir, "check");
  mkdirp(out);
  const sheets = [];
  for (const fmt of Object.keys(FORMATS)) {
    const [W, H] = FORMATS[fmt];
    const v = outName(brand, dir, fmt, "video"), c = outName(brand, dir, fmt, "cover");
    if (!exists(c)) R.warn(`no ${fmt} cover (${path.relative(dir, c)})`);
    if (!exists(v)) { R.warn(`no ${fmt} video yet (${path.relative(dir, v)})`); continue; }
    const p = JSON.parse(run("ffprobe", ["-v", "error", "-show_entries", "stream=codec_type,width,height", "-of", "json", v]).stdout).streams;
    const vs = p.find((s) => s.codec_type === "video");
    if (!vs || vs.width !== W || vs.height !== H) R.err(`${path.basename(v)} is ${vs?.width}x${vs?.height}, expected ${W}x${H}`);
    if (!p.some((s) => s.codec_type === "audio")) R.err(`${path.basename(v)} has no audio track`);
    const d = ffprobeDuration(v);
    if (Math.abs(d - reel.total) > 0.3) R.warn(`${path.basename(v)} runs ${d.toFixed(2)} s; the timeline is ${reel.total.toFixed(2)} s`);
    const newer = ["cues.json", "reel.json", "lines.json", "reel.js"].filter((f) => exists(path.join(dir, f)) && fs.statSync(v).mtimeMs < fs.statSync(path.join(dir, f)).mtimeMs);
    if (newer.length) R.warn(`${path.basename(v)} is older than ${newer.join(", ")}; render again`);
    const s = path.join(out, `${fmt}-sheet.jpg`);
    sheet(v, d, s);
    sheets.push(s);
  }

  const verdict = errors ? `NOT READY: ${errors} error(s), ${warnings} warning(s)` : cues.placeholder_voice ? `REVIEW BUILD (placeholder voice): ${warnings} warning(s)` : `PASSED automatic checks with ${warnings} warning(s); now look at the contact sheets`;
  const md = `# Check: ${name}\n\n${new Date().toISOString()}\n\n**${verdict}**\n\n${lines.join("\n")}\n\n## Contact sheets (look at every one)\n\n${sheets.map((s) => `- ${path.relative(dir, s)}`).join("\n") || "- none (render first)"}\n`;
  fs.writeFileSync(path.join(out, "report.md"), md);
  console.log(`\n${verdict}\nreport: ${path.relative(process.cwd(), path.join(out, "report.md"))}`);
  for (const s of sheets) console.log(`sheet:  ${path.relative(process.cwd(), s)}`);
  fs.writeFileSync(path.join(out, "status.json"), JSON.stringify({ errors, warnings, placeholder_voice: !!cues.placeholder_voice, at: new Date().toISOString() }, null, 2));
  return errors === 0;
}

