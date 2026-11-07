// Builds the mix and the voice timeline (cues.json) with build_audio.py.
import path from "node:path";
import { loadSpec } from "./spec.mjs";
import { takeInfo, spoken } from "./voice.mjs";
import { ENGINE } from "./project.mjs";
import { fail, writeJSON, exists, mkdirp, run, python } from "./util.mjs";

export function audio(root, dir, brand) {
  const { spec, lines, plan } = loadSpec(dir);
  const name = path.basename(dir);
  const A = path.join(dir, "audio");
  const items = plan.map((p) => {
    const t = takeInfo(dir, p.id);
    if (!t) fail(`${name}: line "${p.id}" has no voice take yet. Run: node <engine>/cli.mjs voice ${name}   (or add --silent for a placeholder)`);
    if (!t.placeholder && !exists(path.join(A, `${p.id}.mp3`))) fail(`${name}: audio/${p.id}.mp3 is missing; run the voice step again for "${p.id}"`);
    return { ...p, text: lines.byId[p.id].text, spoken: spoken(lines.byId[p.id]), placeholder: !!t.placeholder, duration: t.duration };
  });
  let music = brand.musicPath;
  if (spec.audio && "music" in spec.audio) {
    music = spec.audio.music ? path.resolve(root, spec.audio.music) : null;
    if (music && !exists(music)) fail(`${name}/reel.json audio.music not found: ${spec.audio.music} (paths are relative to the project)`);
  }
  mkdirp(path.join(dir, ".build"));
  const cfgFile = path.join(dir, ".build", "audio.json");
  writeJSON(cfgFile, {
    audio_dir: A, plan: items, hits: spec.audio?.hits || [], taps: spec.audio?.taps || {}, bell: spec.audio?.bell || null,
    music, lufs: brand.audio.lufs, true_peak: brand.audio.true_peak, music_db: brand.audio.music_db, duck_db: brand.audio.duck_db,
    sfx: spec.audio?.sfx ?? brand.audio.sfx, tail: spec.audio?.tail ?? 1.25,
    out_raw: path.join(A, "mix-raw.wav"), out_wav: path.join(A, "mix.wav"), cues: path.join(dir, "cues.json"),
  });
  const r = run(python(), ["-I", path.join(ENGINE, "build_audio.py"), cfgFile]);
  const res = JSON.parse(r.stdout.trim().split("\n").pop());
  console.log(`${name}: ${res.total} s` + (res.placeholder_voice ? " (silent placeholder voice)" : `, voice ${res.voice_over_music_db ?? "n/a"} dB over music/effects`) + (music ? "" : ", no music"));
  if (res.total > brand.limits.max_seconds || res.total < brand.limits.min_seconds) console.warn(`WARN ${name} runs ${res.total} s; brand limits are ${brand.limits.min_seconds}-${brand.limits.max_seconds} s. Trim lines, raise tempos or shorten gaps.`);
  return res;
}
