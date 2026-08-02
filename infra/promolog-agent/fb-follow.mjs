// fb-follow.mjs — releva y (opcionalmente) sigue las cuentas de Facebook de las
// creadoras con la cuenta scanner.
//
// POR QUÉ EXISTE: el scan de Facebook no puede leer lo que la cuenta no ve. En un
// perfil personal, Facebook restringe las publicaciones a los amigos; en una página
// pública alcanza con nada, pero seguirla mejora lo que aparece. Sin esto, la única
// salida a un "no_legible" era entrar a mano perfil por perfil.
//
// ⚠️ DOS ACCIONES MUY DISTINTAS, Y A PROPÓSITO NO SE TRATAN IGUAL:
//
//   · SEGUIR UNA PÁGINA es pasivo: la página no se entera de forma personal, es el
//     equivalente a suscribirse. Se hace con el botón "Seguir a las páginas".
//
//   · UNA SOLICITUD DE AMISTAD le llega a la creadora como notificación, con el
//     nombre y la foto de la cuenta scanner, y tiene que aceptarla una persona.
//     Eso no se manda de rebote: va detrás de su propio botón/flag (`amistad`).
//     Mismo criterio que el "REQUEST TO JOIN" de Telegram (ver tg-join.mjs), que ya
//     se decidió que no se mandara automático.
//
// Sin `seguir` no toca nada: solo releva y dice en qué estado está cada cuenta.

import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { MAVEN_URL, CRON_TOKEN, SESSIONS_DIR, HEADFUL, PACING } from "./config.mjs";
import { sleep } from "./agent-core.mjs";
import { sesionUsable } from "./session-check.mjs";
import { FB_SESSION } from "./fb-scraper.mjs";

const ESTADO_FILE = join(SESSIONS_DIR, "fb-membership.json");
const leerEstado = () => { try { return JSON.parse(readFileSync(ESTADO_FILE, "utf8")); } catch { return {}; } };
const guardarEstado = (s) => { mkdirSync(SESSIONS_DIR, { recursive: true }); writeFileSync(ESTADO_FILE, JSON.stringify(s, null, 2)); };

async function fetchTargets() {
  const r = await fetch(`${MAVEN_URL}/functions/v1/fb-scan`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-cron-token": CRON_TOKEN },
    body: JSON.stringify({ mode: "targets" }),
  });
  if (!r.ok) throw new Error(`targets ${r.status}`);
  const j = await r.json();
  return Array.isArray(j.targets) ? j.targets : [];
}

// `profile.php?id=…` y los `nombre.apellido.123` son PERFILES PERSONALES; el resto
// (/NombreDePagina) son páginas. La diferencia decide qué acción corresponde, así
// que se mira antes de tocar nada.
export function esPerfilPersonal(handleOUrl) {
  const s = String(handleOUrl || "");
  if (/profile\.php\?id=/i.test(s)) return true;
  const slug = s.replace(/^https?:\/\/(www\.|web\.|m\.)?facebook\.com\//i, "").replace(/[/?#].*$/, "");
  // Los perfiles personales de FB casi siempre son "nombre.apellido" o terminan en
  // un desambiguador numérico. Las páginas suelen ser una sola palabra o CamelCase.
  return /\.[a-z]/i.test(slug) || /\.\d+$/.test(slug);
}

/** Lee el estado del perfil abierto: qué botones hay y qué dicen.
 *
 *  ⚠️ Se MARCA el elemento exacto con un data-* en el mismo evaluate que lo
 *  encuentra, y después se clickea ESE. Buscar por texto desde Playwright agarraba
 *  el contenedor del botón en vez del botón (pasó en tg-join) y el clic no hacía nada.
 */
async function leerEstadoPerfil(page) {
  return await page.evaluate(() => {
    const norm = (s) => (s || "").trim().toLowerCase();
    // Los botones de FB son div[role=button] con aria-label, no <button>.
    const botones = Array.from(document.querySelectorAll('[role="button"], a[role="button"]'));
    const etiqueta = (el) => norm(el.getAttribute("aria-label") || el.innerText || "");

    let seguirEl = null, amistadEl = null;
    let yaSigue = false, yaAmigos = false, solicitudEnviada = false;

    for (const b of botones) {
      const t = etiqueta(b);
      if (!t || t.length > 40) continue;
      if (/^(siguiendo|following)$/.test(t)) yaSigue = true;
      else if (/^(amigos|friends)$/.test(t)) yaAmigos = true;
      else if (/(solicitud enviada|cancelar solicitud|request sent|cancel request)/.test(t)) solicitudEnviada = true;
      else if (!seguirEl && /^(seguir|follow)$/.test(t)) seguirEl = b;
      else if (!amistadEl && /(añadir a amigos|agregar a amigos|add friend)/.test(t)) amistadEl = b;
    }
    if (seguirEl) seguirEl.setAttribute("data-promolog-seguir", "1");
    if (amistadEl) amistadEl.setAttribute("data-promolog-amistad", "1");

    const txt = norm(document.body.innerText).slice(0, 500);
    return {
      yaSigue, yaAmigos, solicitudEnviada,
      puedeSeguir: !!seguirEl, puedeAmistad: !!amistadEl,
      // Si hay publicaciones visibles, la cuenta ya ve lo que necesita: seguir no
      // aportaría nada y no hay por qué gastar una acción.
      veMuro: document.querySelectorAll('[role="article"]').length > 0,
      noDisponible: /contenido no está disponible|content isn't available|página no encontrada|page not found/.test(txt),
    };
  });
}

// Tras clickear, FB tarda en reflejar el cambio. Mirar una sola vez reportaba "no
// surtió efecto" sobre acciones que SÍ habían funcionado (pasó con los joins de
// Telegram). Se sondea hasta ~12s antes de dar un veredicto.
async function esperarCambio(page, comprobar, ms = 12000) {
  const hasta = Date.now() + ms;
  while (Date.now() < hasta) {
    await sleep(1500);
    const e = await leerEstadoPerfil(page);
    if (comprobar(e)) return e;
  }
  return await leerEstadoPerfil(page);
}

export async function runFollowFb(opts = {}, { log = console.log, onResult = () => {}, shouldStop = () => false } = {}) {
  const OPTS = { seguir: false, amistad: false, max: 6, ...opts };
  if (!CRON_TOKEN) { log("⚠️ Falta CRON_INTERNAL_TOKEN en el .env."); return { error: "sin_token" }; }
  const sesion = sesionUsable(FB_SESSION, "facebook");
  if (!sesion.ok) { log(`⚠️ Facebook: ${sesion.motivo}. Logueá la cuenta en el panel.`); return { error: "sin_sesion" }; }

  const targets = await fetchTargets();
  const estado = leerEstado();
  const paginas = targets.filter((t) => !esPerfilPersonal(t.handle));
  const perfiles = targets.filter((t) => esPerfilPersonal(t.handle));

  // Decir QUÉ se mira y POR QUÉ. Un total pelado ("11 cuentas") no dice si hay algo
  // que hacer: lo que importa es el corte páginas / perfiles, porque se resuelven distinto.
  log(`\n📋 Cuentas de Facebook en Maven: ${targets.length}`);
  log(`   · ${paginas.length} páginas — públicas; seguirlas es pasivo, la creadora no recibe nada`);
  log(`   · ${perfiles.length} perfiles personales — solo se leen siendo AMIGOS, y la solicitud le llega a ella`);
  if (!OPTS.seguir) log(`\n👀 Solo relevo en qué estado está cada una — no toco nada.\n`);
  else log(`\n➡️ Voy a seguir las páginas que falten${OPTS.amistad ? " y a mandar solicitud de amistad a los perfiles" : " (sin mandar solicitudes de amistad)"} — tope ${OPTS.max}.\n`);

  const browser = await chromium.launch({ headless: !HEADFUL });
  const context = await browser.newContext({ storageState: FB_SESSION, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();
  const resumen = { ya_ok: 0, seguidas: 0, solicitudes: 0, pendientes: 0, no_disponibles: 0, fallidas: 0, detalle: [] };
  let acciones = 0;

  try {
    for (const t of targets) {
      if (shouldStop()) { log("⏹️ Detenido."); break; }
      const etiqueta = String(t.handle || "").replace(/^https?:\/\/(www\.|web\.|m\.)?facebook\.com\//i, "").slice(0, 50);
      const personal = esPerfilPersonal(t.handle);
      try {
        await page.goto(t.url, { waitUntil: "domcontentloaded", timeout: PACING.navTimeoutMs });
        await sleep(2500);
        let e = await leerEstadoPerfil(page);

        if (e.noDisponible) {
          resumen.no_disponibles++;
          resumen.detalle.push({ handle: etiqueta, estado: "no_disponible", nota: "la URL no abre nada — corregir el handle en Maven" });
          log(`❌ ${etiqueta}: no disponible (revisar el handle en Maven)`);
        } else if (e.yaAmigos || e.yaSigue || e.veMuro) {
          // Ya vemos lo que hace falta: no se gasta una acción social por gusto.
          resumen.ya_ok++;
          const como = e.yaAmigos ? "ya somos amigos" : e.yaSigue ? "ya la seguimos" : "el muro ya se ve sin seguirla";
          resumen.detalle.push({ handle: etiqueta, estado: "ok", nota: como });
          log(`✅ ${etiqueta}: ${como}`);
        } else if (e.solicitudEnviada) {
          resumen.pendientes++;
          resumen.detalle.push({ handle: etiqueta, estado: "pendiente", nota: "solicitud de amistad enviada, esperando que la acepte" });
          log(`⏳ ${etiqueta}: solicitud ya enviada, falta que la acepte`);
        } else if (!OPTS.seguir) {
          resumen.detalle.push({ handle: etiqueta, estado: personal ? "falta_amistad" : "falta_seguir", nota: personal ? "hay que mandarle solicitud de amistad" : "se puede seguir" });
          log(`· ${etiqueta}: ${personal ? "falta amistad" : "falta seguir"}`);
        } else if (acciones >= OPTS.max) {
          log(`(tope de ${OPTS.max} acciones esta tanda — ${etiqueta} queda para la próxima)`);
        } else if (!personal && e.puedeSeguir) {
          await page.click('[data-promolog-seguir="1"]').catch(() => {});
          acciones++;
          e = await esperarCambio(page, (x) => x.yaSigue);
          if (e.yaSigue) { resumen.seguidas++; log(`➕ ${etiqueta}: seguida`); resumen.detalle.push({ handle: etiqueta, estado: "seguida" }); }
          else { resumen.fallidas++; log(`⚠️ ${etiqueta}: el clic en Seguir no surtió efecto`); resumen.detalle.push({ handle: etiqueta, estado: "fallo_seguir" }); }
        } else if (personal && e.puedeAmistad) {
          if (!OPTS.amistad) {
            resumen.detalle.push({ handle: etiqueta, estado: "falta_amistad", nota: "requiere solicitud de amistad — activá la opción para mandarla" });
            log(`🔒 ${etiqueta}: es perfil personal, necesita SOLICITUD DE AMISTAD (le llega a ella). No la mando sin que lo pidas.`);
          } else {
            await page.click('[data-promolog-amistad="1"]').catch(() => {});
            acciones++;
            e = await esperarCambio(page, (x) => x.solicitudEnviada || x.yaAmigos);
            if (e.solicitudEnviada || e.yaAmigos) { resumen.solicitudes++; log(`📨 ${etiqueta}: solicitud de amistad enviada`); resumen.detalle.push({ handle: etiqueta, estado: "solicitud_enviada" }); }
            else { resumen.fallidas++; log(`⚠️ ${etiqueta}: el clic en Añadir a amigos no surtió efecto`); resumen.detalle.push({ handle: etiqueta, estado: "fallo_amistad" }); }
          }
        } else {
          // No hay botón de seguir ni de amistad y tampoco vemos el muro: es un caso
          // que no entendemos. Se dice así, en vez de contarlo como "ya está".
          resumen.fallidas++;
          resumen.detalle.push({ handle: etiqueta, estado: "sin_boton", nota: "no encontré botón de Seguir ni de Amistad, y el muro no se ve" });
          log(`❔ ${etiqueta}: no encontré botón de Seguir ni de Amistad, y el muro no se ve — mirar a mano`);
        }
        onResult({ handle: etiqueta, outcome: "fb_follow", red: "facebook" });
        estado[etiqueta] = { visto_at: new Date().toISOString(), ...(resumen.detalle.at(-1) ?? {}) };
      } catch (err) {
        resumen.fallidas++;
        log(`⚠️ ${etiqueta}: ${String(err.message).slice(0, 70)}`);
      }
      await sleep(PACING.minDelayMs + Math.random() * (PACING.maxDelayMs - PACING.minDelayMs));
    }
  } finally {
    guardarEstado(estado);
    await browser.close().catch(() => {});
  }

  log(`\n—— RESUMEN Facebook ——`);
  log(`✅ ya se pueden leer: ${resumen.ya_ok}   ➕ seguidas ahora: ${resumen.seguidas}   📨 solicitudes: ${resumen.solicitudes}`);
  if (resumen.pendientes) log(`⏳ solicitudes esperando aceptación: ${resumen.pendientes}`);
  if (resumen.no_disponibles) log(`❌ handles que no abren nada (corregir en Maven): ${resumen.no_disponibles}`);
  if (resumen.fallidas) log(`⚠️ no resueltas: ${resumen.fallidas}`);
  const faltaAmistad = resumen.detalle.filter((d) => d.estado === "falta_amistad");
  if (faltaAmistad.length) {
    log(`\n🔒 ${faltaAmistad.length} perfil(es) personal(es) necesitan SOLICITUD DE AMISTAD para poder leerse:`);
    for (const d of faltaAmistad) log(`   · ${d.handle}`);
    log(`   La solicitud le llega a la creadora con el nombre y la foto de la cuenta scanner.`);
  }
  log(`— terminado —`);
  return resumen;
}

// Uso por CLI:  node fb-follow.mjs                → solo releva
//               node fb-follow.mjs --seguir       → sigue las páginas que falten
//               node fb-follow.mjs --seguir --amistad  → además manda solicitudes
if (import.meta.url === `file://${process.argv[1]}`) {
  const has = (f) => process.argv.includes(f);
  await runFollowFb({ seguir: has("--seguir"), amistad: has("--amistad"), max: Number(process.argv.find((a) => /^--max=/.test(a))?.split("=")[1]) || 6 });
}
