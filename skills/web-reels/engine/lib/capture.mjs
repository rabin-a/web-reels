// Captures real pages on a phone viewport, following "capture" in <reel>/reel.json.
// It only taps and scrolls: it never types, fills, submits or logs in, and any non-GET navigation is aborted.
// Writes <reel>/capture/<shot>.jpg (full page) and capture/manifest.json (page height, box of every named element).
import fs from "node:fs";
import path from "node:path";
import { launch, phoneContext, blockSubmissions, gotoOrExplain, PHONE } from "./browser.mjs";
import { loadSpec } from "./spec.mjs";
import { fail, writeJSON, mkdirp } from "./util.mjs";

export async function capture(dir, brand) {
  const { spec } = loadSpec(dir);
  const name = path.basename(dir);
  const OUT = path.join(dir, "capture");
  mkdirp(OUT);
  const browser = await launch();
  const ctx = await phoneContext(browser);
  const page = await ctx.newPage();
  await blockSubmissions(page, (r) => console.warn(`BLOCKED a ${r.method()} navigation to ${r.url()} (forms are never submitted)`));
  const man = { _meta: { viewport: { w: PHONE.width, h: PHONE.height, scale: PHONE.scale }, captured_at: new Date().toISOString() } };
  const abs = (u) => new URL(u, brand.site_url.endsWith("/") ? brand.site_url : brand.site_url + "/").href;

  const locate = (s, where) => {
    if (typeof s === "string") s = { text: s };
    let l;
    if (s.css) l = page.locator(s.css, s.has ? { hasText: s.has } : undefined);
    else if (s.button) l = page.locator("button, [role=button], a, input[type=button], label", { hasText: s.button });
    else if (s.role) l = page.getByRole(s.role, s.name ? { name: s.name } : undefined);
    else if (s.text) l = page.getByText(s.text, { exact: !!s.exact });
    else fail(`${name}/reel.json ${where}: a locator needs one of text, button, css or role (got ${JSON.stringify(s)})`);
    if (s.button && s.has) l = l.filter({ hasText: s.has });
    return l.nth(s.nth ?? 0);
  };
  const boxOf = async (loc, where, desc) => {
    try {
      await loc.waitFor({ state: "attached", timeout: 8000 });
    } catch {
      fail(`${name}/reel.json ${where}: nothing on ${page.url()} matches ${JSON.stringify(desc)}. Check the exact text on the page (research/pages/*.txt) or use {"css": "..."}.`);
    }
    return loc.evaluate((e) => {
      const q = e.getBoundingClientRect();
      return { x: q.x + scrollX, y: q.y + scrollY, w: q.width, h: q.height, text: (e.innerText || e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 200) };
    });
  };

  for (const [i, s] of spec.capture.entries()) {
    const where = `capture[${i}]`;
    if (s.goto) {
      console.log(`goto ${abs(s.goto)}`);
      await gotoOrExplain(page, abs(s.goto));
      await page.waitForTimeout(s.wait ?? 800);
    } else if (s.tap) {
      const loc = locate(s.tap, `${where}.tap`);
      await boxOf(loc, `${where}.tap`, s.tap);
      const why = await loc.evaluate((e) => {
        const t = e.tagName.toLowerCase(), type = (e.getAttribute("type") || "").toLowerCase();
        if (["input", "textarea", "select"].includes(t) && !["button", "radio", "checkbox"].includes(type)) return `a text field (<${t}>)`;
        if (e.isContentEditable) return "an editable field";
        if (type === "submit" || (t === "button" && !e.hasAttribute("type") && e.form)) return "a form submit button";
        return null;
      });
      if (why) fail(`${name}/reel.json ${where}: refusing to tap ${why}. Captures may only tap options and scroll; they never submit forms or type.`);
      console.log(`tap ${JSON.stringify(s.tap)}`);
      await loc.click();
      await page.waitForTimeout(s.wait ?? 800);
    } else if (s.wait != null) {
      await page.waitForTimeout(+s.wait);
    } else if (s.hide) {
      // For overlays only (cookie banners, chat bubbles); never hide content that a claim depends on.
      await page.addStyleTag({ content: `${s.hide}{display:none!important}` });
    } else if (s.scroll != null) {
      await page.evaluate((y) => window.scrollTo(0, y), +s.scroll);
      await page.waitForTimeout(400);
    } else if (s.shot) {
      await page.waitForTimeout(600);
      // Sticky headers would repeat down a full-page screenshot, so they go back into normal flow.
      // "unstick": false to keep them, or a CSS selector for other sticky bars.
      if (s.unstick !== false) await page.addStyleTag({ content: `${typeof s.unstick === "string" ? s.unstick : "header,nav"}{position:static!important}` });
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(250);
      const boxes = {};
      for (const [k, loc] of Object.entries(s.boxes || {})) boxes[k] = await boxOf(locate(loc, `${where}.boxes.${k}`), `${where}.boxes.${k}`, loc);
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      // Very tall pages exceed what a browser can screenshot in one go at 3x; keep the top part.
      const maxH = s.max_height ?? 4500, keep = Math.min(h, maxH);
      await page.screenshot({ path: path.join(OUT, `${s.shot}.jpg`), fullPage: true, type: "jpeg", quality: 90, clip: { x: 0, y: 0, width: PHONE.width, height: keep } });
      man[s.shot] = { h: keep, url: page.url(), boxes };
      for (const [k, v] of Object.entries(boxes)) {
        if (v.w === 0 || v.h === 0) console.warn(`WARN ${s.shot}.${k} has no size (hidden element?)`);
        if (v.x < -0.5 || v.x + v.w > PHONE.width + 0.5) console.warn(`WARN ${s.shot}.${k} sticks out of the ${PHONE.width}px screen:`, v);
        if (v.y + v.h > keep) console.warn(`WARN ${s.shot}.${k} is below the kept part of the page (${keep}px); raise "max_height"`);
      }
      console.log(`shot ${s.shot}: ${page.url()} h=${keep}${h > keep ? ` (page ${h}, cut)` : ""} boxes=${Object.keys(boxes).join(",")}`);
    }
  }
  if (!Object.keys(man).some((k) => !k.startsWith("_"))) fail(`${name}/reel.json: capture has no {"shot": ...} step, so nothing was saved`);
  writeJSON(path.join(OUT, "manifest.json"), man);
  await browser.close();
  return man;
}
