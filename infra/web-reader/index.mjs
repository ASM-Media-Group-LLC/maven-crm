// web-reader — micro Playwright headless para Dokploy. Renderiza una URL (con JS)
// y devuelve texto limpio + HTML + metadata, para que los bots de Maven lean
// páginas que el edge de Supabase no puede (SPAs, dashboards con JS, contenido
// tras render). Datacenter está bien acá: NO se usa para Instagram (las historias
// van por IP residencial vía el agente local; ver ../promolog-agent).
//
// Endpoints:
//   GET  /health                 → { ok }
//   POST /read  { url, wait?, selector?, max_chars? }  (auth: header x-reader-token)
//        → { ok, url, final_url, title, text, html?, status }
//
// Un solo browser Chromium reusado; una página nueva por request (aislada).
// Env: READER_TOKEN (obligatorio), PORT (default 8080), NAV_TIMEOUT_MS, MAX_CHARS.

import { createServer } from "node:http";
import { chromium } from "playwright";

const PORT = Number(process.env.PORT || 8080);
const TOKEN = process.env.READER_TOKEN || "";
const NAV_TIMEOUT = Number(process.env.NAV_TIMEOUT_MS || 25000);
const MAX_CHARS = Number(process.env.MAX_CHARS || 40000);
const ALLOWED = (process.env.ALLOWED_HOSTS || "").split(",").map((s) => s.trim()).filter(Boolean); // vacío = cualquiera

if (!TOKEN) { console.error("Falta READER_TOKEN"); process.exit(1); }

let browser;
async function getBrowser() {
  if (browser && browser.isConnected()) return browser;
  browser = await chromium.launch({ headless: true, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
  return browser;
}

function json(res, code, body) {
  const s = JSON.stringify(body);
  res.writeHead(code, { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(s) });
  res.end(s);
}
function readBody(req) {
  return new Promise((resolve) => {
    let d = ""; req.on("data", (c) => { d += c; if (d.length > 1e6) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(d || "{}")); } catch { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

async function readPage({ url, wait, selector, max_chars }) {
  const b = await getBrowser();
  const ctx = await b.newContext({
    userAgent: "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1366, height: 900 },
  });
  const page = await ctx.newPage();
  // No descargar imágenes/media/fuentes: más rápido y liviano (solo queremos el texto/DOM).
  await page.route("**/*", (route) => {
    const t = route.request().resourceType();
    if (t === "image" || t === "media" || t === "font") return route.abort();
    return route.continue();
  });
  try {
    const resp = await page.goto(url, { waitUntil: "networkidle", timeout: NAV_TIMEOUT }).catch(() => page.goto(url, { waitUntil: "domcontentloaded", timeout: NAV_TIMEOUT }));
    if (selector) { try { await page.waitForSelector(selector, { timeout: 8000 }); } catch { /* opcional */ } }
    if (wait && Number.isFinite(Number(wait))) await page.waitForTimeout(Math.min(Number(wait), 8000));
    const title = await page.title().catch(() => null);
    const text = await page.evaluate(() => {
      // texto visible, colapsado
      const t = document.body?.innerText || document.documentElement?.innerText || "";
      return t.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    });
    const cap = Math.min(Number(max_chars) || MAX_CHARS, 200000);
    const html = await page.content().catch(() => null);
    await ctx.close();
    return {
      ok: true, url, final_url: page.url(), status: resp?.status() ?? null,
      title, text: text.slice(0, cap), text_truncated: text.length > cap,
      html: html ? html.slice(0, cap * 3) : null,
    };
  } catch (e) {
    await ctx.close().catch(() => {});
    return { ok: false, url, error: String(e?.message || e).slice(0, 300) };
  }
}

const server = createServer(async (req, res) => {
  const u = new URL(req.url, `http://localhost`);
  if (req.method === "GET" && u.pathname === "/health") return json(res, 200, { ok: true });
  if (req.method !== "POST" || u.pathname !== "/read") return json(res, 404, { ok: false, error: "not_found" });
  if ((req.headers["x-reader-token"] || "") !== TOKEN) return json(res, 401, { ok: false, error: "unauthorized" });

  const body = await readBody(req);
  const url = String(body.url || "").trim();
  if (!/^https?:\/\//i.test(url)) return json(res, 400, { ok: false, error: "url_invalida" });
  if (ALLOWED.length) {
    let host = ""; try { host = new URL(url).hostname; } catch { /* */ }
    if (!ALLOWED.some((a) => host === a || host.endsWith("." + a))) return json(res, 403, { ok: false, error: "host_no_permitido", host });
  }
  try { json(res, 200, await readPage(body)); }
  catch (e) { json(res, 500, { ok: false, error: String(e?.message || e).slice(0, 300) }); }
});

server.listen(PORT, () => console.log(`[web-reader] escuchando en :${PORT}`));
process.on("SIGTERM", async () => { try { await browser?.close(); } catch { /* */ } process.exit(0); });
