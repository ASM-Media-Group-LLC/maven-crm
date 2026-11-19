// Capturas de la plataforma (datos de ejemplo) con Chrome headless por CDP.
// Uso: node capturas.mjs <baseUrl> <carpetaSalida>
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.argv[2] ?? "http://localhost:8091";
const OUT = process.argv[3];
mkdirSync(OUT, { recursive: true });
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const PUERTO = 9333;
const perfil = mkdtempSync(join(tmpdir(), "cdp-plataforma-"));
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
const pendientes = new Map();
ws.addEventListener("message", (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pendientes.has(m.id)) { const p = pendientes.get(m.id); pendientes.delete(m.id); m.error ? p.no(new Error(m.error.message)) : p.si(m.result); }
});
const cdp = (method, params = {}) => new Promise((si, no) => { const i = ++id; pendientes.set(i, { si, no }); ws.send(JSON.stringify({ id: i, method, params })); });

const ANCHO = 1440, ALTO = 900;
await cdp("Page.enable");
await cdp("Runtime.enable");
await cdp("Emulation.setDeviceMetricsOverride", { width: ANCHO, height: ALTO, deviceScaleFactor: 1, mobile: false });
let tema = "dark";
await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `try { localStorage.setItem("app-language", "es"); localStorage.setItem("theme", window.__tema || "${tema}"); } catch {}` });

const js = async (expr) => {
  const r = await cdp("Runtime.evaluate", { expression: `(async () => { ${AYUDA}; ${expr} })()`, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(`${expr}\n→ ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
  return r.result.value;
};
const AYUDA = `
  const poner = (sel, v) => { const el = document.querySelector(sel); if (!el) throw new Error('sin ' + sel);
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
  const clic = (txt, raiz = document) => { const b = [...raiz.querySelectorAll('button,a,[role=button],[role=tab]')].find((e) => e.textContent.trim().includes(txt));
    if (!b) throw new Error('sin botón ' + txt); b.click(); };
  const clicSel = (sel) => { const el = document.querySelector(sel); if (!el) throw new Error('sin ' + sel); el.click(); };
`;

async function ir(ruta, ms = 1800) {
  await cdp("Page.navigate", { url: BASE + ruta });
  await espera(ms);
}
async function foto(nombre, completa = false) {
  await espera(450);
  let clip;
  if (completa) {
    const alto = await js(`return Math.ceil(Math.max(document.documentElement.scrollHeight, document.body.scrollHeight));`);
    await cdp("Emulation.setDeviceMetricsOverride", { width: ANCHO, height: Math.max(ALTO, alto), deviceScaleFactor: 1, mobile: false });
    await espera(400);
    clip = { x: 0, y: 0, width: ANCHO, height: Math.max(ALTO, alto), scale: 1 };
  }
  const r = await cdp("Page.captureScreenshot", { format: "png", ...(clip ? { clip, captureBeyondViewport: true } : {}) });
  writeFileSync(join(OUT, nombre), Buffer.from(r.data, "base64"));
  if (completa) await cdp("Emulation.setDeviceMetricsOverride", { width: ANCHO, height: ALTO, deviceScaleFactor: 1, mobile: false });
  console.log("✓", nombre);
}

try {
  // Arranque: prende el mock en esta pestaña (sessionStorage).
  await ir("/plataforma?plataforma=mock&como=dueno", 4000);
  console.log(await js(`return location.href + ' | ' + sessionStorage.getItem('maven.plataforma.modo')`));

  await ir("/plataforma?como=dueno");
  await foto("01-panel-dueno.png", true);

  await ir("/plataforma?como=grace");
  await foto("02-panel-grace-sin-precios.png", true);

  await ir("/plataforma?como=dueno");
  await js(`clic('Mostrar a un cliente')`);
  await foto("03-mostrar-a-un-cliente.png");

  // Asistente «Nuevo cliente»
  await ir("/plataforma?como=dueno");
  await js(`clic('Nuevo cliente')`); await espera(500);
  await js(`poner('#nc-nombre', 'Lumen Clinic'); poner('#nc-an', 'Sara Ruiz'); poner('#nc-ac', 'sara@lumenclinic.co');`);
  await foto("04-nuevo-cliente-1-datos.png");
  await js(`clic('Siguiente')`); await espera(400);
  await js(`clicSel('[data-plan=empresa]')`); await espera(300);
  await foto("05-nuevo-cliente-2-plan.png");
  await js(`clic('Siguiente')`); await espera(400);
  await foto("06-nuevo-cliente-3-marca.png");
  await js(`clic('Crear en preparación')`); await espera(1500);
  await foto("07-pendientes-cliente-nuevo.png", true);

  // Pendientes de Cliente Demo: «Activar» pide confirmar
  await ir("/mi-empresa?org=org-demo&como=dueno");
  await js(`clic('Activar')`); await espera(300);
  await foto("08-pendientes-activar-confirmar.png");

  // Panel del admin del cliente (Nova Studio)
  await ir("/mi-empresa?como=cliente");
  await foto("09-mi-empresa-admin-cliente.png", true);
  await js(`clicSel('[data-agregar-persona]')`); await espera(500);
  await foto("10-agregar-persona.png");

  await ir("/mi-empresa/plan?como=cliente");
  await foto("11-mi-plan-y-pagos.png", true);

  // Atlas Dental: plan lleno, pago en gracia, Argos sin saldo
  await ir("/mi-empresa?org=org-atlas&como=dueno");
  await foto("12-atlas-gracia-y-argos-pausado.png", true);
  await js(`clicSel('[data-agregar-persona]')`); await espera(500);
  await js(`poner('#ap-n', 'Nueva Persona'); poner('#ap-c', 'nueva@atlasdental.com');`);
  await js(`clic('Crear cuenta y enviar invitación')`); await espera(900);
  await foto("13-plan-lleno-error.png");

  await ir("/mi-empresa/plan?org=org-atlas&como=dueno");
  await foto("14-atlas-plan-y-pagos-gracia.png", true);

  // Ver como
  await ir("/plataforma?como=dueno");
  await js(`clic('Ver como')`); await espera(700);
  await foto("15-ver-como-por-rol.png");
  await js(`clicSel('[role=tab]:nth-child(3)')`); await espera(900);
  await foto("16-ver-como-persona.png");
  await js(`clicSel('[role=tab]:nth-child(2)')`); await espera(500);
  await js(`clic('Nova Studio', document.querySelector('[role=dialog]'))`); await espera(1500);
  await foto("17-ver-como-banner-volver-a-ser-yo.png", true);

  await ir("/plataforma?como=dueno");
  await js(`clic('Ver como')`); await espera(700);
  await js(`clic('Empleado')`); await espera(1500);
  await foto("18-ver-como-empleado.png");

  // Historial y Equipo de Maven
  await ir("/mi-empresa?como=cliente");
  await js(`clic('Historial')`); await espera(700);
  await foto("19-historial.png");

  await ir("/plataforma/equipo?como=dueno");
  await foto("20-equipo-de-maven.png");

  // Tema claro
  await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `try { localStorage.setItem("theme", "light"); } catch {}` });
  await ir("/plataforma?como=dueno");
  await foto("21-panel-dueno-tema-claro.png", true);
  await ir("/mi-empresa?como=cliente");
  await foto("22-mi-empresa-tema-claro.png", true);
} catch (e) {
  console.error("FALLÓ:", e.message);
  process.exitCode = 1;
} finally {
  ws.close();
  chrome.kill();
}
