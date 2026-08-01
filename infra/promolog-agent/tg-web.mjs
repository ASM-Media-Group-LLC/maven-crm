// tg-web.mjs — cómo se lee el estado de Telegram Web. Lo comparten el joiner
// (tg-join.mjs) y el scraper (tg-scraper.mjs) para que los dos entiendan lo mismo
// por "ya soy miembro" / "me falta unirme" / "esto no cargó".
//
// La distinción importa más de lo que parece: el scraper escribe el informe que lee
// el equipo, y "la cuenta no es miembro" y "no cargó la página" piden cosas muy
// distintas (unirse vs reintentar). Confundirlas manda a Jhon a buscar donde no es.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// "REQUEST TO JOIN" también es unirse, solo que deja la cuenta esperando al admin.
export const JOIN_RE = /^(join|subscribe|unirse|unirme|suscribir|request to join|solicitar|enviar solicitud)/i;
export const APPROVAL_RE = /^(request to join|solicitar|enviar solicitud)/i;
const MEMBER_RE = /(mute|unmute|silenciar|activar|notificaciones|broadcast|message|mensaje|escrib)/i;
const DEAD_RE = /(expired|invalid|not (found|valid)|no longer|caducad|expirad|inválid|no existe|no válid)/i;
export const FLOOD_RE = /(flood|too many|too much|demasiad|try again later|intent[aá]lo de nuevo|wait a|espera)/i;

// Abre SIEMPRE con carga completa. Con `#…` la SPA de Telegram solo cambia el hash
// y se queda en el chat anterior: así fue como una promo de una creadora se le
// atribuyó a las 11 siguientes. about:blank en el medio garantiza el load limpio.
export async function abrir(page, url, esperaMs = 9000) {
  await page.goto("about:blank");
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
  await sleep(esperaMs);
}

// Foto del estado de la pantalla. No me caso con los nombres de clase de Telegram
// (cambian sin avisar): leo todos los botones visibles y decido por su texto.
export async function snapshot(page) {
  return page.evaluate(() => {
    const vis = (el) => !!(el && el.offsetParent !== null && el.getBoundingClientRect().height > 0);
    const txt = (el) => (el?.innerText || el?.textContent || "").trim().replace(/\s+/g, " ");
    const buttons = [];
    for (const el of document.querySelectorAll('button, .btn-primary, .popup-button, [role="button"]')) {
      if (!vis(el)) continue;
      const t = txt(el);
      if (!t || t.length >= 60) continue;
      // Marca el elemento EXACTO para poder clickearlo después con un click real del
      // mouse. Buscarlo por texto desde afuera agarraba el contenedor que envuelve al
      // botón, y el click caía en el lugar equivocado (parecía que no hacía nada).
      el.dataset.tgjoin = String(buttons.length);
      buttons.push({ idx: buttons.length, text: t, cls: (el.className || "").toString().slice(0, 80), tag: el.tagName });
    }
    const popupEl = [...document.querySelectorAll(".popup")].find(vis) || null;
    return {
      url: location.href,
      title: txt(document.querySelector(".chat-info .peer-title")) || null,
      bottomText: txt(document.querySelector(".chat-input")).slice(0, 200) || null,
      hasComposer: vis(document.querySelector(".input-message-input")),
      popup: popupEl ? { text: txt(popupEl).slice(0, 300), cls: (popupEl.className || "").toString().slice(0, 80) } : null,
      buttons: buttons.slice(0, 25),
      toast: txt([...document.querySelectorAll(".toast, .error, .popup-description")].find(vis)) || null,
      // Red de seguridad para lo que no encaje en nada: sin esto, un "desconocido"
      // es un callejón sin salida (no sabés ni qué mostró la pantalla).
      bodyText: txt(document.body).slice(0, 300),
    };
  });
}

// Traduce el snapshot a un estado. "desconocido" no se inventa: el crudo viaja con él.
export function estado(snap) {
  const all = [snap.popup?.text, snap.toast, snap.bottomText, ...snap.buttons.map((b) => b.text)].filter(Boolean).join(" | ");
  if (FLOOD_RE.test(all) && /join|unir|suscrib|subscribe/i.test(all)) return { state: "flood", detail: all.slice(0, 160) };
  const joinBtn = snap.buttons.find((b) => JOIN_RE.test(b.text));
  if (joinBtn) return { state: "falta", joinBtn, ...(APPROVAL_RE.test(joinBtn.text) ? { needsApproval: true } : {}) };
  if (DEAD_RE.test(snap.popup?.text || snap.toast || "")) return { state: "invalido", detail: (snap.popup?.text || snap.toast).slice(0, 160) };
  if (snap.title && (snap.hasComposer || MEMBER_RE.test(snap.bottomText || ""))) return { state: "ok" };
  // Abrió el chat y no ofrece unirse → adentro. "weak" = lo deduzco de que NO hay
  // botón de unirse, no de una señal positiva; queda marcado por si hay que revisar.
  if (snap.title) return { state: "ok", weak: true };
  return { state: "desconocido" };
}

// Segunda opinión, SIN cuenta: la landing pública de t.me. Un invite vivo trae la
// ficha del canal (tgme_page_title + foto); uno revocado/vencido devuelve la página
// genérica con el logo y nada más. Es lo que convierte un "no pude determinarlo"
// (callejón sin salida) en "el link está muerto, pedile otro a la creadora".
export async function inviteVivo(hash) {
  try {
    const r = await fetch(`https://t.me/+${hash}`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) return null;
    const html = await r.text();
    if (/tgme_page_title/.test(html)) return true;
    if (/tgme_page_icon/.test(html)) return false;
    return null;
  } catch { return null; }
}
