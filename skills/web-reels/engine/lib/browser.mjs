// Finds playwright-core and a Chrome/Chromium to drive. Order: CHROME_PATH, common install paths, playwright's own chromium.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { fail } from "./util.mjs";
import { ENGINE } from "./project.mjs";

let pw;
export async function playwright() {
  if (pw) return pw;
  for (const base of [ENGINE, process.cwd()]) {
    try {
      const p = createRequire(path.join(base, "package.json")).resolve("playwright-core");
      const m = await import(pathToFileURL(p).href);
      pw = m.chromium ? m : m.default;
      return pw;
    } catch { /* try the next place */ }
  }
  fail(`playwright-core is not installed. Run once:\n  npm install --prefix "${ENGINE}"`);
}

function candidates() {
  const home = os.homedir();
  if (process.platform === "darwin") return [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    path.join(home, "Applications/Google Chrome.app/Contents/MacOS/Google Chrome"),
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  ];
  if (process.platform === "win32") {
    const pf = [process.env.PROGRAMFILES, process.env["PROGRAMFILES(X86)"], process.env.LOCALAPPDATA].filter(Boolean);
    return pf.flatMap((d) => [path.join(d, "Google/Chrome/Application/chrome.exe"), path.join(d, "Microsoft/Edge/Application/msedge.exe")]);
  }
  return ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/snap/bin/chromium", "/usr/bin/microsoft-edge"];
}

export async function findChrome() {
  const env = process.env.CHROME_PATH;
  if (env) {
    if (!fs.existsSync(env)) fail(`CHROME_PATH is set but nothing is there: ${env}`);
    return env;
  }
  const hit = candidates().find((p) => fs.existsSync(p));
  if (hit) return hit;
  const { chromium } = await playwright();
  try {
    const bundled = chromium.executablePath();
    if (bundled && fs.existsSync(bundled)) return bundled;
  } catch { /* not downloaded */ }
  fail(`No Chrome or Chromium found. Either set CHROME_PATH to a Chrome/Chromium binary, or download playwright's build once:\n` +
    `  node "${path.join(ENGINE, "node_modules", "playwright-core", "cli.js")}" install chromium`);
}

export async function launch(args = []) {
  const { chromium } = await playwright();
  return chromium.launch({ executablePath: await findChrome(), args: ["--allow-file-access-from-files", "--font-render-hinting=none", ...args] });
}

// A phone-sized context for capturing and reading sites.
export const PHONE = { width: 390, height: 844, scale: 3 };
export async function phoneContext(browser) {
  return browser.newContext({
    viewport: { width: PHONE.width, height: PHONE.height }, deviceScaleFactor: PHONE.scale, isMobile: true, hasTouch: true,
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  });
}

// Form submissions are never sent: any non-GET navigation is aborted before it leaves the browser.
export async function blockSubmissions(page, onBlock) {
  await page.route("**/*", (route) => {
    const r = route.request();
    if (r.isNavigationRequest() && r.method() !== "GET") { onBlock?.(r); return route.abort(); }
    return route.continue();
  });
}

export async function gotoOrExplain(page, url, opts = {}) {
  try {
    return await page.goto(url, { waitUntil: "networkidle", timeout: 45000, ...opts });
  } catch (e) {
    if (/ERR_CONNECTION_REFUSED|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|ERR_ADDRESS_UNREACHABLE/.test(e.message)) {
      const local = /localhost|127\.0\.0\.1/.test(url);
      fail(`Cannot reach ${url} (${e.message.match(/ERR_[A-Z_]+/)?.[0]}).` + (local ? `\nIs the local server running? For the demo site: node examples/demo-site/serve.mjs (in the web-reels repo), or see examples/demo-brand/README.md.` : ""));
    }
    if (/Timeout/.test(e.message)) {
      // networkidle can hang on sites with long-polling; fall back to "load".
      return page.goto(url, { waitUntil: "load", timeout: 45000 });
    }
    throw e;
  }
}
