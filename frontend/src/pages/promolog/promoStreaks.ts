// ─── Rachas de promo por creadora (ola 3 UX — #109) ─────────────────────────
//
// Generaliza el cálculo de "Streak más larga" que vivía inline en
// PromologDashboardView a un Map por creadora, sobre los MISMOS entries ya
// cargados (cero queries nuevas). Racha = run más largo de días CONSECUTIVOS
// con al menos una promo (result "Sí"), usando rawDate (YYYY-MM-DD) para no
// depender del string formateado. Acotada al rango/filtros cargados — igual
// que la card del dashboard.
import type { PromologEntry } from "./PromologEntryCard";

export type PromoStreak = { name: string; streak: number };

/** Misma clave que usan los agregados del dashboard para entries sin creator_id. */
export const streakCreatorKey = (e: Pick<PromologEntry, "creator_id" | "name">): string =>
  e.creator_id || `__no_id__${e.name}`;

export function computePromoStreaks(entries: PromologEntry[]): Map<string, PromoStreak> {
  const daysByCreator = new Map<string, { name: string; days: Set<string> }>();
  for (const e of entries) {
    if (e.result !== "Sí") continue;
    const key = (e.rawDate || "").slice(0, 10);
    if (!key) continue;
    const id = streakCreatorKey(e);
    const slot = daysByCreator.get(id);
    if (slot) slot.days.add(key);
    else daysByCreator.set(id, { name: e.name, days: new Set([key]) });
  }
  const out = new Map<string, PromoStreak>();
  for (const [id, { name, days }] of daysByCreator) {
    const sorted = [...days].sort();
    let run = 0;
    let max = 0;
    let prev: number | null = null;
    for (const k of sorted) {
      const t = Date.parse(`${k}T00:00:00Z`);
      run = prev !== null && t - prev === 86_400_000 ? run + 1 : 1;
      prev = t;
      if (run > max) max = run;
    }
    out.set(id, { name, streak: max });
  }
  return out;
}
