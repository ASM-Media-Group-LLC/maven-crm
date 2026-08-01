// ui.mjs — panel web local del scanner. Levanta un servidor en localhost y sirve
// ui.html. Desde ahí logueás cada cuenta, corrés el scan y ves el progreso en
// vivo (creadora por creadora) sin tocar la terminal. Se lanza con
// `npm run ui` o doble clic en abrir-panel.command.

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { ACCOUNTS, EXT_TOKEN } from "./config.mjs";
import { runAccount, sleep, readCooldowns, sessionInfo, openLogin, saveLogin } from "./agent-core.mjs";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.UI_PORT || 4599);

// ── Estado de la corrida + broadcaster SSE ────────────────────────────────
const clients = new Set();
let running = false, stopFlag = false, lastResults = [];
function broadcast(evt, data) {
  const line = `event: ${evt}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) { try { res.write(line); } catch { /* */ } }
}
const log = (msg) => broadcast("log", { msg, t: Date.now() });

function statusPayload() {
  const cds = readCooldowns();
  return {
    running,
    token_ok: !!EXT_TOKEN,
    accounts: ACCOUNTS.map((a) => {
      const si = sessionInfo(a.sessionFile);
      const cd = cds[a.slot] && Date.now() < cds[a.slot] ? cds[a.slot] : null;
      return { slot: a.slot, logged_in: si.loggedIn, cooldown_until: cd };
    }),
    last_results: lastResults,
  };
}

async function runScan(slots) {
  if (running) return;
  running = true; stopFlag = false; lastResults = [];
  broadcast("status", statusPayload());
  const list = ACCOUNTS.filter((a) => !slots || slots.includes(a.slot));
  for (const acct of list) {
    try {
      await runAccount(acct, {
        log,
        onResult: (r) => { lastResults.push(r); broadcast("result", r); },
        shouldStop: () => stopFlag,
      });
    } catch (e) { log(`slot ${acct.slot} fallo: ${e.message}`); }
    if (stopFlag) break;
    await sleep(4000 + Math.random() * 4000);
  }
  running = false;
  log("— corrida terminada —");
  broadcast("done", { at: Date.now() });
  broadcast("status", statusPayload());
}

function json(res, code, body) { const s = JSON.stringify(body); res.writeHead(code, { "Content-Type": "application/json" }); res.end(s); }
function readBody(req) { return new Promise((r) => { let d = ""; req.on("data", (c) => d += c); req.on("end", () => { try { r(JSON.parse(d || "{}")); } catch { r({}); } }); }); }

const server = createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  // página
  if (req.method === "GET" && (u.pathname === "/" || u.pathname === "/index.html")) {
    const html = readFileSync(join(ROOT, "ui.html"), "utf8");
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return res.end(html);
  }
  // stream SSE
  if (req.method === "GET" && u.pathname === "/api/stream") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });
    res.write(`event: status\ndata: ${JSON.stringify(statusPayload())}\n\n`);
    clients.add(res); req.on("close", () => clients.delete(res)); return;
  }
  if (req.method === "GET" && u.pathname === "/api/status") return json(res, 200, statusPayload());
  // login: abrir navegador
  if (req.method === "POST" && u.pathname.startsWith("/api/login/") && u.pathname.endsWith("/open")) {
    const slot = u.pathname.split("/")[3];
    const acct = ACCOUNTS.find((a) => a.slot === slot);
    if (!acct) return json(res, 404, { ok: false, error: "slot" });
    try { await openLogin(slot); return json(res, 200, { ok: true }); }
    catch (e) { return json(res, 500, { ok: false, error: e.message }); }
  }
  // login: guardar sesión
  if (req.method === "POST" && u.pathname.startsWith("/api/login/") && u.pathname.endsWith("/save")) {
    const slot = u.pathname.split("/")[3];
    const acct = ACCOUNTS.find((a) => a.slot === slot);
    if (!acct) return json(res, 404, { ok: false, error: "slot" });
    try { await saveLogin(slot, acct.sessionFile); broadcast("status", statusPayload()); return json(res, 200, { ok: true }); }
    catch (e) { return json(res, 500, { ok: false, error: e.message }); }
  }
  // scan
  if (req.method === "POST" && u.pathname === "/api/scan") {
    const b = await readBody(req);
    if (running) return json(res, 409, { ok: false, error: "ya_corriendo" });
    runScan(Array.isArray(b.slots) && b.slots.length ? b.slots : null); // async, no await
    return json(res, 200, { ok: true });
  }
  // stop
  if (req.method === "POST" && u.pathname === "/api/stop") { stopFlag = true; return json(res, 200, { ok: true }); }
  json(res, 404, { ok: false, error: "not_found" });
});

server.listen(PORT, () => console.log(`\n🖥️  Panel de Promolog: abrí  http://localhost:${PORT}\n`));
