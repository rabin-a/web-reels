#!/usr/bin/env node
// web-reels: promo reels from real screen captures of a website. Run from your project folder (never inside the skill).
// node cli.mjs <command> [args]   —   node cli.mjs help
import path from "node:path";
import { parseArgs, UserError, fail } from "./lib/util.mjs";
import { projectRoot, loadDotEnv, reelDir, ENGINE } from "./lib/project.mjs";

const HELP = `web-reels — promo reels from real screen captures of a website

usage: node ${path.join(ENGINE, "cli.mjs")} <command> [args] [--project <dir>]
Run it from your project folder (the one that holds brand/brand.json). Nothing is written inside the skill.

Set up
  doctor                          check node, ffmpeg, python3, Chrome, playwright-core, the API key (never printed)
  init-brand --name N --url URL [--domain D] [--lang English --code en-US]
                                  create brand/ (brand.json, logo placeholder); with --url also saves colour and
                                  logo suggestions from the site to brand/suggestions.json and brand/candidates/
  research <url> [url...] [--follow N]
                                  read pages (plain text per page in research/pages/) and list fact candidates
                                  (research/facts-candidates.json); --follow N adds up to N same-site links
  init-series --start YYYY-MM-DD --every DAYS --count N
                                  create series/plan.json and series/PLAN.md with the posting dates
  new-reel <NN-slug>              create series/NN-slug/ from the reel template

Per reel (<reel> = series/NN-slug or just NN-slug)
  capture <reel>                  phone-size full-page screenshots + element boxes (taps only, never types/submits)
  voice <reel> [ids...] [--silent] [--force] [--dry-run]
                                  ElevenLabs voice + Scribe timings (paid, logged to cost-log.jsonl);
                                  --silent: free placeholder takes (silence, estimated timings)
  audio <reel>                    mix voice, music (optional) and effects; loudness-normalise; write cues.json
  render <reel> [--formats 9x16,4x5,1x1,16x9] [--no-covers] [--jobs 2] [--draft]
                                  videos to <reel>/video/, covers to <reel>/covers/
  stills <reel> [--format 9x16,1x1] [--at 1,4.5,9]
                                  quick frames to <reel>/check/stills/ (no video encode)
  check <reel>                    automatic checks + contact sheets in <reel>/check/ (report.md, *-sheet.jpg)
  all <reel> [--silent] [--recapture]
                                  capture (if needed), voice (missing takes), audio, render, check
  transcribe <audio file>         Scribe transcript of any file (paid), e.g. to hear-check a final mix

Series
  package [--force]               copy checked reels to ready-to-post/ as NN_YYYY-MM-DD_slug-format.mp4 + captions
`;

const { pos, opt } = parseArgs(process.argv.slice(2));
const cmd = pos.shift();

async function main() {
  if (!cmd || cmd === "help" || opt.help) return console.log(HELP);
  const root = projectRoot(opt);
  loadDotEnv(root);
  const brand = async () => (await import("./lib/brand.mjs")).loadBrand(root);
  const reel = (usage) => reelDir(root, pos[0], usage);

  switch (cmd) {
    case "doctor": return (await import("./lib/init.mjs")).doctor(root);
    case "init-brand": return (await import("./lib/init.mjs")).initBrand(root, opt);
    case "init-series": return (await import("./lib/init.mjs")).initSeries(root, opt, await brand());
    case "new-reel": return (await import("./lib/init.mjs")).newReel(root, pos[0]);
    case "research": return (await import("./lib/research.mjs")).research(root, pos, opt);
    case "capture": return (await import("./lib/capture.mjs")).capture(reel("capture <reel>"), await brand());
    case "voice": {
      const dir = reel("voice <reel> [ids...] [--silent]");
      return (await import("./lib/voice.mjs")).voice(root, dir, await brand(), { ids: pos.slice(1), silent: !!opt.silent, force: !!opt.force, dryRun: !!opt["dry-run"] });
    }
    case "audio": return (await import("./lib/audio.mjs")).audio(root, reel("audio <reel>"), await brand());
    case "render": {
      const dir = reel("render <reel> [--formats 9x16,4x5,1x1,16x9]");
      return (await import("./lib/render.mjs")).render(root, dir, await brand(), {
        formats: opt.formats ? String(opt.formats).split(",") : undefined, covers: !opt["no-covers"], jobs: opt.jobs ? +opt.jobs : 2, fps: opt.draft ? 15 : 30,
      });
    }
    case "stills": {
      const dir = reel("stills <reel> [--format 9x16] [--at 1,4.5]");
      const { stills } = await import("./lib/render.mjs");
      const { readJSON } = await import("./lib/util.mjs");
      const total = readJSON(path.join(dir, "cues.json"), "cues.json (run the audio step first)").total;
      const at = opt.at ? String(opt.at).split(",").map(Number) : Array.from({ length: 8 }, (_, i) => +((i + 0.5) * total / 8).toFixed(2));
      const { FORMATS } = await import("./lib/spec.mjs");
      const fmts = String(opt.format || opt.formats || "9x16").split(",");
      for (const f of fmts) if (!FORMATS[f]) throw new UserError(`unknown format "${f}" (use ${Object.keys(FORMATS).join(", ")})`);
      if (at.some((t) => !Number.isFinite(t) || t < 0 || t > total)) throw new UserError(`--at times must be numbers between 0 and ${total.toFixed(2)} s`);
      const b = await brand();
      for (const f of fmts) await stills(root, dir, b, f, at, path.join(dir, "check", "stills"));
      return;
    }
    case "check": {
      const ok = await (await import("./lib/check.mjs")).check(root, reel("check <reel>"), await brand());
      if (!ok) process.exitCode = 1;
      return;
    }
    case "all": {
      const dir = reel("all <reel> [--silent]");
      const b = await brand();
      const { exists } = await import("./lib/util.mjs");
      if (opt.recapture || !exists(path.join(dir, "capture", "manifest.json"))) await (await import("./lib/capture.mjs")).capture(dir, b);
      await (await import("./lib/voice.mjs")).voice(root, dir, b, { silent: !!opt.silent });
      (await import("./lib/audio.mjs")).audio(root, dir, b);
      await (await import("./lib/render.mjs")).render(root, dir, b, { jobs: opt.jobs ? +opt.jobs : 2 });
      const ok = await (await import("./lib/check.mjs")).check(root, dir, b);
      if (!ok) process.exitCode = 1;
      return;
    }
    case "transcribe": {
      if (!pos[0]) fail("usage: transcribe <audio file>");
      if (!process.env.ELEVENLABS_API_KEY) fail("ELEVENLABS_API_KEY is not set (environment or .env in the project).");
      const r = await (await import("./lib/voice.mjs")).transcribe(root, path.resolve(pos[0]), await brand(), process.env.ELEVENLABS_API_KEY, path.basename(pos[0]));
      return console.log(r.text);
    }
    case "package": return (await import("./lib/package.mjs")).pack(root, await brand(), { force: !!opt.force });
    default: fail(`Unknown command "${cmd}".\n\n${HELP}`);
  }
}

main().catch((e) => {
  if (e instanceof UserError) { console.error(`error: ${e.message}`); process.exit(2); }
  console.error(e);
  process.exit(1);
});
