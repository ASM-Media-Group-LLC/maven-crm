// ui.mjs — panel web local del scanner. Cuentas DINÁMICAS por red (agregás desde
// el panel y el scan se reparte entre las que haya). Levanta un server en localhost
// y sirve ui.html. Se lanza con `npm run ui` o doble clic en abrir-panel.command.

import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXT_TOKEN, CRON_TOKEN } from "./config.mjs";
import { runAccount, sleep, readCooldowns, sessionInfo, openLoginTo, saveLoginTo } from "./agent-core.mjs";
import { runTelegram } from "./tg-scraper.mjs";
import { runX } from "./x-scraper.mjs";
import { NETWORKS, accountsOf, addAccount, removeAccount, sessionPath } from "./accounts.mjs";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.UI_PORT || 4599);
const LOGIN_URL = {
  instagram: "https://www.instagram.com/accounts/login/",
  telegram: "https://web.telegram.org/k/",
  x: "https://x.com/login",
};
const NET_LABEL = { instagram: "Instagram", telegram: "Telegram", x: "X" };

// ── SSE ───────────────────────────────────────────────────────────────────
const clients = new Set();
let running = false, stopFlag = false, lastResults = [];
function broadcast(evt, data) { const line = `event: ${evt}\ndata: ${JSON.stringify(data)}\n\n`; for (const r of clients) { try { r.write(line); } catch { /* */ } } }
const log = (msg) => broadcast("log", { msg, t: Date.now() });

function statusPayload() {
  const cds = readCooldowns();
  return {
    running, token_ok: !!EXT_TOKEN, cron_ok: !!CRON_TOKEN,
    networks: NETWORKS.map((net) => ({
      network: net, label: NET_LABEL[net],
      accounts: accountsOf(net).map((a, i) => {
        const si = sessionInfo(sessionPath(a.session));
        const cd = cds[a.id] && Date.now() < cds[a.id] ? cds[a.id] : null;
        return { id: a.id, index: i, logged_in: si.exists, cooldown_until: cd };
      }),
    })),
    last_results: lastResults,
  };
}

async function runScan(network, onlyIds) {
  if (running) return;
  running = true; stopFlag = false; lastResults = [];
  broadcast("status", statusPayload());
  let accts = accountsOf(network);
  const count = accts.length;
  if (onlyIds && onlyIds.length) accts = accts.map((a, i) => ({ ...a, _i: i })).filter((a) => onlyIds.includes(a.id));
  else accts = accts.map((a, i) => ({ ...a, _i: i }));
  const cbs = { log, onResult: (r) => { lastResults.push(r); broadcast("result", r); }, shouldStop: () => stopFlag };
  for (const a of accts) {
    const account = { id: a.id, sessionFile: sessionPath(a.session), index: a._i, count };
    try {
      if (network === "instagram") await runAccount(account, cbs);
      else if (network === "telegram") await runTelegram({ account, ...cbs });
      else if (network === "x") await runX({ account, ...cbs });
    } catch (e) { log(`${network}/${a.id} falló: ${e.message}`); }
    if (stopFlag) break;
    await sleep(4000 + Math.random() * 4000);
  }
  running = false;
  log("— corrida terminada —"); broadcast("done", { at: Date.now() }); broadcast("status", statusPayload());
}

function json(res, code, body) { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(body)); }
function readBody(req) { return new Promise((r) => { let d = ""; req.on("data", (c) => d += c); req.on("end", () => { try { r(JSON.parse(d || "{}")); } catch { r({}); } }); }); }

const server = createServer(async (req, res) => {
  const u = new URL(req.url, "http://localhost");
  const parts = u.pathname.split("/").filter(Boolean); // ["api","..."]

  if (req.method === "GET" && (u.pathname === "/" || u.pathname === "/index.html")) {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); return res.end(readFileSync(join(ROOT, "ui.html"), "utf8"));
  }
  if (req.method === "GET" && u.pathname === "/api/stream") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });
    res.write(`event: status\ndata: ${JSON.stringify(statusPayload())}\n\n`);
    clients.add(res); req.on("close", () => clients.delete(res)); return;
  }
  if (req.method === "GET" && u.pathname === "/api/status") return json(res, 200, statusPayload());

  // agregar / quitar cuenta:  POST /api/account/<network>/add | /remove  {id?}
  if (req.method === "POST" && parts[1] === "account") {
    const network = parts[2], action = parts[3];
    if (!NETWORKS.includes(network)) return json(res, 404, { ok: false, error: "red" });
    if (action === "add") { const a = addAccount(network); broadcast("status", statusPayload()); return json(res, 200, { ok: true, account: a }); }
    if (action === "remove") { const b = await readBody(req); removeAccount(network, b.id); broadcast("status", statusPayload()); return json(res, 200, { ok: true }); }
  }

  // login por cuenta:  POST /api/login/<network>/<accountId>/<open|save>
  if (req.method === "POST" && parts[1] === "login") {
    const network = parts[2], id = parts[3], action = parts[4];
    const acct = accountsOf(network).find((a) => a.id === id);
    if (!acct) return json(res, 404, { ok: false, error: "cuenta" });
    const key = `${network}:${id}`;
    try {
      if (action === "open") await openLoginTo(key, LOGIN_URL[network]);
      else if (action === "save") { await saveLoginTo(key, sessionPath(acct.session)); broadcast("status", statusPayload()); }
      else return json(res, 404, { ok: false });
      return json(res, 200, { ok: true });
    } catch (e) { return json(res, 500, { ok: false, error: e.message }); }
  }

  // escanear:  POST /api/scan/<network>  {ids?}
  if (req.method === "POST" && parts[1] === "scan") {
    const network = parts[2];
    if (!NETWORKS.includes(network)) return json(res, 404, { ok: false, error: "red" });
    if (running) return json(res, 409, { ok: false, error: "ya_corriendo" });
    const b = await readBody(req);
    runScan(network, Array.isArray(b.ids) && b.ids.length ? b.ids : null);
    return json(res, 200, { ok: true });
  }
  if (req.method === "POST" && u.pathname === "/api/stop") { stopFlag = true; return json(res, 200, { ok: true }); }

  json(res, 404, { ok: false, error: "not_found" });
});

server.listen(PORT, () => console.log(`\n🖥️  Panel de Promolog: abrí  http://localhost:${PORT}\n`));
