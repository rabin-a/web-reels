// Where things live. The engine (this folder) is read-only; everything generated goes into the user's project.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fail, exists } from "./util.mjs";

export const ENGINE = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const SKILL = path.dirname(ENGINE);
export const TEMPLATES = path.join(SKILL, "templates");

// The project is the folder holding brand/brand.json: --project, else the nearest ancestor of cwd, else cwd.
export function projectRoot(opt = {}) {
  let root;
  if (opt.project) root = path.resolve(opt.project);
  else {
    let d = process.cwd();
    for (;;) {
      if (exists(path.join(d, "brand", "brand.json"))) { root = d; break; }
      const up = path.dirname(d);
      if (up === d) { root = process.cwd(); break; }
      d = up;
    }
  }
  guardNotInsideSkill(root);
  return root;
}

// Generated files must never land inside the skill or the plugin repo that ships it.
export function guardNotInsideSkill(dir) {
  const real = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
  const d = real(dir), s = real(SKILL);
  const pluginRoot = path.dirname(path.dirname(s)); // <repo>/skills/web-reels -> <repo>
  const insidePlugin = exists(path.join(pluginRoot, ".claude-plugin")) && (d === pluginRoot || d.startsWith(pluginRoot + path.sep));
  if (d === s || d.startsWith(s + path.sep) || insidePlugin) {
    fail(`Refusing to work inside the web-reels skill/plugin folder (${d}).\n` +
      `Run from your own project folder (cd there first), or pass --project <dir>.\n` +
      `To try the example: cp -r "${path.join(pluginRoot, "examples", "demo-brand")}" ~/web-reels-demo && cd ~/web-reels-demo`);
  }
}

// Keys come from the environment, or from <project>/.env if present. Existing env vars win. Values are never printed.
export function loadDotEnv(root) {
  const f = path.join(root, ".env");
  if (!exists(f)) return;
  for (const line of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trimStart().startsWith("#")) continue;
    const v = m[2].replace(/^(['"])(.*)\1$/, "$2");
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

// Reel dir: an absolute/relative path containing reel.json, or a bare name under <project>/series/.
export function reelDir(root, arg, usage) {
  if (!arg) fail(`usage: ${usage}`);
  const cands = [path.resolve(arg), path.join(root, "series", arg), path.join(root, arg)];
  const hit = cands.find((c) => exists(path.join(c, "reel.json")));
  if (!hit) fail(`No reel.json in ${cands.map((c) => path.relative(process.cwd(), c) || ".").join(" or ")}.\n` +
    `Create one with: node "${path.join(ENGINE, "cli.mjs")}" new-reel <NN-slug>`);
  guardNotInsideSkill(hit);
  return hit;
}

// Every paid API call is appended here (one JSON object per line). Units are logged because some
// providers bill credits rather than money; cost_usd is filled only when the provider says it.
export function logCost(root, entry) {
  const line = JSON.stringify({ at: new Date().toISOString(), cost_usd: null, ...entry });
  fs.appendFileSync(path.join(root, "cost-log.jsonl"), line + "\n");
}

export const rel = (root, p) => path.relative(root, p) || ".";
