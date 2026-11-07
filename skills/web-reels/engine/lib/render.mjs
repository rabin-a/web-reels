// Draws scene.html frame by frame and pipes the frames to ffmpeg with the mix; also covers and quick stills.
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { pathToFileURL } from "node:url";
import { launch, PHONE } from "./browser.mjs";
import { resolveSpec, FORMATS } from "./spec.mjs";
import { fontCss } from "./brand.mjs";
import { ENGINE } from "./project.mjs";
import { fail, readJSON, exists, mkdirp, hasProgram } from "./util.mjs";

export async function sceneData(root, dir, brand) {
  const cues = readJSON(path.join(dir, "cues.json"), "cues.json (run the audio step first)");
  const man = readJSON(path.join(dir, "capture", "manifest.json"), "capture/manifest.json (run the capture step first)");
  const { reel, lines } = await resolveSpec(dir, brand, { root, cues, man, placeholder: cues.placeholder_voice });
  const fonts = fontCss(brand);
  const captures = {};
  for (const k of Object.keys(man)) if (!k.startsWith("_")) {
    const f = path.join(dir, "capture", `${k}.jpg`);
    if (!exists(f)) fail(`capture/${k}.jpg is missing; run the capture step again`);
    captures[k] = pathToFileURL(f).href;
  }
  return {
    data: {
      brand: { name: brand.name, lang: brand.language_code, colors: brand.colors, logoUrl: pathToFileURL(brand.logoPath).href, logoPlate: brand.logo_plate || null },
      fontCss: fonts.css, fontFamily: fonts.family, fontFamilies: brand.fonts?.length ? ["WRBrand", "WRDefault"] : ["WRDefault"],
      reel, man, captures, viewport: man._meta?.viewport || { w: PHONE.width, h: PHONE.height },
    },
    reel, cues, lines,
  };
}

export async function openScene(browser, data, W, H, { cover = false } = {}) {
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  await page.addInitScript((d) => { window.__WR = d; }, data);
  await page.goto(`${pathToFileURL(path.join(ENGINE, "scene.html")).href}?w=${W}&h=${H}${cover ? "&cover=1" : ""}`);
  await page.evaluate(() => window.ready);
  if (errors.length) fail(`The scene failed to draw (${W}x${H}): ${errors.join(" | ")}`);
  return page;
}

export const outName = (brand, dir, fmt, kind) => {
  const [W, H] = FORMATS[fmt], base = `${brand.slug}-${path.basename(dir)}`;
  return kind === "video" ? path.join(dir, "video", `${base}-${fmt}-${W}x${H}.mp4`) : path.join(dir, "covers", `${base}-cover-${fmt}-${W}x${H}.png`);
};

async function video(browser, data, dir, fmt, out, fps) {
  const [W, H] = FORMATS[fmt];
  const page = await openScene(browser, data, W, H);
  const total = data.reel.total, n = Math.ceil(total * fps);
  const wav = path.join(dir, "audio", "mix.wav");
  if (!exists(wav)) fail(`audio/mix.wav is missing; run the audio step first`);
  mkdirp(path.dirname(out));
  const ff = spawn("ffmpeg", ["-nostdin", "-y", "-v", "error", "-f", "image2pipe", "-framerate", String(fps), "-c:v", "mjpeg", "-i", "-", "-i", wav,
    "-c:a", "aac", "-b:a", "192k", "-vf", "scale=in_color_matrix=bt601:out_color_matrix=bt709:in_range=pc:out_range=tv,format=yuv420p",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-r", String(fps), "-movflags", "+faststart", "-shortest", out], { stdio: ["pipe", "inherit", "inherit"] });
  const closed = new Promise((r) => ff.on("close", r));
  const t0 = Date.now();
  for (let f = 0; f < n; f++) {
    await page.evaluate((x) => window.seek(x), f / fps);
    const img = await page.screenshot({ type: "jpeg", quality: 94 });
    if (!ff.stdin.write(img)) await new Promise((r) => ff.stdin.once("drain", r));
    if (f && f % (fps * 5) === 0) process.stdout.write(`  ${fmt} ${(f / fps).toFixed(0)}/${total.toFixed(0)} s\n`);
  }
  ff.stdin.end();
  const code = await closed;
  await page.close();
  if (code !== 0) fail(`ffmpeg failed while encoding ${out}`);
  console.log(`video ${path.relative(process.cwd(), out)} (${n} frames, ${((Date.now() - t0) / 1000).toFixed(0)} s)`);
}

async function coverPng(browser, data, fmt, out) {
  const [W, H] = FORMATS[fmt];
  const page = await openScene(browser, data, W, H, { cover: true });
  mkdirp(path.dirname(out));
  await page.waitForTimeout(150);
  await page.screenshot({ path: out, type: "png" });
  await page.close();
  console.log(`cover ${path.relative(process.cwd(), out)}`);
}

export async function stills(root, dir, brand, fmt, times, outDir) {
  const { data } = await sceneData(root, dir, brand);
  const browser = await launch();
  const [W, H] = FORMATS[fmt];
  const page = await openScene(browser, data, W, H);
  mkdirp(outDir);
  const files = [];
  for (const t of times) {
    await page.evaluate((x) => window.seek(x), t);
    const f = path.join(outDir, `${fmt}-t${t.toFixed(2).padStart(5, "0")}.jpg`);
    await page.screenshot({ path: f, type: "jpeg", quality: 88 });
    files.push(f);
  }
  await browser.close();
  console.log(files.map((f) => path.relative(process.cwd(), f)).join("\n"));
  return files;
}

export async function render(root, dir, brand, { formats = Object.keys(FORMATS), covers = true, videos = true, jobs = 2, fps = 30 } = {}) {
  if (!hasProgram("ffmpeg")) fail("ffmpeg is not installed or not on PATH.");
  for (const f of formats) if (!FORMATS[f]) fail(`Unknown format "${f}". Formats: ${Object.keys(FORMATS).join(", ")}`);
  const { data } = await sceneData(root, dir, brand);
  const browser = await launch();
  try {
    if (covers) for (const f of formats) await coverPng(browser, data, f, outName(brand, dir, f, "cover"));
    if (videos) {
      const queue = [...formats];
      const worker = async () => { while (queue.length) { const f = queue.shift(); await video(browser, data, dir, f, outName(brand, dir, f, "video"), fps); } };
      await Promise.all(Array.from({ length: Math.max(1, Math.min(+jobs || 1, formats.length)) }, worker));
    }
  } finally {
    await browser.close();
  }
}
