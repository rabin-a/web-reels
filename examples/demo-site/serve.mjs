// Serves this folder at http://localhost:8765 (PORT env to change). No dependencies.
// usage: node examples/demo-site/serve.mjs
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = +(process.env.PORT || 8765);
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon" };

http.createServer((req, res) => {
  const url = new URL(req.url, "http://localhost");
  let p = path.normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, "");
  if (!p || p.endsWith("/")) p += "index.html";
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory() || file.endsWith(".mjs")) {
    res.writeHead(404, { "content-type": "text/plain" });
    return res.end("not found");
  }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}).listen(PORT, "127.0.0.1", () => console.log(`demo site: http://localhost:${PORT}/  (Ctrl-C to stop)`));
