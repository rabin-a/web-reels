// Voice takes. With ELEVENLABS_API_KEY: one TTS take per line (paid), then Scribe transcribes it back for word
// timings and a said-vs-heard check (paid). Without a key, --silent writes placeholder takes: silence with
// estimated word timings, so the whole reel can be built and reviewed before anything is spent.
// Writes <reel>/audio/<id>.mp3 (real takes only), <id>.words.json ([[word, start s], ...]) and <id>.take.json.
import fs from "node:fs";
import path from "node:path";
import { loadLines } from "./spec.mjs";
import { fail, writeJSON, readJSON, exists, mkdirp, ffprobeDuration } from "./util.mjs";
import { logCost } from "./project.mjs";

const TAG = /\[[^\]]*\]/g;
const API = "https://api.elevenlabs.io/v1";
export const spoken = (l) => (l.say ?? l.text).replace(TAG, "").replace(/\s+/g, " ").trim();

export function takeInfo(dir, id) {
  const f = path.join(dir, "audio", `${id}.take.json`);
  return exists(f) ? readJSON(f, `${id}.take.json`) : null;
}

export async function voice(root, dir, brand, { ids = [], silent = false, force = false, dryRun = false } = {}) {
  const { lines } = loadLines(dir);
  const name = path.basename(dir);
  const OUT = path.join(dir, "audio");
  mkdirp(OUT);
  for (const id of ids) if (!lines.some((l) => l.id === id)) fail(`${name}/lines.json has no line "${id}"`);
  const todo = lines.filter((l) => {
    if (ids.length) return ids.includes(l.id);
    const t = takeInfo(dir, l.id);
    if (force || !t) return true;
    if ((t.source ?? t.said) !== (t.source != null ? l.say ?? l.text : spoken(l))) { console.log(`${l.id}: the line changed since its take; redoing it`); return true; }
    return silent ? false : t.placeholder; // a real take replaces a placeholder; real takes are kept unless named or --force
  });
  if (!todo.length) { console.log(`${name}: every line already has a take (name ids or pass --force to redo).`); return; }

  const key = process.env.ELEVENLABS_API_KEY;
  if (!silent && !key) {
    fail(`ELEVENLABS_API_KEY is not set (looked in the environment and ${path.join(root, ".env")}).\n` +
      `Either add it (ELEVENLABS_API_KEY=... in .env), or build a review version with a silent placeholder voice:\n` +
      `  node <engine>/cli.mjs voice ${name} --silent`);
  }
  if (!silent && !brand.voice.voice_id) fail(`brand.json "voice.voice_id" is empty. Pick a voice in the ElevenLabs voice library that speaks ${brand.language} and paste its ID.`);

  const chars = todo.reduce((a, l) => a + (l.say ?? l.text).length, 0);
  if (dryRun) {
    console.log(`${name}: would ${silent ? "write placeholders for" : "voice"} ${todo.length} line(s): ${todo.map((l) => l.id).join(", ")}; ${chars} characters of TTS.`);
    return;
  }

  for (const l of todo) {
    if (silent) placeholder(OUT, l);
    else await real(root, OUT, name, l, brand, key);
  }
}

// Silent take: duration and word starts estimated from the text, so captions and shots can be timed.
function placeholder(OUT, l) {
  const words = spoken(l).split(" ").filter(Boolean);
  let t = 0.05;
  const timed = words.map((w) => {
    const at = t;
    t += Math.min(0.7, Math.max(0.18, 0.12 + 0.055 * [...w].length)) + (/[.,;:?!।…]$/.test(w) ? 0.18 : 0.02);
    return [w, +at.toFixed(3)];
  });
  const duration = +(t + 0.1).toFixed(3);
  for (const ext of [".mp3"]) { const f = path.join(OUT, l.id + ext); if (exists(f)) fs.unlinkSync(f); }
  writeJSON(path.join(OUT, `${l.id}.words.json`), timed);
  writeJSON(path.join(OUT, `${l.id}.take.json`), { id: l.id, placeholder: true, source: l.say ?? l.text, said: spoken(l), duration, at: new Date().toISOString() });
  console.log(`${l.id}: placeholder ${duration.toFixed(2)} s, ${timed.length} words (silent)`);
}

async function post(url, key, body, headers = {}) {
  const r = await fetch(url, { method: "POST", headers: { "xi-api-key": key, ...headers }, body });
  if (!r.ok) {
    const msg = (await r.text()).slice(0, 400);
    fail(`ElevenLabs ${url.replace(API, "").split("?")[0]} answered HTTP ${r.status}: ${msg}` +
      (r.status === 401 ? "\nCheck ELEVENLABS_API_KEY." : r.status === 402 || /quota/i.test(msg) ? "\nThe account is out of credits." : ""));
  }
  return r;
}

export async function transcribe(root, file, brand, key, label) {
  const fd = new FormData();
  fd.append("model_id", brand.voice.stt_model || "scribe_v1");
  const lang = brand.voice.stt_language || brand.language_code.split("-")[0];
  if (lang) fd.append("language_code", lang);
  fd.append("file", new Blob([fs.readFileSync(file)]), path.basename(file));
  const r = await post(`${API}/speech-to-text`, key, fd);
  const seconds = +ffprobeDuration(file).toFixed(2);
  logCost(root, { provider: "elevenlabs", what: `stt ${label}`, model: brand.voice.stt_model || "scribe_v1", seconds });
  return r.json();
}

async function real(root, OUT, name, l, brand, key) {
  const text = l.say ?? l.text;
  const extra = brand.voice.tts_options || {};
  const body = { text, model_id: brand.voice.model, ...extra, voice_settings: { stability: brand.voice.stability, ...(extra.voice_settings || {}) } };
  const r = await post(`${API}/text-to-speech/${encodeURIComponent(brand.voice.voice_id)}?output_format=mp3_44100_128`, key, JSON.stringify(body), { "Content-Type": "application/json" });
  const mp3 = path.join(OUT, `${l.id}.mp3`);
  fs.writeFileSync(mp3, Buffer.from(await r.arrayBuffer()));
  logCost(root, { provider: "elevenlabs", what: `tts ${name}/${l.id}`, model: brand.voice.model, voice_id: brand.voice.voice_id, chars: text.length });
  const heard = await transcribe(root, mp3, brand, key, `${name}/${l.id}`);
  const words = (heard.words || []).filter((w) => w.type === "word").map((w) => [w.text, +(+w.start).toFixed(3)]);
  const said = spoken(l), sim = similarity(said, heard.text || "");
  writeJSON(path.join(OUT, `${l.id}.words.json`), words);
  writeJSON(path.join(OUT, `${l.id}.take.json`), {
    id: l.id, placeholder: false, source: l.say ?? l.text, said, heard: heard.text || "", similarity: sim, duration: +ffprobeDuration(mp3).toFixed(3),
    voice_id: brand.voice.voice_id, model: brand.voice.model, at: new Date().toISOString(),
  });
  console.log(`${l.id}: ${sim < 0.8 ? "CHECK " : ""}similarity ${sim.toFixed(2)}\n  said:  ${said}\n  heard: ${heard.text}`);
}

// 1 = identical after dropping case, punctuation and spaces.
export function similarity(a, b) {
  const n = (s) => [...s.normalize("NFC").toLowerCase().replace(/[\p{P}\p{S}\s]+/gu, "")];
  const A = n(a), B = n(b);
  if (!A.length && !B.length) return 1;
  let prev = Array.from({ length: B.length + 1 }, (_, j) => j);
  for (let i = 1; i <= A.length; i++) {
    const cur = [i];
    for (let j = 1; j <= B.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (A[i - 1] === B[j - 1] ? 0 : 1));
    prev = cur;
  }
  return +(1 - prev[B.length] / Math.max(A.length, B.length)).toFixed(3);
}
