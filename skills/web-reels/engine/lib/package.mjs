// Copies checked reels into ready-to-post/ with dated names and a schedule. Never posts anything.
import fs from "node:fs";
import path from "node:path";
import { FORMATS } from "./spec.mjs";
import { outName } from "./render.mjs";
import { readJSON, exists, mkdirp, captionSections, findSection } from "./util.mjs";

// Where each platform asks you to label AI-generated or synthetic audio when you upload (check the current UI).
const AI_LABELS = {
  tiktok: "TikTok: turn on \"AI-generated content\" (More options) because the voice is synthetic.",
  instagram: "Instagram: turn on \"AI label\" (Advanced settings) because the voice is synthetic.",
  facebook: "Facebook: turn on \"AI info\" / \"Made with AI\" because the voice is synthetic.",
  youtube: "YouTube Shorts: answer Yes to \"Altered or synthetic content\" only if the voice could pass for a real person; say so in the description either way.",
};
AI_LABELS.x = "X: the reel is labelled in the post text; add X's \"Made with AI\" label if the upload screen offers it.";
// Which captions.txt section is the paste-ready description for each video format (first match wins).
const DESCRIPTION_FOR = {
  "9x16": [/^TikTok/i, /Reels/i],
  "16x9": [/^YouTube/i, /^Facebook feed/i],
  "4x5": [/^Facebook feed/i],
  "1x1": [/^Facebook feed/i],
};
const PLATFORM_FORMATS = { x: "1x1 (or 16x9) with the -X.txt text", tiktok: "9x16", instagram: "9x16 (Reels) · 4x5 or 1x1 (feed)", facebook: "9x16 (Reels) · 4x5/1x1 (feed) · 16x9", youtube: "9x16 (Shorts) · 16x9 (regular)" };

export async function pack(root, brand, { force = false } = {}) {
  const series = path.join(root, "series");
  if (!exists(series)) return console.log("no series/ folder yet");
  const plan = exists(path.join(series, "plan.json")) ? readJSON(path.join(series, "plan.json"), "series/plan.json") : { reels: [] };
  const out = path.join(root, "ready-to-post");
  const rows = [], skipped = [];
  for (const slug of fs.readdirSync(series).filter((d) => /^\d{2}-/.test(d) && fs.statSync(path.join(series, d)).isDirectory()).sort()) {
    const dir = path.join(series, slug);
    const st = exists(path.join(dir, "check", "status.json")) ? readJSON(path.join(dir, "check", "status.json"), "status.json") : null;
    if (!st) { skipped.push(`${slug}: not checked yet (run check)`); continue; }
    if (st.errors) { skipped.push(`${slug}: ${st.errors} check error(s)`); continue; }
    if (st.placeholder_voice && !force) { skipped.push(`${slug}: placeholder voice (review build); --force to package anyway`); continue; }
    if (!exists(path.join(dir, "captions.txt"))) { skipped.push(`${slug}: no captions.txt`); continue; }
    const p = plan.reels.find((r) => r.slug === slug) || {};
    const nn = slug.slice(0, 2), date = p.date || "undated", base = `${nn}_${date}_${slug.slice(3)}`;
    const dest = path.join(out, base);
    mkdirp(dest);
    const files = [];
    for (const fmt of Object.keys(FORMATS)) {
      for (const [kind, ext] of [["video", "mp4"], ["cover", "png"]]) {
        const src = outName(brand, dir, fmt, kind);
        if (!exists(src)) continue;
        const name = `${base}-${fmt}${kind === "cover" ? "-cover" : ""}.${ext}`;
        fs.copyFileSync(src, path.join(dest, name));
        files.push(name);
      }
    }
    fs.copyFileSync(path.join(dir, "captions.txt"), path.join(dest, `${base}-captions.txt`));
    // Paste-ready description next to each video, plus a short X post.
    const secs = captionSections(fs.readFileSync(path.join(dir, "captions.txt"), "utf8"));
    for (const fmt of Object.keys(FORMATS)) {
      if (!files.includes(`${base}-${fmt}.mp4`)) continue;
      const text = (DESCRIPTION_FOR[fmt] || []).map((re) => findSection(secs, re)).find(Boolean);
      if (text) { fs.writeFileSync(path.join(dest, `${base}-${fmt}.txt`), text + "\n"); files.push(`${base}-${fmt}.txt`); }
      else skipped.push(`${slug} ${fmt}: no matching captions.txt section for a description`);
    }
    const x = findSection(secs, /^X\b/);
    if (x) { fs.writeFileSync(path.join(dest, `${base}-X.txt`), x + "\n"); files.push(`${base}-X.txt`); }
    rows.push({ nn, slug, date, time: p.time || brand.post.time, files, placeholder: st.placeholder_voice });
  }
  if (!rows.length) { console.log(`nothing packaged.\n${skipped.map((s) => `  skip ${s}`).join("\n")}`); return; }
  const platforms = plan.platforms || brand.post.platforms;
  const md = `# Ready to post: ${brand.name}

Nothing here has been posted. Upload by hand (or with your scheduler) at the times below (${plan.timezone || brand.post.timezone}).

| # | Date | Time | Folder | Notes |
|---|------|------|--------|-------|
${rows.map((r) => `| ${r.nn} | ${r.date} | ${r.time} | ${r.nn}_${r.date}_${r.slug.slice(3)}/ | ${r.placeholder ? "**placeholder voice: do not post**" : ""} |`).join("\n")}

## Per platform
${platforms.map((p) => `- **${p}**: ${PLATFORM_FORMATS[p] || "pick the closest format"}. ${AI_LABELS[p] || "Label the AI voice if the platform asks."}`).join("\n")}

Each video has its post text next to it with the same name (\`<name>-9x16.txt\` for \`<name>-9x16.mp4\`); paste it as is. \`-X.txt\` is the short post for X (at most 280 characters). \`*-captions.txt\` has every version and the sources. Keep the disclaimer and the AI-voice line.
`;
  mkdirp(out);
  fs.writeFileSync(path.join(out, "SCHEDULE.md"), md);
  console.log(`packaged ${rows.length} reel(s) -> ready-to-post/ (SCHEDULE.md)`);
  for (const s of skipped) console.log(`  skip ${s}`);
}
