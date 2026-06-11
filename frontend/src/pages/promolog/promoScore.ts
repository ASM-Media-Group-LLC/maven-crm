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
  ai_reasoning?: string | null;
  has_buy_link?: boolean;
  ai_confidence?: number | null;
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
  const net = canonicalNetwork(e.network);
  let q: number;
  if (net === "instagram") {
    // IG tiene señales ricas (visión): link explícito a OF pesa fuerte + confianza.
    const conf = e.ai_confidence != null ? clamp01(e.ai_confidence) : 0.6;
    q = 0.45 + (e.has_buy_link ? 0.35 : 0) + 0.2 * conf;
  } else {
    // X / Telegram / Facebook: solo tokens cortos en ai_reasoning.
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
