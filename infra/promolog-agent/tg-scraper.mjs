// tg-scraper.mjs — Plan B LOCAL de Telegram. Dos vías:
//   • PÚBLICOS (t.me/<user> o @user): se leen por `t.me/s/<user>` — vista pública,
//     SIN login ni cuenta, con fetch pelado. Robusto.
//   • PRIVADOS (t.me/+invite): necesitan que la cuenta dedicada sea MIEMBRO. Se leen
//     con Playwright + web.telegram.org logueado.
//
// ESTE ARCHIVO SOLO LEE. Unirse a un canal es de tg-join.mjs — una acción deliberada,
// con tope y pausas, no algo que pase de rebote en medio de un scan (antes intentaba
// un click de "Join" acá que además nunca funcionó: la landing t.me/+hash no tiene
// sesión ni UI de unirse). Cuando el canal pide membresía, el scan lo dice en el
// informe y sigue: prefiero un "no revisado" honesto que un "no promocionó" falso.
//
// Los posts scrapeados se mandan a telegram-scan?mode=ingest → reusa la MISMA
// clasificación y persist que el gateway. Targets en vivo desde telegram-scan?mode=targets.

import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { MAVEN_URL, CRON_TOKEN, TG_SESSION, HEADFUL } from "./config.mjs";
import { sleep } from "./agent-core.mjs";
import { creatorSlot } from "./accounts.mjs";
import { parseHandle } from "./tg-links.mjs";
import { abrir, snapshot, estado, inviteVivo } from "./tg-web.mjs";

async function fetchTargets() {
  const r = await fetch(`${MAVEN_URL}/functions/v1/telegram-scan`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-cron-token": CRON_TOKEN },
    body: JSON.stringify({ mode: "targets" }),
  });
  if (!r.ok) throw new Error(`targets ${r.status}`);
  const j = await r.json();
  return Array.isArray(j.targets) ? j.targets : [];
}
// `unreadable` viaja al server para que quede en el INFORME de la corrida: lo que
// no se pudo leer tiene que ser visible (si no, un canal ilegible es invisible —
// no genera fila a propósito, para no escribir un "No" falso).
async function postIngest(items, unreadable = [], { acumulado = null, final = true } = {}) {
  if (!items.length && !unreadable.length && final !== true) return { ok: true };
  const r = await fetch(`${MAVEN_URL}/functions/v1/telegram-scan`, {
    method: "POST", headers: { "Content-Type": "application/json", "x-cron-token": CRON_TOKEN },
    body: JSON.stringify({ mode: "ingest", items, unreadable, acumulado, final }),
  });
  return r.json().catch(() => ({ ok: false }));
}
const FLUSH_EVERY = 6;  // ver x-scraper: veredicto por tandas, no al final

// ── PÚBLICO: t.me/s/<user> = vista previa pública del canal ───────────────────
// Devuelve:
//   null            → el canal NO tiene vista pública (privado / preview off). NO
//                     se manda al ingest: mandar posts:[] escribiría un "No" FALSO
//                     ("revisada · sin actividad") sobre un canal que ni pudimos leer.
//   []              → canal legible, sin posts en la ventana de horas.
//   [{text,permalink,date}]
//
// ⚠️ t.me/s devuelve SIEMPRE los últimos ~20 posts, sin filtrar por fecha (los de
// julietaspicy iban hasta el 16/06). Sin filtrar por `hours`, esos posts viejos
// entraban como promos de HOY. Por eso se extrae el <time datetime> de cada post,
// se filtra por ventana y se manda `date` (unix s) para que la fila caiga en SU día.
async function scrapePublic(user, hours = 24) {
  let html;
  try {
    const r = await fetch(`https://t.me/s/${user}`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    html = await r.text();
  } catch { return null; }
  // Sin widget de mensajes = canal sin vista pública (no es "canal vacío").
  if (!html.includes("tgme_widget_message")) return null;

  const posts = [];
  const cutoff = Date.now() - hours * 3600e3;
  // Un bloque por mensaje: se corta por el atributo data-post de cada burbuja.
  const blocks = html.split(/<div class="tgme_widget_message[ "]/).slice(1);
  for (const b of blocks) {
    const idM = b.match(/data-post="([^"]+)"/);
    if (!idM) continue;
    const timeM = b.match(/<time[^>]+datetime="([^"]+)"/);
    const ts = timeM ? Date.parse(timeM[1]) : NaN;
    if (Number.isFinite(ts) && ts < cutoff) continue;           // post viejo → fuera
    const txtM = b.match(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    const text = (txtM?.[1] || "")
      .replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, " ")
      .trim();
    posts.push({
      text,
      permalink: `https://t.me/${idM[1]}`,
      ...(Number.isFinite(ts) ? { date: Math.floor(ts / 1000) } : {}),
    });
    if (posts.length >= 30) break;
  }
  return posts;
}

// ── TELEGRAM WEB (sesión logueada) ───────────────────────────────────────────
// Lee CUALQUIER canal del que la cuenta sea MIEMBRO — tenga o no vista pública.
// Este era el hueco: para los canales con username el scraper solo probaba
// t.me/s (vista pública SIN cuenta) y si estaba desactivada se rendía… teniendo
// la sesión al lado. Verificado: la cuenta local es miembro de 15+ canales y
// abriendo el deep link del web app se leen sus mensajes sin problema.
//
// Cada mensaje trae data-timestamp (unix s) y data-mid → fecha real + permalink
// estable para el dedup (nada de meter posts viejos como de hoy).
//
// Devuelve  { titulo, msgs }            → leído
//           { noMiembro, needsApproval } → hay que unirse primero (tg-join.mjs)
//           { invalido, detail }         → el link no lleva a ningún canal
//           null                         → no cargó / no se pudo determinar
async function scrapeTelegramWeb(page, p, hours = 24) {
  // ⚠️ CARGA COMPLETA OBLIGATORIA (la hace `abrir`): con `#…` solo cambia el HASH y
  // la SPA NO cambia de chat → se leían los mensajes del chat anterior y se le
  // atribuía la promo de una creadora a TODAS las siguientes (pasó: 12 canales con
  // el mismo texto).
  try { await abrir(page, p.openUrl, 8000); } catch { return null; }

  const snap = await snapshot(page);
  let st = estado(snap);
  // Un invite revocado no da error: el web app simplemente no abre nada. Sin esta
  // segunda opinión (la landing pública de t.me, sin cuenta) el informe decía
  // "reintentar" para siempre sobre un link que nunca va a funcionar.
  if (st.state === "desconocido" && p.kind === "invite" && (await inviteVivo(p.hash)) === false) {
    st = { state: "invalido" };
  }
  if (st.state === "falta") return { noMiembro: true, needsApproval: !!st.needsApproval, titulo: snap.title };
  if (st.state === "invalido") return { invalido: true, detail: st.detail };
  if (st.state !== "ok") return null;

  const user = p.kind === "public" ? p.username : null;
  const cutoff = Math.floor((Date.now() - hours * 3600e3) / 1000);
  try {
    const msgs = await page.evaluate(({ cut, uname }) => {
      const out = [];
      for (const el of document.querySelectorAll(".bubble")) {
        const tsRaw = el.getAttribute("data-timestamp") || el.querySelector("[data-timestamp]")?.getAttribute("data-timestamp");
        const ts = Number(tsRaw);
        if (!Number.isFinite(ts) || ts < cut) continue;        // sin fecha o viejo → fuera
        const txt = (el.querySelector(".message")?.innerText || "").trim();
        const mid = el.getAttribute("data-mid");
        if (!txt) continue;
        out.push({
          text: txt.slice(0, 1500),
          date: ts,
          permalink: uname && mid ? `https://t.me/${uname}/${String(mid).slice(-6)}` : null,
        });
      }
      return out.slice(-30);
    }, { cut: cutoff, uname: user });
    // GUARDA DE IDENTIDAD: además de abrir, hay que confirmar QUÉ chat se abrió.
    // Devolvemos el título del canal; el caller verifica que no se repita entre
    // creadoras distintas (así un fallo de navegación no vuelve a atribuir mal).
    return { titulo: snap.title, msgs };
  } catch { return null; }
}

export async function runTelegram({ account = { sessionFile: TG_SESSION, index: 0, count: 1 }, log = () => {}, onResult = () => {}, shouldStop = () => false } = {}) {
  if (!CRON_TOKEN) { log("⚠️ Falta CRON_INTERNAL_TOKEN en el .env — Telegram/X lo necesitan."); return; }
  const { sessionFile, index, count } = account;
  let targets = await fetchTargets();
  // Reparto: si hay N cuentas de Telegram, esta lee su parte (por hash del creator_id).
  if (count > 1) targets = targets.filter((t) => creatorSlot(t.creator_id, count) === index);
  log(`▶️ Telegram cuenta ${index + 1}/${count}: ${targets.length} canales (en vivo desde Maven).`);
  // Un solo parseo para todos (tg-links.mjs). Lo que no es ni público ni invite NO se
  // descarta en silencio: antes un handle raro (hash pelado sin t.me, un link t.me/m/…)
  // no entraba en ninguna de las dos listas y desaparecía del scan — ni leído ni
  // reportado. Un canal invisible es peor que uno que falla.
  const conP = targets.map((t) => ({ ...t, p: parseHandle(t.handle) }));
  const pub = conP.filter((t) => t.p.kind === "public");
  const priv = conP.filter((t) => t.p.kind === "invite");
  const raros = conP.filter((t) => t.p.kind === "unknown");

  // 1) PÚBLICOS (sin cuenta)
  const batch = [];
  const handleByCreator = new Map();
  const noLegibles = [];   // {handle, reason} → van al informe de la corrida
  for (const t of raros) noLegibles.push({ handle: t.name, reason: `el handle de Telegram guardado en Maven no es un canal: "${t.handle}" — hay que corregirlo en la ficha de la creadora` });
  const acc = { leidos: 0, con_promo: 0, sin_promo: 0, leidos_sin_posts: 0, detalle_con_promo: [] };
  const porWeb = [];   // públicos sin preview → se intentan con la sesión
  let ultimoTitulo = null;   // guarda anti-atribución cruzada (ver scrapeTelegramWeb)
  const aplicar = (res) => {
    for (const r of (res?.results ?? [])) {
      const h = handleByCreator.get(r.creator_id) ?? r.source_handle ?? "?";
      acc.leidos++;
      if (r.promoted > 0) { acc.con_promo++; acc.detalle_con_promo.push({ handle: h, promos: r.promoted }); onResult({ handle: h, outcome: "con_promo", stories: r.promoted, red: "telegram" }); log(`   ✅ @${h} PROMOCIONÓ (${r.promoted})`); }
      else if (r.posts > 0) { acc.sin_promo++; onResult({ handle: h, outcome: "sin_promo", stories: r.posts, red: "telegram" }); }
      else { acc.leidos_sin_posts++; }
    }
  };
  for (const t of pub) {
    if (shouldStop()) break;
    const user = t.p.username;
    handleByCreator.set(t.creator_id, user);
    let posts = await scrapePublic(user);
    if (posts == null) porWeb.push(t);                        // sin preview → lo intenta la sesión
    if (posts == null) {
      log(`· @${user}: sin vista pública, lo intento con la sesión de Telegram`);
    } else {
      batch.push({ creator_id: t.creator_id, source_handle: t.handle, posts });
      log(`${posts.length ? "✅" : "·"} @${user}: ${posts.length} posts en las últimas 24h`);
      onResult({ handle: user, outcome: posts.length ? "leido" : "sin_posts", stories: posts.length, red: "telegram" });
    }
    if (batch.length >= FLUSH_EVERY) aplicar(await postIngest(batch.splice(0, batch.length), [], { acumulado: acc, final: false }));
    await sleep(1200 + Math.random() * 1500);
  }

  // 2) POR SESIÓN (Telegram Web): los públicos sin preview + los privados por invite.
  const porSesion = [...porWeb, ...priv];
  if (porSesion.length) {
    if (!existsSync(sessionFile)) { for (const t of porSesion) noLegibles.push({ handle: t.name, reason: "necesita cuenta de Telegram logueada en el agente (no hay sesión)" }); log(`⚠️ ${porSesion.length} canales sin leer: falta login de la cuenta de Telegram (logueala en el panel).`); }
    else if (!shouldStop()) {
      const browser = await chromium.launch({ headless: !HEADFUL });
      const context = await browser.newContext({ storageState: sessionFile, viewport: { width: 1280, height: 900 } });
      const page = await context.newPage();
      for (const t of porSesion) {
        if (shouldStop()) break;
        const etiqueta = t.p.kind === "public" ? t.p.username : (t.name || t.p.label);
        handleByCreator.set(t.creator_id, etiqueta);
        const leido = await scrapeTelegramWeb(page, t.p);
        // Falta membresía / link muerto: son diagnósticos DISTINTOS de "no cargó", y
        // cada uno pide una acción distinta. Decirlos con nombre es lo que hace que el
        // informe sirva para algo en vez de mandar a Jhon a adivinar.
        if (leido?.noMiembro) {
          noLegibles.push({ handle: etiqueta, reason: leido.needsApproval
            ? `la cuenta no es miembro y el canal pide aprobación del admin — correr: node --env-file=.env tg-join.mjs --join --pedir-aprobacion --only ${etiqueta}`
            : "la cuenta no es miembro del canal — correr: node --env-file=.env tg-join.mjs --join" });
          log(`🔒 ${etiqueta}: falta unirse al canal`); onResult({ handle: etiqueta, outcome: "no_legible", red: "telegram" });
          await sleep(3000); continue;
        }
        if (leido?.invalido) {
          noLegibles.push({ handle: etiqueta, reason: "el link de invitación ya no lleva a ningún canal (revocado o vencido) — hay que pedirle uno nuevo a la creadora y actualizarlo en Maven" });
          log(`❌ ${etiqueta}: link de invitación muerto`); onResult({ handle: etiqueta, outcome: "no_legible", red: "telegram" });
          await sleep(3000); continue;
        }
        // Anti-atribución cruzada: si el chat abierto es el MISMO que el del target
        // anterior, la navegación falló → no se atribuye nada.
        if (leido && leido.titulo && leido.titulo === ultimoTitulo) {
          noLegibles.push({ handle: etiqueta, reason: `no se pudo abrir su canal (Telegram Web quedó en "${leido.titulo}") — no se le atribuye nada` });
          log(`🔒 ${etiqueta}: la navegación no cambió de chat → descartado`); onResult({ handle: etiqueta, outcome: "no_legible", red: "telegram" });
          await sleep(3000); continue;
        }
        if (leido) ultimoTitulo = leido.titulo;
        const posts = leido ? leido.msgs : null;
        // Si no se pudo leer, NO se manda posts:[] (sería un "No" falso).
        if (posts == null) {
          noLegibles.push({ handle: etiqueta, reason: "no se pudo abrir el canal en Telegram Web (no cargó o quedó a medias) — reintentar" });
          log(`🔒 ${etiqueta}: no se pudo leer — no se marca nada`); onResult({ handle: etiqueta, outcome: "no_legible", red: "telegram" });
        } else if (posts.length === 0) {
          // CONSERVADOR: por esta vía, 0 mensajes NO se afirma como "no promocionó"
          // (podrían no haber cargado, o ser posts solo-media sin texto). Queda como
          // no revisado y lo cubre el gateway, que lee por API y sí distingue.
          noLegibles.push({ handle: etiqueta, reason: "abrió el canal pero no se leyeron mensajes de las últimas 24h (posible carga parcial o posts sin texto) — no se afirma nada" });
          log(`· ${etiqueta}: sin mensajes legibles → no se marca nada`); onResult({ handle: etiqueta, outcome: "no_legible", red: "telegram" });
        } else {
          batch.push({ creator_id: t.creator_id, source_handle: t.handle, posts });
          log(`✅ ${etiqueta}: ${posts.length} posts (por sesión)`);
          onResult({ handle: etiqueta, outcome: posts.length ? "leido" : "sin_posts", stories: posts.length, red: "telegram" });
          if (batch.length >= FLUSH_EVERY) aplicar(await postIngest(batch.splice(0, batch.length), [], { acumulado: acc, final: false }));
        }
        await sleep(3000 + Math.random() * 3000);
      }
      await browser.close();
    }
  }

  const res = await postIngest(batch, noLegibles, { acumulado: acc, final: true });
  aplicar(res);
  const R = res?.resumen;
  if (R) {
    log(`━━━ INFORME TELEGRAM ━━━`);
    log(`✅ CON promo: ${R.con_promo}${R.detalle_con_promo?.length ? " → " + R.detalle_con_promo.map((d) => d.handle).join(", ") : ""}`);
    log(`· sin promo (leídos): ${R.sin_promo}   · leídos sin posts nuevos: ${R.leidos_sin_posts}`);
    log(`🔒 NO se pudieron revisar: ${R.no_legibles}`);
    for (const d of (R.detalle_no_legibles ?? [])) log(`     · ${d.handle} — ${d.motivo}`);
    log(`(el informe queda guardado; el bot lo lee con get_promolog_scan_report)`);
  } else log(`◀️ Telegram: ${batch.length} leídos · ${noLegibles.length} no legibles.`);
  return res;
}
