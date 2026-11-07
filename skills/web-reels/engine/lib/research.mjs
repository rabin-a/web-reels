// Reads pages on the phone viewport and saves what is actually on them, so every claim can be traced to a quote.
// Writes research/pages/<slug>.txt (visible text), research/pages.json (index) and research/facts-candidates.json
// (sentences with numbers, prices, times or promises — candidates only; a person picks the facts for facts.json).
// Reading only: no typing, no form submission (non-GET navigations are blocked), no logins.
import fs from "node:fs";
import path from "node:path";
import { launch, phoneContext, blockSubmissions, gotoOrExplain } from "./browser.mjs";
import { fail, readJSON, writeJSON, exists, mkdirp, slugify, numbersIn, isoDate } from "./util.mjs";

const PROMISE = /\b(free|guarantee[ds]?|no (fee|charge|commission)|within|same[- ]day|open|hours?|days?|minutes?|since|years?|rated|award|certified|licensed|insured|refund|discount|off|from|only|per|each|starting)\b/i;

function sentences(text) {
  return text.split(/\n+/).flatMap((p) => p.split(/(?<=[.!?।])\s+/)).map((s) => s.replace(/\s+/g, " ").trim()).filter((s) => s.length >= 3 && s.length <= 300);
}

export async function research(root, urls, opt = {}) {
  if (!urls.length) fail("usage: research <url> [url...] [--follow N]");
  for (const u of urls) if (!/^https?:\/\//.test(u)) fail(`"${u}" is not an http(s) URL`);
  const dir = path.join(root, "research"), pagesDir = path.join(dir, "pages");
  mkdirp(pagesDir);
  const idxFile = path.join(dir, "pages.json");
  const idx = exists(idxFile) ? readJSON(idxFile, "research/pages.json") : { pages: [] };
  const follow = opt.follow === true ? 10 : Math.max(0, parseInt(opt.follow || 0, 10));
  const origins = new Set(urls.map((u) => new URL(u).origin));
  const queue = [...urls], seen = new Set();
  let extra = 0;

  const browser = await launch();
  const ctx = await phoneContext(browser);
  const page = await ctx.newPage();
  await blockSubmissions(page, (r) => console.warn(`blocked ${r.method()} ${r.url()}`));
  const candidates = [];
  try {
    while (queue.length) {
      const url = queue.shift().replace(/#.*$/, "");
      if (seen.has(url)) continue;
      seen.add(url);
      const res = await gotoOrExplain(page, url);
      await page.waitForTimeout(600);
      const status = res?.status() ?? 0;
      const { title, text, links } = await page.evaluate(() => ({
        title: document.title,
        text: document.body.innerText,
        links: [...document.querySelectorAll("a[href]")].map((a) => a.href),
      }));
      const file = `pages/${slugify(url.replace(/^https?:\/\//, ""))}.txt`;
      fs.writeFileSync(path.join(dir, file), `${url}\n${title}\nread ${new Date().toISOString()}\n\n${text}\n`);
      idx.pages = idx.pages.filter((p) => p.url !== url).concat({ url, final_url: page.url(), title, status, file, read_on: isoDate(new Date()) });
      console.log(`${status} ${url} -> research/${file} (${text.length} chars)`);
      for (const s of sentences(text)) if (numbersIn(s).length || PROMISE.test(s)) candidates.push({ url, quote: s, numbers: numbersIn(s) });
      if (extra < follow) for (const l of links) {
        let u;
        try { u = new URL(l); } catch { continue; }
        if (!origins.has(u.origin) || /\.(pdf|jpe?g|png|gif|svg|webp|zip|mp4|mp3)$/i.test(u.pathname)) continue;
        const clean = u.href.replace(/#.*$/, "");
        if (!seen.has(clean) && !queue.includes(clean) && extra < follow) { queue.push(clean); extra++; }
      }
    }
  } finally {
    await browser.close();
  }
  writeJSON(idxFile, idx);
  const candFile = path.join(dir, "facts-candidates.json");
  const old = exists(candFile) ? readJSON(candFile, "facts-candidates.json").candidates || [] : [];
  const keep = old.filter((c) => !seen.has(c.url));
  const all = [...keep, ...candidates].filter((c, i, a) => a.findIndex((d) => d.url === c.url && d.quote === c.quote) === i);
  writeJSON(candFile, { note: "Candidates only. Copy the ones you will use into facts.json with an id and a short claim; keep the quote exact.", candidates: all });
  console.log(`\n${seen.size} page(s) read; ${candidates.length} fact candidate(s) -> research/facts-candidates.json`);
}
