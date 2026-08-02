// ui.mjs — panel web local del scanner. Cuentas DINÁMICAS por red (agregás desde
// el panel y el scan se reparte entre las que haya). Levanta un server en localhost
// y sirve ui.html. Se lanza con `npm run ui` o doble clic en abrir-panel.command.

import { createServer } from "node:http";
import { hostname as osHostname } from "node:os";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { EXT_TOKEN, CRON_TOKEN, MAVEN_URL, AGENT_ID, UI_HOST } from "./config.mjs";
import { runAccount, sleep, readCooldowns, sessionInfo, openLoginTo, saveLoginTo } from "./agent-core.mjs";
import { runTelegram } from "./tg-scraper.mjs";
import { runJoin } from "./tg-join.mjs";
import { runX } from "./x-scraper.mjs";
import { runFacebook } from "./fb-scraper.mjs";
import { NETWORKS, accountsOf, addAccount, removeAccount, sessionPath } from "./accounts.mjs";
import { getSchedules, setSchedule, marcarCorrida, vencidas, proximaCorrida, INTERVALOS } from "./schedules.mjs";

const ROOT = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.UI_PORT || 4599);
const HOST = UI_HOST;
const LOGIN_URL = {
  instagram: "https://www.instagram.com/accounts/login/",
  telegram: "https://web.telegram.org/k/",
  x: "https://x.com/login",
  facebook: "https://www.facebook.com/login",
};
const NET_LABEL = { instagram: "Instagram", telegram: "Telegram", x: "X", facebook: "Facebook" };

// ── SSE ───────────────────────────────────────────────────────────────────
const clients = new Set();
let running = false, stopFlag = false, lastResults = [];
function broadcast(evt, data) { const line = `event: ${evt}\ndata: ${JSON.stringify(data)}\n\n`; for (const r of clients) { try { r.write(line); } catch { /* */ } } }
const log = (msg) => broadcast("log", { msg, t: Date.now() });

// Última corrida por red, servida por promolog-scan-targets?mode=estado. Se
// cachea 60s: el estado se re-emite en cada cambio de la UI (agregar cuenta,
// abrir login…) y sin caché eso serían decenas de llamadas por minuto.
// Best-effort a propósito: si Maven no responde, el panel muestra el resto
// igual — el estado de las corridas es informativo, no bloquea escanear.
let ultimasCorridas = { redes: {}, at: 0, error: null };
async function refrescarUltimasCorridas() {
  if (!EXT_TOKEN || Date.now() - ultimasCorridas.at < 60_000) return;
  try {
    const r = await fetch(`${MAVEN_URL}/functions/v1/promolog-scan-targets?mode=estado`, {
      headers: { "x-ext-token": EXT_TOKEN },
    });
    const j = await r.json();
    ultimasCorridas = r.ok && j.ok
      ? { redes: j.redes ?? {}, at: Date.now(), error: null }
      : { redes: ultimasCorridas.redes, at: Date.now(), error: j.error || `HTTP ${r.status}` };
  } catch (e) {
    ultimasCorridas = { redes: ultimasCorridas.redes, at: Date.now(), error: e.message };
  }
}

function statusPayload() {
  const cds = readCooldowns();
  const sch = getSchedules();
  return {
    running, token_ok: !!EXT_TOKEN, cron_ok: !!CRON_TOKEN,
    intervalos: INTERVALOS,
    networks: NETWORKS.map((net) => ({
      network: net, label: NET_LABEL[net],
      ultima_corrida: ultimasCorridas.redes?.[net] ?? null,
      programacion: { ...sch[net], proxima: proximaCorrida(sch[net]) },
      accounts: accountsOf(net).map((a, i) => {
        const si = sessionInfo(sessionPath(a.session));
        const cd = cds[a.id] && Date.now() < cds[a.id] ? cds[a.id] : null;
        return { id: a.id, index: i, logged_in: si.exists, cooldown_until: cd };
      }),
    })),
    last_results: lastResults,
  };
}


// Momento de arranque: sirve para ver desde Maven si una máquina se reinició.
const ARRANCADO_AT = new Date().toISOString();

// ── LATIDO ──────────────────────────────────────────────────────────────────
// El agente corre en una máquina de la oficina, detrás del NAT: Maven no puede
// preguntarle nada. Si el equipo se reinicia, se corta internet o muere el panel,
// deja de escanear EN SILENCIO — pasó el 01/08 y costó media hora entender que el
// agente no estaba produciendo. Que el latido se corte ES la alerta.
// Best-effort: un latido fallido nunca frena un escaneo.
async function latir() {
  if (!EXT_TOKEN) return;
  try {
    const sch = getSchedules();
    await fetch(`${MAVEN_URL}/functions/v1/promolog-scan-targets?mode=latido`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ext-token": EXT_TOKEN },
      body: JSON.stringify({
        agent_id: AGENT_ID, hostname: osHostname(),
        detalle: {
          escaneando: running,
          puerto: PORT,
          // Qué redes tiene programadas: así desde Maven se ve si una máquina
          // quedó sin nada activo (que es una caída silenciosa distinta).
          programadas: NETWORKS.filter((n) => sch[n]?.activo),
          arrancado_at: ARRANCADO_AT,
        },
      }),
    });
  } catch { /* sin internet: el propio silencio es la señal */ }
}

async function runScan(network, onlyIds) {
  if (running) return;
  // El intervalo se cuenta desde la última lectura REAL, sea automática o a mano:
  // si acabás de escanear Telegram, el reloj no lo repite 3 minutos después.
  marcarCorrida(network);
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
      else if (network === "facebook") await runFacebook({ account, ...cbs });
    } catch (e) { log(`${network}/${a.id} falló: ${e.message}`); }
    if (stopFlag) break;
    await sleep(4000 + Math.random() * 4000);
  }
  running = false;
  log("— corrida terminada —"); broadcast("done", { at: Date.now() });
  // La corrida que acaba de terminar es justo la que hay que mostrar: se fuerza el
  // refresco (salteando la caché) para que el panel no siga mostrando la anterior.
  ultimasCorridas.at = 0;
  await refrescarUltimasCorridas();
  broadcast("status", statusPayload());
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
    // Al abrir el panel se busca el estado de las corridas antes del primer envío,
    // para que no aparezca "sin datos" y un segundo después se rellene.
    await refrescarUltimasCorridas();
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });
    res.write(`event: status\ndata: ${JSON.stringify(statusPayload())}\n\n`);
    clients.add(res); req.on("close", () => clients.delete(res)); return;
  }
  if (req.method === "GET" && u.pathname === "/api/status") { await refrescarUltimasCorridas(); return json(res, 200, statusPayload()); }

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

  // programación automática:  POST /api/schedule/<network>  {activo?, cada_horas?, desde?, hasta?}
  if (req.method === "POST" && parts[1] === "schedule") {
    const network = parts[2];
    if (!NETWORKS.includes(network)) return json(res, 404, { ok: false, error: "red" });
    try {
      setSchedule(network, await readBody(req));
      broadcast("status", statusPayload());
      return json(res, 200, { ok: true });
    } catch (e) { return json(res, 400, { ok: false, error: e.message }); }
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
  // canales de Telegram:  POST /api/tg-join  {join?, max?, aprobacion?}
  // Sin `join` solo releva (no se une a nada). Comparte el candado `running` con el
  // scan: una sola cuenta de Telegram, un solo navegador a la vez.
  if (req.method === "POST" && u.pathname === "/api/tg-join") {
    if (running) return json(res, 409, { ok: false, error: "ya_corriendo" });
    const b = await readBody(req);
    running = true; stopFlag = false; broadcast("status", statusPayload());
    runJoin({ join: !!b.join, max: Number(b.max) || 4, aprobacion: !!b.aprobacion, headless: true },
            { log, shouldStop: () => stopFlag })
      .catch((e) => log(`Telegram/canales falló: ${e.message}`))
      .finally(() => { running = false; broadcast("done", { at: Date.now() }); broadcast("status", statusPayload()); });
    return json(res, 200, { ok: true });
  }
  if (req.method === "POST" && u.pathname === "/api/stop") { stopFlag = true; return json(res, 200, { ok: true }); }

  json(res, 404, { ok: false, error: "not_found" });
});

// Sin esto, un panel ya abierto hace que el nuevo muera con un stack trace de Node
// en la ventana de Terminal — que para quien hizo doble clic es "se abrió en negro".
server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(`\n⚠️  Ya hay un panel abierto en el puerto ${PORT}.\n   Cerrá esa ventana de Terminal (o su pestaña) y volvé a hacer doble clic.\n   Si querés abrir OTRO en paralelo:  UI_PORT=4600 node --env-file=.env ui.mjs\n`);
    process.exit(1);
  }
  console.error(`\n⚠️  No se pudo levantar el panel: ${e.message}\n`);
  process.exit(1);
});
// ── RELOJ DE LAS CORRIDAS AUTOMÁTICAS ──────────────────────────────────────
// Un tick por minuto: barato, y con intervalos de horas no hace falta más fino.
// Dispara UNA red por vez porque hay un solo navegador y un solo lock: si hay dos
// vencidas, la segunda sale en el tick siguiente (no se pierde, se corre después).
// Si ya hay una corrida en curso —automática o lanzada a mano— no se toca nada.
setInterval(() => {
  if (running) return;
  const [red] = vencidas();
  if (!red) return;
  log(`⏰ corrida automática de ${NET_LABEL[red] ?? red}`);
  runScan(red, null).catch((e) => log(`⏰ ${red} falló: ${e.message}`));
}, 60_000);

// Latido: al arrancar y cada 5 min. Si esto deja de llegar, la máquina se cayó.
latir();
setInterval(latir, 5 * 60_000);

server.listen(PORT, HOST, () => {
  console.log(`\n🖥️  Panel de Promolog: abrí  http://localhost:${PORT}`);
  console.log(`   agente: ${AGENT_ID}  ·  escuchando en ${HOST}:${PORT}`);
  if (HOST === "127.0.0.1") console.log(`   (solo esta máquina. Para entrar por Tailscale: UI_HOST=<tu IP 100.x.y.z>)`);
  console.log("");
});
