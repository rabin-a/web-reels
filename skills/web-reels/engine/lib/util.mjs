// Small shared helpers: errors, JSON files, subprocesses, numbers in any script.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

// An error meant for the person running the command: printed without a stack trace.
export class UserError extends Error {}
export const fail = (msg) => { throw new UserError(msg); };

export function readJSON(file, what = "file") {
  if (!fs.existsSync(file)) fail(`${what} not found: ${file}`);
  const src = fs.readFileSync(file, "utf8");
  try {
    return JSON.parse(src);
  } catch (e) {
    fail(`${what} is not valid JSON (${file}): ${e.message}`);
  }
}

export function writeJSON(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + "\n");
}

export const exists = (p) => fs.existsSync(p);
export const mkdirp = (p) => fs.mkdirSync(p, { recursive: true });

// Runs a program and returns stdout; throws a readable error if it is missing or fails.
export function run(cmd, args, { input, env, allowFail = false, cwd } = {}) {
  const r = spawnSync(cmd, args, { input, env, cwd, encoding: "utf8", maxBuffer: 1 << 28 });
  if (r.error && r.error.code === "ENOENT") fail(`${cmd} is not installed or not on PATH.`);
  if (r.status !== 0 && !allowFail) fail(`${cmd} ${args.slice(0, 3).join(" ")}… failed (exit ${r.status}):\n${(r.stderr || "").slice(-1500)}`);
  return r;
}

export function hasProgram(cmd, args = ["-version"]) {
  const r = spawnSync(cmd, args, { encoding: "utf8" });
  return !(r.error && r.error.code === "ENOENT");
}

export function ffprobeDuration(file) {
  const r = run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return parseFloat(r.stdout.trim());
}

export function python() {
  for (const p of ["python3", "python", "py"]) {
    const r = spawnSync(p, ["-c", "import sys; print(sys.version_info[0])"], { encoding: "utf8" });
    if (!r.error && r.stdout.trim() === "3") return p;
  }
  fail("Python 3 is needed for the audio mix. Install python3 and make sure it is on PATH.");
}

export const slugify = (s) =>
  String(s).normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "page";

// Decimal digits of many scripts start at these code points; map them all to 0-9.
const ZEROS = [0x30, 0x660, 0x6f0, 0x7c0, 0x966, 0x9e6, 0xa66, 0xae6, 0xb66, 0xbe6, 0xc66, 0xce6, 0xd66, 0xde6, 0xe50, 0xed0, 0xf20,
  0x1040, 0x1090, 0x17e0, 0x1810, 0x1946, 0x19d0, 0x1a80, 0x1a90, 0x1b50, 0x1bb0, 0x1c40, 0x1c50, 0xa620, 0xa8d0, 0xa900, 0xa9d0, 0xaa50, 0xabf0, 0xff10];
export function asciiDigits(s) {
  let out = "";
  for (const ch of String(s)) {
    const cp = ch.codePointAt(0);
    const z = ZEROS.find((z) => cp >= z && cp < z + 10);
    out += z !== undefined ? String(cp - z) : ch;
  }
  return out;
}

// Numbers as they appear in text: "1,705", "25,00,000", "2.50", "48". Grouping commas/spaces are dropped
// so "25,00,000" (South Asian grouping) and "2,500,000" both become "2500000". Trailing ".0" is kept as written.
export function numbersIn(text) {
  const s = asciiDigits(text).replace(/(\d)[  '’](?=\d{3}\b)/g, "$1");
  const found = s.match(/\d+(?:[,]\d+)*(?:\.\d+)?/g) || [];
  return [...new Set(found.map((n) => n.replace(/,/g, "")))];
}

// Whitespace- and case-insensitive text for "is this quote on the page" checks.
export const normText = (s) => asciiDigits(String(s)).normalize("NFC").replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—]/g, "-").replace(/\s+/g, " ").trim().toLowerCase();

export const isoDate = (d) => d.toISOString().slice(0, 10);

// Flags that never take a value.
export const BOOLEAN_FLAGS = new Set(["silent", "force", "dry-run", "no-covers", "recapture", "help", "yes", "keep-frames", "draft"]);

export function parseArgs(argv) {
  // --flag, --key value, --key=value; everything else is positional.
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > 0) opt[a.slice(2, eq)] = a.slice(eq + 1);
      else if (!BOOLEAN_FLAGS.has(a.slice(2)) && i + 1 < argv.length && !argv[i + 1].startsWith("--")) opt[a.slice(2)] = argv[++i];
      else opt[a.slice(2)] = true;
    } else pos.push(a);
  }
  return { pos, opt };
}

// captions.txt sections: "## Heading" -> body text (blank lines trimmed).
export function captionSections(text) {
  const out = {};
  let head = null;
  for (const line of text.split("\n")) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) { head = m[1]; out[head] = []; } else if (head) out[head].push(line);
  }
  for (const k of Object.keys(out)) out[k] = out[k].join("\n").trim();
  return out;
}
export const findSection = (secs, re) => Object.entries(secs).find(([k]) => re.test(k))?.[1];

// X (x.com) counts characters with weights: most scripts up to U+10FF (Latin, Devanagari, Arabic...) count 1,
// others (CJK, emoji) count 2, and every link counts 23. Limit 280 for a normal account.
export function xWeight(text) {
  const URL = /(?:https?:\/\/)?(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?/gi;
  let n = 0;
  const rest = text.normalize("NFC").replace(URL, () => { n += 23; return ""; });
  for (const ch of rest) {
    const c = ch.codePointAt(0);
    n += c <= 4351 || (c >= 8192 && c <= 8205) || (c >= 8208 && c <= 8223) || (c >= 8242 && c <= 8247) ? 1 : 2;
  }
  return n;
}
