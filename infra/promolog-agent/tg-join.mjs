// tg-join.mjs — mete a la cuenta dedicada de Telegram en los canales de las creadoras.
//
// POR QUÉ EXISTE: el scraper hacía `goto("https://t.me/+hash")` y buscaba un botón
// "Join" ahí. Esa página es la LANDING PÚBLICA de Telegram ("Open in Telegram") —
// no tiene sesión, no tiene UI de unirse, y su botón dispara el protocolo tg://
// que en un Chromium headless no lleva a ningún lado. O sea: el join NUNCA pasó.
// Los canales privados quedaban para siempre en "la cuenta no es miembro".
//
// CÓMO SE UNE DE VERDAD: por el deep link del web app,
//   web.telegram.org/k/#?tgaddr=tg://join?invite=<hash>
// que abre el popup real de invitación DENTRO de la sesión logueada.
//
// USO (siempre desde infra/promolog-agent):
//   node --env-file=.env tg-join.mjs                 → RELEVA nada más (no se une)
//   node --env-file=.env tg-join.mjs --join          → se une a los que faltan (tanda de 4)
//   node --env-file=.env tg-join.mjs --join --max 8  → tanda más grande
//   node --env-file=.env tg-join.mjs --all           → incluye también los canales públicos
//   node --env-file=.env tg-join.mjs --only moramay  → filtra por nombre/handle
//   ... --headless                                   → sin ventana (por defecto se ve)
//
// De a poco A PROPÓSITO: unirse a muchos canales seguidos es lo que dispara el
// FLOOD_WAIT de Telegram, y esta cuenta es la única que ve los canales privados.
// Tope por corrida + pausas largas + corte seco al primer síntoma de flood.

import { chromium } from "playwright";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { MAVEN_URL, CRON_TOKEN, TG_SESSION, SESSIONS_DIR } from "./config.mjs";
import { parseHandle } from "./tg-links.mjs";
import { abrir, snapshot, estado, inviteVivo, FLOOD_RE } from "./tg-web.mjs";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MEMBERSHIP_FILE = join(SESSIONS_DIR, "tg-membership.json");

// ── args ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const val = (f, d) => { const i = argv.indexOf(f); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const OPTS_CLI = {
  join: has("--join"),
  max: Number(val("--max", 4)),
  all: has("--all"),
  only: (val("--only", "") || "").toLowerCase(),
  headless: has("--headless"),
  debug: has("--debug"),
  // Unirse a un invite abierto es silencioso. "Solicitar unirse" NO: le aparece al
  // admin del canal (la creadora) una solicitud de esta cuenta, con nombre y foto.
  // Eso se pide a propósito, no de pasada.
  aprobacion: has("--pedir-aprobacion"),
};

// ── estado persistido: permite retomar la tanda siguiente donde quedó ────────
function readState() { try { return JSON.parse(readFileSync(MEMBERSHIP_FILE, "utf8")); } catch { return {}; } }
function writeState(s) { mkdirSync(SESSIONS_DIR, { recursive: true }); writeFileSync(MEMBERSHIP_FILE, JSON.stringify(s, null, 2)); }

async function fetchTargets() {
  const r = await fetch(`${MAVEN_URL}/functions/v1/telegram-scan`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-cron-token": CRON_TOKEN },
    body: JSON.stringify({ mode: "targets" }),
  });
  if (!r.ok) throw new Error(`targets ${r.status}`);
  return (await r.json()).targets ?? [];
}


// El panel (ui.mjs) lo llama con las mismas opciones que la CLI y recibe el
// progreso por `log` — Jhon armó la GUI para no depender de la terminal.
export async function runJoin(opts = {}, { log = console.log, shouldStop = () => false } = {}) {
  const OPTS = { join: false, max: 4, all: false, only: "", headless: true, debug: false, aprobacion: false, ...opts };
  if (!CRON_TOKEN) { log("⚠️ Falta CRON_INTERNAL_TOKEN en el .env"); return { error: "sin_token" }; }
  if (!existsSync(TG_SESSION)) { log(`⚠️ Falta la sesión de Telegram. Loguea la cuenta en el panel.`); return { error: "sin_sesion" }; }

  const targets = await fetchTargets();
  const prev = readState();
  const cand = [];
  const raros = [];
  let nPub = 0, nInv = 0;
  for (const t of targets) {
    const p = parseHandle(t.handle);
    if (p.kind === "unknown") { raros.push({ name: t.name, handle: t.handle, reason: p.reason }); continue; }
    if (p.kind === "public") nPub++; else nInv++;
    if (p.kind === "public" && !OPTS.all) continue;
    if (OPTS.only && !`${t.name} ${t.handle}`.toLowerCase().includes(OPTS.only)) continue;
    cand.push({ ...t, p, key: p.kind === "invite" ? `+${p.hash}` : `@${p.username}` });
  }

  // Decir QUÉ mira y POR QUÉ. "37 canales · 17 a revisar" no le dice nada a nadie:
  // parece que hay 17 pendientes de algo, cuando en realidad los 19 públicos
  // simplemente no necesitan que la cuenta esté adentro para leerse.
  const creadoras = new Set(targets.map((t) => t.creator_id)).size;
  log(`\n📋 Canales de Telegram en Maven: ${targets.length} (${creadoras} creadoras)`);
  log(`   · ${nPub} públicos (@usuario) — Telegram los deja ver SIN estar adentro, no hay nada que unir`);
  log(`   · ${nInv} privados (link de invitación) — solo se leen si la cuenta es MIEMBRO${OPTS.all ? "" : "  ← son los que miro"}`);
  if (raros.length) {
    log(`   · ${raros.length} con el handle mal cargado — no son un canal, hay que corregirlos en Maven:`);
    for (const r of raros) log(`       ${r.name}: ${r.handle}`);
  }
  log(OPTS.only ? `\n🔍 Filtrado por "${OPTS.only}": ${cand.length} canal(es).` : "");
  log(OPTS.join ? `🚪 Uniéndome a los que falten — tope de ${OPTS.max} esta tanda.\n` : `👀 Solo miro en cuáles ya estoy — no me uno a nada.\n`);

  const browser = await chromium.launch({ headless: OPTS.headless });
  const context = await browser.newContext({ storageState: TG_SESSION, viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const resumen = { ok: 0, falta: 0, unido: 0, pendiente: 0, invalido: 0, desconocido: 0 };
  let unidosEstaCorrida = 0, cortado = null;

  for (const t of cand) {
    if (shouldStop()) { log("■ detenido"); break; }
    // Los que ya sabemos adentro no se vuelven a tocar: cada apertura de invite es
    // una llamada más contra la cuenta, y no hay nada que ganar.
    // Con la solicitud ya enviada, el web app no vuelve a mostrar el popup: el canal
    // se lee como "no pude determinarlo" y, al reveer, pisaba el "pendiente" que sí
    // sabíamos. La espera de aprobación es un hecho nuestro, no algo que se releva.
    if (prev[t.key]?.state === "pendiente") { resumen.pendiente++; log(`⏳ ${t.name} — solicitud ya enviada, esperando al admin`); continue; }
    if (!OPTS.join && prev[t.key]?.state === "ok") { resumen.ok++; log(`✅ ${t.name} — ya adentro (relevado antes)`); continue; }
    if (OPTS.join && unidosEstaCorrida >= OPTS.max) { log(`\n⏸️  Tope de ${OPTS.max} alcanzado — el resto queda para la próxima tanda.`); break; }
    if (OPTS.join && prev[t.key]?.state === "ok") { resumen.ok++; continue; }

    await abrir(page, t.p.openUrl);
    let snap = await snapshot(page);
    let st = estado(snap);

    // El web app no mostró NADA (ni chat ni popup de invitación): casi siempre es un
    // link revocado. Lo confirmo contra la landing pública antes de afirmarlo.
    if (st.state === "desconocido" && t.p.kind === "invite") {
      const vivo = await inviteVivo(t.p.hash);
      if (vivo === false) st = { state: "invalido", detail: "el link ya no resuelve a ningún canal — hay que pedirle uno nuevo a la creadora" };
      else if (vivo === true) st = { state: "desconocido", detail: "el link vive pero el web app no lo abrió — reintentar" };
    }

    if (st.state === "falta" && st.needsApproval && OPTS.join && !OPTS.aprobacion) {
      st = { ...st, detail: "pide aprobación del admin — corre con --pedir-aprobacion si quieres que la cuenta se la mande" };
    } else if (st.state === "falta" && OPTS.join) {
      let clickErr = null;
      try { await page.click(`[data-tgjoin="${st.joinBtn.idx}"]`, { timeout: 8000 }); }
      catch (e) { clickErr = String(e.message).split("\n")[0].slice(0, 90); }
      // Unirse es un viaje al servidor de Telegram: no alcanza con mirar una vez.
      let after = null;
      for (let i = 0; i < 5 && !cortado; i++) {
        await sleep(3000);
        snap = await snapshot(page);
        after = estado(snap);
        if (after.state !== "falta") break;
      }
      const all = [snap.popup?.text, snap.toast, snap.bottomText].filter(Boolean).join(" | ");
      if (FLOOD_RE.test(all)) { cortado = `Telegram está limitando la cuenta: "${all.slice(0, 120)}"`; st = { state: "flood" }; }
      else if (/request sent|solicitud enviada|approval|aprobaci/i.test(all)) st = { state: "pendiente", detail: all.slice(0, 120) };
      else if (after.state === "falta") st = { state: "falta", detail: clickErr ? `el click falló: ${clickErr}` : `el botón "${st.joinBtn.text}" (${st.joinBtn.tag}.${st.joinBtn.cls.split(" ")[0]}) no surtió efecto` };
      else st = after.state === "ok" ? { state: "unido" } : after;
      unidosEstaCorrida++;
      if (OPTS.debug) log(`      post-click: ${JSON.stringify({ clickErr, title: snap.title, bottom: snap.bottomText, popup: snap.popup?.text?.slice(0, 120), btns: snap.buttons.map((b) => b.text).filter(Boolean).slice(0, 10) })}`);
    }

    const linea = { state: st.state, title: snap.title || null, at: new Date().toISOString(), ...(st.weak ? { weak: true } : {}), ...(st.detail ? { detail: st.detail } : {}) };
    prev[t.key] = linea; writeState(prev);
    resumen[st.state] = (resumen[st.state] ?? 0) + 1;

    const icon = { ok: "✅", unido: "🎉", falta: "🔒", pendiente: "⏳", invalido: "❌", desconocido: "❔", flood: "🛑" }[st.state] || "·";
    const nota = { ok: "ya es miembro", unido: "UNIDO", falta: OPTS.join ? "no se pudo unir" : (st.needsApproval ? "FALTA — el canal pide aprobación del admin" : "FALTA unirse"), pendiente: "solicitud enviada, espera aprobación del admin", invalido: "link vencido/inválido", desconocido: "no pude determinarlo", flood: "flood wait" }[st.state];
    log(`${icon} ${(t.name || "?").padEnd(22)} ${t.p.label.padEnd(14)} ${nota}${snap.title ? ` — "${snap.title}"` : ""}${st.detail ? ` (${st.detail})` : ""}`);
    if (st.state === "desconocido" || OPTS.debug) log(`      crudo: ${JSON.stringify({ title: snap.title, bottom: snap.bottomText, popup: snap.popup?.text?.slice(0, 160), toast: snap.toast, btns: snap.buttons.map((b) => b.text).filter(Boolean).slice(0, 10), body: snap.bodyText })}`);

    if (cortado) break;
    // Pausa larga después de UNIRSE (es la acción que Telegram cuenta); corta si solo miramos.
    await sleep(st.state === "unido" || st.state === "pendiente" ? 25000 + Math.random() * 20000 : 3000 + Math.random() * 3000);
  }

  await browser.close();

  const ROTULO = {
    ok: "ya estaba adentro", unido: "me uní recién", pendiente: "esperando que el admin acepte",
    falta: "falta unirse", invalido: "el link de invitación está muerto — pedirle uno nuevo a la creadora",
    desconocido: "no pude determinarlo", flood: "Telegram limitó la cuenta",
  };
  log(`\n━━━ RESUMEN ━━━`);
  for (const [k, v] of Object.entries(resumen)) if (v) log(`  ${v} ${ROTULO[k] ?? k}`);
  if (cortado) log(`\n🛑 CORRIDA CORTADA — ${cortado}\n   Deja descansar la cuenta unas horas antes de la próxima tanda.`);
  const faltan = Object.values(prev).filter((v) => v.state === "falta").length;
  if (faltan) log(`\n🔒 Faltan ${faltan} canal(es) — vuelve a apretar para la siguiente tanda.`);
  log(`(estado guardado en ${MEMBERSHIP_FILE})`);
  return { resumen, faltan, cortado, raros };
}

// CLI: solo cuando se ejecuta este archivo directo (importarlo no dispara nada).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runJoin(OPTS_CLI).catch((e) => { console.error("💥", e.message); process.exit(1); });
}
