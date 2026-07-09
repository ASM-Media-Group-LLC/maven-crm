// Score de CALIDAD de promo por día y por red (Fase 1).
//
// Modelo acordado con el dueño (2026-06-11):
//   score = Σ (peso_red × calidad_de_la_mejor_promo_en_esa_red)
//   pesos FIJOS entre las 4 redes con bot: IG 60% · X 13,3% · Telegram 13,3% · Facebook 13,3%.
//   Pesos fijos = si la creadora NO está en una red, nunca llega a 100% (empuja multi-red).
//
// Calidad v1: heurística sobre lo que YA guardamos (sin re-correr IA).
//   - Instagram (visión Gemini): usa has_buy_link + ai_confidence (señales numéricas ricas).
//   - X / Telegram / Facebook (heurística de texto): solo tokens en ai_reasoning
//     (onlyfans / of_handle / link_agg / vision-of / plataforma / promo).
// Queda enchufable: en Fase 2 reemplazamos qualityForEntry por un puntaje fino de IA
// sin tocar computeDayScore ni la barra.

export const BOT_NETWORKS = ["instagram", "x", "telegram", "facebook"] as const;
export type BotNetwork = (typeof BOT_NETWORKS)[number];

// Pesos fijos. El 40% restante (fuera de IG) se reparte en partes iguales.
export const NETWORK_WEIGHTS: Record<BotNetwork, number> = {
  instagram: 0.6,
  x: 0.4 / 3,
  telegram: 0.4 / 3,
  facebook: 0.4 / 3,
};

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

// Plataformas que la agencia MANEJA → solo estas suman al score (decisión del dueño
// 2026-06-11: OnlyFans + Unlok; las demás, ej. Fansly/Piclink, no las manejamos).
const MANAGED = new Set(["onlyfans", "unlok"]);
const KNOWN_UNMANAGED = new Set(["fansly", "piclink", "linktree"]);

/** ¿La promo es a una plataforma que manejamos (OF o Unlok)? Solo esas suman. */
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
  weight: number;
  quality: number; // 0-1 (calidad de la mejor promo de esa red ese día)
  promoted: boolean; // promocionó en esa red ese día
  scanned: boolean; // el bot dejó registro de esa red ese día (aunque sea "sin promo")
  contribution: number; // weight × quality (lo que aporta al score)
}

export interface DayScore {
  score: number; // 0-1
  networks: NetworkScore[]; // SIEMPRE las 4 redes con bot (slots fijos)
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Calidad 0-1 de UNA entry promocionada. 0 si no promocionó. */
export function qualityForEntry(e: ScoreInput): number {
  if (!e.promoted) return 0;
  // Promocionó pero a una plataforma que NO manejamos (Fansly/Piclink/…) → no suma.
  // EXCEPCIÓN: si está marcada "revisar manual", la asumimos promo válida (OF) y SÍ le
  // damos calidad hasta que un humano la revise. Si en la revisión la marcan No,
  // promoted pasa a false y la calidad vuelve a 0 automáticamente.
  if (!isManagedPromo(e) && !e.needs_review) return 0;
  const net = canonicalNetwork(e.network);
  const notes = (e.notes || "").toLowerCase();
  const hasLink = e.has_buy_link === true || !!e.buy_link_type || /(onlyfans|enlace|\blink\b|fans)/.test(notes);
  let q: number;

  if (!e.analyzed_by_ai) {
    // Manual / verificada por un humano (chatter): es una promo REAL confirmada → base
    // alta. No tenemos puntaje fino de calidad → un link la sube. Fase 2 (IA) la afina.
    q = 0.75 + (hasLink ? 0.25 : 0);
  } else if (net === "instagram") {
    // IG bot (visión): link explícito a OF pesa fuerte + confianza de la visión.
    const conf = e.ai_confidence != null ? clamp01(e.ai_confidence) : 0.6;
    q = 0.45 + (e.has_buy_link ? 0.35 : 0) + 0.2 * conf;
  } else {
    // X / Telegram / Facebook bot: solo tokens cortos en ai_reasoning.
    const r = (e.ai_reasoning || "").toLowerCase();
    if (/(onlyfans|of_handle|link_agg)/.test(r)) q = 1.0; // link/handle de OF explícito
    else if (r.includes("vision-of")) q = 0.85; // la visión confirmó promo de OF en la imagen
    else if (r.includes("plataforma")) q = 0.75; // menciona la plataforma
    else if (r.includes("promo")) q = 0.6; // CTA / promo indirecta
    else q = 0.5; // promocionó pero señal difusa
  }
  if (e.partial) q *= 0.5;
  return clamp01(q);
}

/** Score del día (0-1) + desglose por red, desde TODAS las entries de un creador+día. */
export function computeDayScore(inputs: ScoreInput[]): DayScore {
  const byNet = new Map<string, { quality: number; promoted: boolean; scanned: boolean }>();
  for (const e of inputs) {
    const net = canonicalNetwork(e.network);
    if (!(net in NETWORK_WEIGHTS)) continue; // solo las 4 redes con bot pesan
    const cur = byNet.get(net) ?? { quality: 0, promoted: false, scanned: false };
    cur.scanned = true;
    if (e.promoted) {
      cur.promoted = true;
      cur.quality = Math.max(cur.quality, qualityForEntry(e)); // la MEJOR promo de la red
    }
    byNet.set(net, cur);
  }
  const networks: NetworkScore[] = BOT_NETWORKS.map((net) => {
    const weight = NETWORK_WEIGHTS[net];
    const info = byNet.get(net) ?? { quality: 0, promoted: false, scanned: false };
    return {
      network: net,
      weight,
      quality: info.quality,
      promoted: info.promoted,
      scanned: info.scanned,
      contribution: weight * info.quality,
    };
  });
  const score = networks.reduce((s, n) => s + n.contribution, 0);
  return { score: clamp01(score), networks };
}
