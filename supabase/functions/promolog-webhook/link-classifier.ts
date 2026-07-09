// link-classifier.ts — clasifica el DESTINO real de un sticker de link de una story
// de Instagram para decidir si es un CTA a CONTENIDO PAGO (promo) o no.
//
// Por qué existe: el scraper devuelve `linkUrl` cuando la creadora pegó un sticker
// de link, pero NO todo link es promo. Un link a su OnlyFans/funnel SÍ; uno a
// YouTube/Spotify/otra red NO. El check ingenuo "hay link → promo" generaba falsos
// positivos (caso elizabethloaiza: stories con link a YouTube marcadas como promo).
//
// El link suele venir envuelto por Instagram como:
//   https://l.instagram.com/?u=<URL_REAL_url-encoded>&e=...
// hay que DESENVOLVER (incluso anidado/doble-encoded) y clasificar el host real.
//
// Objetivo declarado: CERO falsos positivos. Ante destino no reconocido → "unknown"
// (no se asume promo). Listas curadas + red-team de casos borde (2026-06-24).

export type LinkTier = "paid" | "aggregator" | "casino" | "nonpaid" | "unknown" | "none";

export interface LinkClass {
  tier: LinkTier;
  platform: string | null; // etiqueta de plataforma para buy_link_type (onlyfans/piclink/…)
  host: string; // hostname final (sin www, lowercase)
  decoded: string; // URL destino decodificada (host+path), para auditar
}

// ── Wrappers de redirección (NO son destino; hay que leer su parámetro) ──────
const WRAPPER_HOSTS: Record<string, string> = {
  "l.instagram.com": "u",
  "lm.facebook.com": "u",
  "l.facebook.com": "u",
  "l.messenger.com": "u",
  "away.vk.com": "to",
};

// ── Plataformas de contenido PAGO directo (host → etiqueta) ──────────────────
const PAID: Record<string, string> = {
  "onlyfans.com": "onlyfans",
  "onlyfans.co": "onlyfans",
  "fansly.com": "fansly",
  "fans.ly": "fansly",
  "fanvue.com": "fanvue",
  "manyvids.com": "manyvids",
  "fancentro.com": "fancentro",
  "justfor.fans": "justforfans",
  "admireme.vip": "admireme",
  "ifans.com": "ifans",
  "ppv.to": "ppv",
  "loyalfans.com": "loyalfans",
  "mym.fans": "mym",
  "4based.com": "4based",
  // procesadores de cobro adult: un link que aterriza acá es un paso de pago de contenido
  "ccbill.com": "other",
  "segpay.com": "other",
  "verotel.com": "other",
  "epoch.com": "other",
};

// ── Agregadores / link-in-bio / funnels (host → etiqueta) ────────────────────
// Para estas modelos el agregador es el embudo a su OF → cuenta como promo.
const AGGREGATOR: Record<string, string> = {
  "linktr.ee": "linktree",
  "linktree.com": "linktree",
  "beacons.ai": "beacons",
  "allmylinks.com": "allmylinks",
  "allmylinks.io": "allmylinks",
  "snipfeed.co": "snipfeed",
  "hoo.be": "hoobe",
  "solo.to": "soloto",
  "lnk.bio": "lnkbio",
  "tap.bio": "tapbio",
  "carrd.co": "carrd",
  "komi.io": "komi",
  "stan.store": "stanstore",
  "piclink.me": "onlyfans", // pedido del owner: piclink embuda a OF → contarlo/etiquetarlo como OnlyFans
  "link.me": "linkme",
  "unlok.me": "unlok", // funnel propio de la agencia (marca Unlok) → embuda a OF
  "unlok.com": "unlok",
  "withkoji.com": "withkoji",
  "koji.to": "withkoji",
  "direct.me": "directme",
  "campsite.bio": "campsite",
  "msha.ke": "milkshake",
  "linkin.bio": "linkinbio",
  "linkpop.com": "linkpop",
  "bio.link": "biolink",
  "biosites.com": "biosites",
  "shorby.com": "shorby",
  "shor.by": "shorby",
  "taplink.cc": "taplink",
  "supalink.ai": "supalink", // link-in-bio/smart-link → embuda a OF
  "flowcode.com": "flowpage",
  "flow.page": "flowpage",
  "mtr.bio": "metricool",
  "tappy.link": "tappy",
  "linkkle.com": "linkkle",
  "linq.app": "linq",
  "ottr.to": "ottr",
  "vip.fans": "vipfans",
  "magic.ly": "magicly",
  "ko-fi.com": "kofi",
  "about.me": "aboutme",
  // smartlinks de música (lnk.to/fanlink): nacieron para streaming → ambiguos,
  // pero raros en estas modelos; se tratan como funnel (baja frecuencia).
  "fanlink.to": "fanlink",
  "lnk.to": "lnkto",
};

// ── Dominios NO-PAGOS (host → ) — link acá NO es promo ───────────────────────
const NONPAID = new Set<string>([
  "youtube.com", "youtu.be",
  "spotify.com", "open.spotify.com", "music.apple.com",
  "tiktok.com", "instagram.com", "facebook.com", "twitter.com", "x.com",
  "threads.net", "snapchat.com", "pinterest.com", "twitch.tv", "kick.com",
  "t.me", "telegram.me", "telegram.org", "wa.me", "api.whatsapp.com",
  "amazon.com", "amazon.es", "amazon.com.mx", "amazon.com.co", "amzn.to",
  "shein.com", "depop.com", "etsy.com",
  "mercadolibre.com", "mercadolibre.cl", "mercadolibre.com.co", "mercadolibre.com.ar",
  "gofundme.com", "change.org", "throne.com",
  "paypal.com", "paypal.me",
  "google.com", "forms.gle", "docs.google.com", "news.google.com",
  "wordpress.com", "blogspot.com", "medium.com",
  "eltiempo.com", "emol.com", "latercera.com", "infobae.com",
]);

// ── Acortadores opacos: el destino real no es visible sin seguir la redirección.
//    No se asume promo (precisión > recall, por pedido). → unknown.
const SHORTENERS = new Set<string>([
  "bit.ly", "cutt.ly", "tinyurl.com", "t.co", "linktw.in",
  "rb.gy", "is.gd", "ow.ly", "buff.ly", "shorturl.at", "rebrand.ly",
]);

// Casino / apuestas / "gana dinero" — links de AFILIADO que las creadoras postean
// por pago; NO son su contenido pago. Se descartan como NO promo (no "a revisar"),
// aunque la visión los haya marcado. Lista explícita + patrón conservador en el host.
const CASINO = new Set<string>([
  "tucasinoencasa.com",
  "betplay.com.co", "wplay.co", "rushbet.co", "codere.com", "stake.com",
  "1xbet.com", "betano.com", "betwinner.com", "bet365.com", "rivalry.com",
]);
const CASINO_HOST_RE = /casino|apuestas?|tragamonedas|ruleta|jackpot|ganadinero|ganardinero|hazdinero/i;

// match por SUFIJO DE LABEL (no substring): así "m.onlyfans.com" matchea
// "onlyfans.com" pero "evilonlyfans.com" NO.
function matchSuffix(host: string, domains: Iterable<string>): string | null {
  for (const d of domains) {
    if (host === d || host.endsWith("." + d)) return d;
  }
  return null;
}

// new URL tolerante: reintenta con https:// si falta el esquema (el actor a veces
// devuelve el link ya desenvuelto y sin http → "piclink.me/x").
function safeUrl(s: string): URL | null {
  try {
    return new URL(s);
  } catch {
    try {
      return new URL("https://" + s.replace(/^\/+/, ""));
    } catch {
      return null;
    }
  }
}

// decodifica el parámetro JUSTO de veces (doble-encoding %253A) hasta estabilizar.
function decodeStable(s: string): string {
  let cur = s;
  for (let i = 0; i < 3; i++) {
    if (!/%[0-9a-fA-F]{2}/.test(cur)) break;
    let next: string;
    try {
      next = decodeURIComponent(cur);
    } catch {
      break;
    }
    if (next === cur) break;
    cur = next;
  }
  return cur;
}

const PATH_PLATFORM: Array<[RegExp, string]> = [
  [/onlyfans/i, "onlyfans"],
  [/fansly/i, "fansly"],
  [/fanvue/i, "fanvue"],
  [/manyvids/i, "manyvids"],
];

/**
 * Clasifica el destino de un sticker de link.
 * @param rawLink valor crudo de story.linkUrl (puede venir envuelto / vacío / "null")
 * @param funnelHosts hostnames del funnel propio de la creadora (de su onlyfans_url/piclink_url)
 */
export function classifyLinkDestination(
  rawLink: string | null | undefined,
  funnelHosts: string[] = [],
): LinkClass {
  const raw = String(rawLink ?? "").trim();
  if (!raw || ["null", "undefined", "none"].includes(raw.toLowerCase())) {
    return { tier: "none", platform: null, host: "", decoded: "" };
  }

  // ── Desenvolver wrappers en LOOP (anidados), con límite de profundidad ──
  let current = raw;
  let url: URL | null = null;
  for (let depth = 0; depth < 4; depth++) {
    url = safeUrl(current);
    if (!url) break;
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const param = WRAPPER_HOSTS[host];
    if (!param) break; // host final
    const inner = url.searchParams.get(param);
    if (!inner) {
      // wrapper sin destino usable → no inventar promo
      return { tier: "unknown", platform: null, host, decoded: current };
    }
    current = decodeStable(inner);
    url = null;
  }

  if (!url) return { tier: "unknown", platform: null, host: "", decoded: current };

  const host = url.hostname.toLowerCase().replace(/^www\./, ""); // sin puerto (hostname)
  const path = (url.pathname || "").toLowerCase();
  const decoded = host + (path && path !== "/" ? path : "");

  // refina la plataforma mirando el path (linktr.ee/x/onlyfans → onlyfans), SOLO para
  // afinar buy_link_type; nunca para subir de tier un host nonpaid.
  const pathPlatform = (() => {
    for (const [re, p] of PATH_PLATFORM) if (re.test(path)) return p;
    return null;
  })();

  // 1) PAGO directo
  const paid = matchSuffix(host, Object.keys(PAID));
  if (paid) {
    return { tier: "paid", platform: pathPlatform ?? PAID[paid], host, decoded };
  }

  // 2) Funnel PROPIO de la creadora (host custom no listado) → es su embudo = promo
  if (funnelHosts.length && matchSuffix(host, funnelHosts)) {
    return { tier: "aggregator", platform: pathPlatform ?? "other", host, decoded };
  }

  // 3) Agregador / link-in-bio (embuda a OF)
  const agg = matchSuffix(host, Object.keys(AGGREGATOR));
  if (agg) {
    return { tier: "aggregator", platform: pathPlatform ?? AGGREGATOR[agg], host, decoded };
  }

  // 4) Casino / apuestas / "gana dinero" → afiliado, NO su contenido pago → se
  //    descarta como NO promo (el webhook lo fuerza a "No", no a "a revisar").
  if (matchSuffix(host, CASINO) || CASINO_HOST_RE.test(host)) {
    return { tier: "casino", platform: null, host, decoded };
  }

  // 5) NO-pago (red social, música, tienda, noticias, contacto…)
  if (matchSuffix(host, NONPAID)) {
    return { tier: "nonpaid", platform: "none", host, decoded };
  }

  // 5) Acortador opaco → no se puede ver el destino → no asumir promo
  if (matchSuffix(host, SHORTENERS)) {
    return { tier: "unknown", platform: null, host, decoded };
  }

  // 6) Desconocido → a revisar, jamás promo por default
  return { tier: "unknown", platform: null, host, decoded };
}
