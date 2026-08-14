// Score de CALIDAD de promo por DÍA (v2, 2026-08-13 — pedido de Jhon: la barrita del
// día usa la MISMA escala que el score de periodo del Dashboard).
//
//   score del día = calidad de la MEJOR promo válida del día (0-1), sin pesos por red.
//
// El modelo v1 (Σ peso_red × calidad, IG 60% fijo) capaba a las creadoras que no viven
// en IG (Martina Smith: X+TG con link directo → tope 27%) — retirado como ranking en el
// PR #1185 y de esta barra acá. La frecuencia/constancia/multi-red se miden a nivel
// PERIODO en el RPC `promo_creator_period_scores` (leaderboard del Dashboard y reportes
// de WhatsApp); esta barra responde solo "¿qué tan buena fue la promo de HOY?".
//
// ⚠️ ESCALA DE CALIDAD DUPLICADA A PROPÓSITO: la fuente canónica es el RPC
// `promo_creator_period_scores` (migración 20260813170000). Si se cambia la escala
// allá (link 1.0 · funnel 0.85 · mención 0.6 · difusa 0.3 · manual 0.75/1.0 ·
// partial ×0.5 · no-gestionada 0), cambiarla ACÁ también.

export const BOT_NETWORKS = ["instagram", "x", "telegram", "facebook"] as const;
export type BotNetwork = (typeof BOT_NETWORKS)[number];

/** Normaliza el nombre de red (twitter → x, lower-case). */
export function canonicalNetwork(n?: string | null): string {
  const v = (n || "").toLowerCase().trim();
  if (v === "twitter") return "x";
  return v;
}

/** Forma mínima que necesita el scoring (la arman PromologContent y el Calendario). */
export interface ScoreInput {
  network?: string | null;
  promoted: boolean;
  partial?: boolean;
  analyzed_by_ai?: boolean; // true = entry de bot; false = manual (chatter/humano)
  ai_reasoning?: string | null;
  platform?: string | null;
  has_buy_link?: boolean;
  buy_link_type?: string | null;
  ai_confidence?: number | null;
  notes?: string | null;
  needs_review?: boolean; // la IA la marcó para revisión manual (link/plataforma ambiguos)
}

// Plataformas/funnels que la agencia MANEJA → solo estas suman al score.
// Decisión del dueño 2026-06-11: OnlyFans + Unlok. Ampliada 2026-07-18: Piclink y
// Linktree TAMBIÉN cuentan — son funnels de las creadoras hacia OF (piclink_url vive
// en la ficha de la creadora), no plataformas rivales. Fansly sigue afuera.
const MANAGED = new Set(["onlyfans", "unlok", "piclink", "linktree"]);
const KNOWN_UNMANAGED = new Set(["fansly"]);

/** ¿La promo es a una plataforma/funnel que manejamos? Solo esas suman al score. */
export function isManagedPromo(e: ScoreInput): boolean {
  const p = (e.platform || "").toLowerCase();
  const b = (e.buy_link_type || "").toLowerCase();
  const r = (e.ai_reasoning || "").toLowerCase();
  if (MANAGED.has(p) || MANAGED.has(b)) return true;
  if (/unlok/.test(r)) return true; // Gemini nombra "Unlok/Unlokme" en el reasoning
  if (p === "otra" || KNOWN_UNMANAGED.has(p) || KNOWN_UNMANAGED.has(b)) return false;
  if (b === "other") return false; // "other" sin señal de Unlok → otra plataforma, no manejada
  return true; // OF explícito o promo indirecta sin plataforma → asumimos OF (default del negocio)
}

/**
 * Plataforma para la UI: SOLO "Unlok" u "OnlyFans" (o null si no hay promo/plataforma).
 * Regla del owner: el negocio solo tiene OnlyFans (Kash) y Unlok (Atomick). Si NO se ve
 * claramente Unlok, se toma como OnlyFans. Nunca "Otra"/"Fansly"/"Piclink"/"Linktree".
 */
export function displayPlatform(e: {
  platform?: string | null;
  buy_link_type?: string | null;
  ai_reasoning?: string | null;
  has_buy_link?: boolean;
  result?: string | null;
}): string | null {
  const p = (e.platform || "").toLowerCase();
  const b = (e.buy_link_type || "").toLowerCase();
  const r = (e.ai_reasoning || "").toLowerCase();
  // Unlok SOLO si es claramente Unlok (plataforma/link/nombre en el reasoning).
  if (p === "unlok" || b === "unlok" || /unlok/.test(r)) return "Unlok";
  // ¿Hay señal de promo/plataforma? (promocionó, o hay link/plataforma de cualquier tipo)
  const noise = new Set(["", "ninguna", "none"]);
  const hasSignal = e.result === "Sí" || e.has_buy_link === true || !noise.has(b) || !noise.has(p);
  return hasSignal ? "OnlyFans" : null; // cualquier cosa que no sea Unlok → OnlyFans
}

export interface NetworkScore {
  network: BotNetwork;
  quality: number; // 0-1 (calidad de la mejor promo de esa red ese día)
  promoted: boolean; // promocionó en esa red ese día
  scanned: boolean; // el bot dejó registro de esa red ese día (aunque sea "sin promo")
}

export interface DayScore {
  score: number; // 0-1 = calidad de la MEJOR promo válida del día
  networks: NetworkScore[]; // SIEMPRE las 4 redes con bot (slots fijos)
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Calidad 0-1 de UNA entry promocionada (escala v2 = la del RPC). 0 si no promocionó. */
export function qualityForEntry(e: ScoreInput): number {
  if (!e.promoted) return 0;
  // Promocionó pero a una plataforma que NO manejamos (Fansly/…) → no suma.
  // EXCEPCIÓN: si está marcada "revisar manual", la asumimos promo válida (OF) y SÍ le
  // damos calidad hasta que un humano la revise. Si en la revisión la marcan No,
  // promoted pasa a false y la calidad vuelve a 0 automáticamente.
  if (!isManagedPromo(e) && !e.needs_review) return 0;
  const b = (e.buy_link_type || "").toLowerCase();
  const p = (e.platform || "").toLowerCase();
  const r = (e.ai_reasoning || "").toLowerCase();
  let q: number;

  if (!e.analyzed_by_ai) {
    // Manual / verificada por un humano: promo real confirmada. Con link = máxima.
    q = e.has_buy_link === true || !!e.buy_link_type ? 1.0 : 0.75;
  } else if (e.has_buy_link === true || ["onlyfans", "unlok", "of"].includes(b) || /(of_link|link_agg)/.test(r)) {
    q = 1.0; // link directo a plataforma gestionada
  } else if (["piclink", "linktree"].includes(b) || ["piclink", "linktree"].includes(p)) {
    q = 0.85; // funnel propio hacia el OF de la ficha
  } else if (/(onlyfans|of_handle|vision-of)/.test(r)) {
    q = 0.6; // mención/handle de OF sin link
  } else {
    q = 0.3; // promocionó pero la señal es difusa (watermark, CTA genérico)
  }
  if (e.partial) q *= 0.5;
  return clamp01(q);
}

/**
 * Score del día (0-1) + desglose por red, desde TODAS las entries de un creador+día.
 * v2: el score es la MEJOR promo válida del día — sin pesos por red (el v1 de IG 60%
 * capaba a quien no vive en IG). Los slots por red quedan para el tooltip/detalle.
 */
export function computeDayScore(inputs: ScoreInput[]): DayScore {
  const byNet = new Map<string, { quality: number; promoted: boolean; scanned: boolean }>();
  for (const e of inputs) {
    const net = canonicalNetwork(e.network);
    if (!(BOT_NETWORKS as readonly string[]).includes(net)) continue; // solo las 4 redes con bot
    const cur = byNet.get(net) ?? { quality: 0, promoted: false, scanned: false };
    cur.scanned = true;
    if (e.promoted) {
      cur.promoted = true;
      cur.quality = Math.max(cur.quality, qualityForEntry(e)); // la MEJOR promo de la red
    }
    byNet.set(net, cur);
  }
  const networks: NetworkScore[] = BOT_NETWORKS.map((net) => {
    const info = byNet.get(net) ?? { quality: 0, promoted: false, scanned: false };
    return { network: net, quality: info.quality, promoted: info.promoted, scanned: info.scanned };
  });
  const score = networks.reduce((s, n) => Math.max(s, n.quality), 0);
  return { score: clamp01(score), networks };
}
