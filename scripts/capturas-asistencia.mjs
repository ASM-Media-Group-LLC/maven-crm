import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Capturas de Asistencia y Mis días (20/11/2026) con el banco del harness (datos de ejemplo).
// Uso: npx vite --port 8097 (en otra terminal) y luego
//      node scripts/capturas-asistencia.mjs docs/capturas-asistencia
const BASE = process.env.BASE ?? "http://127.0.0.1:8097/harness.html";
const OUT = process.argv[2];
mkdirSync(OUT, { recursive: true });
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PUERTO = 9341;
const perfil = mkdtempSync(join(tmpdir(), "cdp-asis-"));
const chrome = spawn(CHROME, ["--headless=new", `--remote-debugging-port=${PUERTO}`, `--user-data-dir=${perfil}`, "--no-first-run",
  "--hide-scrollbars", "--force-device-scale-factor=1", "--lang=es-CO", "about:blank"], { stdio: "ignore" });
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
let ws;
for (let i = 0; i < 40; i++) {
  try {
    const lista = await (await fetch(`http://127.0.0.1:${PUERTO}/json/list`)).json();
    const pag = lista.find((t) => t.type === "page");
    if (pag) { ws = new WebSocket(pag.webSocketDebuggerUrl); break; }
  } catch { /* aún no */ }
  await espera(250);
}
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0;
const pend = new Map();
const errores = [];
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.method === "Runtime.exceptionThrown") errores.push(m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text);
  if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errores.push(m.params.args.map((a) => a.value ?? a.description).join(" ").slice(0, 300));
  if (m.id && pend.has(m.id)) { const p = pend.get(m.id); pend.delete(m.id); m.error ? p.no(new Error(m.error.message)) : p.si(m.result); }
});
const cdp = (method, params = {}) => new Promise((si, no) => { const i = ++id; pend.set(i, { si, no }); ws.send(JSON.stringify({ id: i, method, params })); });
await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `try { localStorage.setItem("app-language", "es"); } catch {}` });

async function foto(nombre, qs, ancho = 1440, alto = 900) {
  await cdp("Emulation.setDeviceMetricsOverride", { width: ancho, height: alto, deviceScaleFactor: 1, mobile: ancho < 500 });
  await cdp("Page.navigate", { url: `${BASE}?${qs}` });
  await espera(3500);
  const r = await cdp("Page.captureScreenshot", { format: "png" });
  writeFileSync(join(OUT, nombre), Buffer.from(r.data, "base64"));
  console.log("✓", nombre);
}
try {
  await foto("01-menu-antes-despues.png", "ver=menu-asistencia", 1000, 700);
  await foto("02-asistencia-hoy.png", "ver=asistencia&tab=hoy");
  await foto("03-asistencia-semana.png", "ver=asistencia&tab=calendario&vista=semana");
  await foto("04-asistencia-mes.png", "ver=asistencia&tab=calendario&vista=mes");
  await foto("05-asistencia-ausencias.png", "ver=asistencia&tab=ausencias");
  await foto("06-asistencia-registrar.png", "ver=asistencia&tab=ausencias&vista=registrar");
  await foto("07-asistencia-festivos.png", "ver=asistencia&tab=festivos");
  await foto("08-mis-dias.png", "ver=mis-dias");
  await foto("09-mis-dias-movil.png", "ver=mis-dias", 390, 844);
  await foto("10-asistencia-hoy-claro.png", "ver=asistencia&tab=hoy&tema=claro");
  await foto("11-asistencia-horarios.png", "ver=asistencia&tab=horarios");
} finally {
  console.log("errores:", [...new Set(errores)].slice(0, 10));
  ws.close();
  chrome.kill();
}
