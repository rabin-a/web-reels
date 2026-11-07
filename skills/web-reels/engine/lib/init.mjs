// Project set-up: doctor, init-brand, init-series, new-reel.
import fs from "node:fs";
import path from "node:path";
import { TEMPLATES, ENGINE } from "./project.mjs";
import { fail, readJSON, writeJSON, exists, mkdirp, hasProgram, isoDate, python } from "./util.mjs";

export async function doctor(root) {
  const rows = [];
  const row = (ok, what, hint = "") => { rows.push(ok); console.log(`${ok ? "ok  " : "MISS"} ${what}${!ok && hint ? `\n     ${hint}` : ""}`); };
  const [maj, min] = process.versions.node.split(".").map(Number);
  row(maj > 18 || (maj === 18 && min >= 17), `node ${process.versions.node} (need 18.17+)`, "Install a current Node.js (https://nodejs.org).");
  row(hasProgram("ffmpeg"), "ffmpeg", "macOS: brew install ffmpeg · Debian/Ubuntu: sudo apt install ffmpeg · Windows: winget install ffmpeg");
  row(hasProgram("ffprobe"), "ffprobe (comes with ffmpeg)");
  let py = false;
  try { py = python(); } catch { /* reported below */ }
  row(!!py, `python 3${py ? ` (${py})` : ""} for the audio mix (standard library only)`, "Install Python 3 and put it on PATH.");
  const pw = exists(path.join(ENGINE, "node_modules", "playwright-core"));
  row(pw, "playwright-core in the engine", `cd "${ENGINE}" && npm install`);
  if (pw) {
    try {
      const { findChrome } = await import("./browser.mjs");
      const c = await findChrome();
      row(true, `browser: ${c}`);
    } catch (e) { row(false, "Chrome / Chromium / Edge", e.message.split("\n")[0]); }
  }
  const key = !!process.env.ELEVENLABS_API_KEY;
  console.log(`${key ? "ok  " : "info"} ELEVENLABS_API_KEY ${key ? "is set (not shown)" : "is not set: voices can only be silent placeholders (voice --silent)"}`);
  const b = path.join(root, "brand", "brand.json");
  console.log(`${exists(b) ? "ok  " : "info"} project ${root}${exists(b) ? "" : " has no brand/brand.json yet (init-brand)"}`);
  if (rows.some((r) => !r)) { process.exitCode = 1; console.log("\nFix the MISS lines, then run doctor again."); }
  else console.log("\nAll set.");
}

// Colour and logo hints from the live site. Suggestions only: a person confirms them in brand.json.
async function suggest(root, url) {
  const { launch, phoneContext, blockSubmissions, gotoOrExplain } = await import("./browser.mjs");
  const browser = await launch();
  try {
    const ctx = await phoneContext(browser);
    const page = await ctx.newPage();
    await blockSubmissions(page);
    await gotoOrExplain(page, url);
    await page.waitForTimeout(800);
    const s = await page.evaluate(() => {
      const meta = (n) => document.querySelector(`meta[name="${n}"],meta[property="${n}"]`)?.content || null;
      const count = new Map();
      const add = (c, w) => { if (!c || /rgba\(.*,\s*0\)|transparent/.test(c)) return; count.set(c, (count.get(c) || 0) + w); };
      for (const el of document.querySelectorAll("header *, nav *, a, button, h1, h2, h3, [class*=btn], [class*=button]")) {
        const cs = getComputedStyle(el), r = el.getBoundingClientRect();
        const area = Math.min(r.width * r.height, 40000) / 1000;
        add(cs.backgroundColor, area + 1); add(cs.color, 1);
      }
      const logos = [];
      const push = (src, why) => { if (src && !logos.some((l) => l.src === src)) logos.push({ src, why }); };
      for (const img of document.querySelectorAll("img, svg")) {
        const tag = (img.getAttribute("alt") || "") + " " + (img.getAttribute("class") || "") + " " + (img.getAttribute("src") || "") + " " + (img.id || "");
        const inHeader = !!img.closest("header, nav, [class*=header], [class*=logo]");
        if (/logo/i.test(tag) || inHeader) {
          if (img.tagName.toLowerCase() === "svg") push("data:image/svg+xml;charset=utf-8," + encodeURIComponent(new XMLSerializer().serializeToString(img)), "inline svg in header");
          else push(img.currentSrc || img.src, /logo/i.test(tag) ? "img named logo" : "img in header");
        }
      }
      for (const l of document.querySelectorAll('link[rel~="icon"], link[rel="apple-touch-icon"]')) push(l.href, l.rel);
      if (meta("og:image")) push(new URL(meta("og:image"), location.href).href, "og:image");
      return { title: document.title, site_name: meta("og:site_name"), theme_color: meta("theme-color"), lang: document.documentElement.lang || null,
        colours: [...count].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([c, w]) => ({ css: c, weight: Math.round(w) })), logos: logos.slice(0, 8) };
    });
    const hex = (c) => { const m = c.match(/\d+(\.\d+)?/g); return m ? "#" + m.slice(0, 3).map((n) => (+n).toString(16).padStart(2, "0")).join("").toUpperCase() : c; };
    s.colours = s.colours.map((c) => ({ ...c, hex: hex(c.css) }));
    const cand = path.join(root, "brand", "candidates");
    mkdirp(cand);
    s.logos = await Promise.all(s.logos.map(async (l, i) => {
      try {
        let buf, ext;
        if (l.src.startsWith("data:image/svg+xml")) { buf = Buffer.from(decodeURIComponent(l.src.split(",").slice(1).join(","))); ext = "svg"; }
        else {
          const r = await ctx.request.get(l.src, { timeout: 15000 });
          if (!r.ok()) return { ...l, saved: null };
          buf = await r.body();
          const ct = r.headers()["content-type"] || "";
          ext = /svg/.test(ct) ? "svg" : /png/.test(ct) ? "png" : /jpe?g/.test(ct) ? "jpg" : /webp/.test(ct) ? "webp" : /icon/.test(ct) ? "ico" : (l.src.match(/\.(svg|png|jpe?g|webp|ico)(\?|$)/i)?.[1] || "bin");
        }
        const f = `candidates/logo-${i + 1}.${ext}`;
        fs.writeFileSync(path.join(root, "brand", f), buf);
        return { ...l, src: l.src.startsWith("data:") ? "(inline svg)" : l.src, saved: `brand/${f}` };
      } catch { return { ...l, src: l.src.startsWith("data:") ? "(inline svg)" : l.src, saved: null }; }
    }));
    writeJSON(path.join(root, "brand", "suggestions.json"), { url, read_on: isoDate(new Date()), note: "Suggestions only. Pick colours and a logo, then edit brand/brand.json. Ask the business for an official logo if none of these is clean.", ...s });
    console.log(`suggestions -> brand/suggestions.json (${s.colours.length} colours, ${s.logos.filter((l) => l.saved).length} logo candidates in brand/candidates/)`);
    if (s.theme_color) console.log(`theme-color: ${s.theme_color}`);
    return s;
  } finally { await browser.close(); }
}

export async function initBrand(root, opt) {
  if (!opt.name) fail('usage: init-brand --name "Business name" --url https://their-site [--domain their-site.com] [--lang English --code en-US]');
  const dir = path.join(root, "brand");
  const file = path.join(dir, "brand.json");
  if (exists(file) && !opt.force) fail(`${path.relative(process.cwd(), file) || file} already exists (use --force to overwrite)`);
  mkdirp(dir);
  const t = readJSON(path.join(TEMPLATES, "brand", "brand.json"), "template brand.json");
  delete t._comment;
  t.name = String(opt.name);
  if (opt.url) {
    if (!/^https?:\/\//.test(opt.url)) fail(`--url must start with http:// or https:// (got ${opt.url})`);
    t.site_url = opt.url;
    t.domain = opt.domain || new URL(opt.url).hostname.replace(/^www\./, "");
  }
  if (opt.domain) t.domain = opt.domain;
  if (opt.lang) t.language = String(opt.lang);
  if (opt.code) t.language_code = String(opt.code);
  if (!exists(path.join(dir, "logo.svg"))) fs.copyFileSync(path.join(TEMPLATES, "brand", "logo.svg"), path.join(dir, "logo.svg"));
  let s = null;
  if (opt.url && !opt["no-suggest"]) {
    try { s = await suggest(root, opt.url); } catch (e) { console.warn(`WARN could not read ${opt.url} for suggestions: ${e.message.split("\n")[0]}`); }
  }
  if (s?.theme_color && /^#[0-9a-f]{6}$/i.test(s.theme_color)) t.colors.primary = s.theme_color.toUpperCase();
  writeJSON(file, t);
  for (const f of ["facts.json"]) if (!exists(path.join(root, f))) fs.copyFileSync(path.join(TEMPLATES, f), path.join(root, f));
  const gi = path.join(root, ".gitignore");
  if (!exists(gi)) fs.copyFileSync(path.join(TEMPLATES, "gitignore"), gi);
  console.log(`created brand/brand.json, brand/logo.svg (placeholder), facts.json, .gitignore in ${root}
next: set colours, logo, disclaimers and voice in brand/brand.json (reference/brand.md), then: research ${opt.url || "<url>"}`);
}

export async function initSeries(root, opt, brand) {
  const start = opt.start ? new Date(`${opt.start}T00:00:00Z`) : null;
  if (!start || isNaN(start)) fail("usage: init-series --start YYYY-MM-DD --every DAYS --count N");
  const every = Math.max(1, parseInt(opt.every || 1, 10)), count = Math.max(1, parseInt(opt.count || 6, 10));
  const file = path.join(root, "series", "plan.json");
  if (exists(file) && !opt.force) fail("series/plan.json already exists (use --force to overwrite)");
  mkdirp(path.dirname(file));
  const reels = Array.from({ length: count }, (_, i) => ({
    n: i + 1, slug: `${String(i + 1).padStart(2, "0")}-todo`, date: isoDate(new Date(start.getTime() + i * every * 86400000)),
    time: brand.post.time, question: "", screens: "", teaser: "", facts: [],
  }));
  writeJSON(file, { brand: brand.name, timezone: brand.post.timezone, platforms: brand.post.platforms, reels });
  const md = fs.readFileSync(path.join(TEMPLATES, "series", "PLAN.md"), "utf8")
    .replace(/\{\{brand\}\}/g, brand.name).replace(/\{\{site\}\}/g, brand.site_url)
    .replace("{{rows}}", reels.map((r) => `| ${r.n} | ${r.date} ${r.time} | ${r.slug} | | | |`).join("\n"));
  fs.writeFileSync(path.join(root, "series", "PLAN.md"), md);
  console.log(`series/plan.json and series/PLAN.md: ${count} reels from ${opt.start}, every ${every} day(s) at ${brand.post.time} ${brand.post.timezone}
next: fill in the question, screens, facts and teaser per reel; rename the slugs; then new-reel <NN-slug>`);
}

export function newReel(root, slug) {
  if (!slug || !/^\d{2}-[a-z0-9][a-z0-9-]*$/.test(slug)) fail('usage: new-reel <NN-slug>, e.g. new-reel 02-dry-clean (two digits, a dash, lower-case words)');
  const dir = path.join(root, "series", slug);
  if (exists(dir)) fail(`series/${slug} already exists`);
  mkdirp(dir);
  for (const f of ["reel.json", "lines.json", "captions.txt"]) fs.copyFileSync(path.join(TEMPLATES, "reel", f), path.join(dir, f));
  console.log(`created series/${slug}/ (reel.json, lines.json, captions.txt) — see reference/spec.md`);
}

