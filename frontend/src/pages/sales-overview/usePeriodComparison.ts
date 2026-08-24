import { useMemo } from "react";
import {
  addDays,
  differenceInDays,
  isFirstDayOfMonth,
  isSameMonth,
  startOfDay,
  subDays,
  subMonths,
} from "date-fns";
import type { Dash2Summary } from "../sales-performance/useDashboard2Summary";

export interface CreatorComparison {
  creatorKey: string;
  artisticName: string | null;
  currentEarnings: number;
  previousEarnings: number;
  change: number; // absolute
  changePercent: number; // -100 to +inf
  status: "rising" | "falling" | "at_risk" | "high_potential" | "stable";
}

export interface PeriodComparisonResult {
  totalCurrent: number;
  totalPrevious: number;
  totalChangePercent: number;
  activeCreators: number;
  creators: CreatorComparison[];
  rising: CreatorComparison[];
  falling: CreatorComparison[];
  atRisk: CreatorComparison[];
  highPotential: CreatorComparison[];
  top10: CreatorComparison[];
}

export interface ComparisonRanges {
  from: Date;
  /** `to` efectivo: clampeado a HOY cuando el preset se extiende al futuro (ej: "Este mes"). */
  effTo: Date;
  prevFrom: Date;
  prevTo: Date;
  /** El rango seleccionado incluye el día de hoy → los números de hoy son parciales. */
  includesToday: boolean;
  /** Etiqueta visible en el header explicando contra qué se compara. */
  comparisonLabel: string;
}

// Comparativa a DÍAS EQUIVALENTES. La versión vieja comparaba mes-parcial vs mes-completo
// (ej: ago 1-24 vs TODO julio → −43.4% "falso") e inflaba En Riesgo/Bajando. Ahora:
//  - el `to` efectivo se clampea a hoy cuando el preset se extiende al futuro, y
//  - el período anterior tiene el MISMO número de días transcurridos:
//      · rango anclado a mes (día 1, dentro de un mes) → mismo período del mes anterior
//        (ago 1-24 vs jul 1-24 → −28.0%, cifras de referencia en useSalesTotals.ts);
//      · cualquier otro rango → ventana equivalente inmediatamente anterior
//        (semana vs semana pasada, hoy vs ayer, rango custom vs los N días previos).
export function buildComparisonRanges(rawFrom: Date, rawTo: Date, today: Date): ComparisonRanges {
  const from = startOfDay(rawFrom);
  const selectedTo = startOfDay(rawTo);
  let effTo = selectedTo > today ? today : selectedTo;
  if (effTo < from) effTo = from; // rango 100% futuro → 1 día vacío, sin romper nada
  const elapsedDays = differenceInDays(effTo, from) + 1;

  const monthAnchored = isFirstDayOfMonth(from) && isSameMonth(from, selectedTo);
  let prevFrom: Date;
  if (monthAnchored) {
    // "Este mes" (o un mes completo pasado) → mismo período del mes anterior.
    prevFrom = subMonths(from, 1);
  } else {
    // Ventana equivalente inmediatamente anterior, del largo del rango SELECCIONADO
    // (semana → semana pasada aunque hoy sea lunes; hoy → ayer; custom → N días previos).
    const selectedSpan = differenceInDays(selectedTo, from) + 1;
    prevFrom = subDays(from, selectedSpan);
  }
  // Mismos días transcurridos; sin invadir el período actual (meses cortos, ej: feb).
  let prevTo = addDays(prevFrom, elapsedDays - 1);
  const prevCap = subDays(from, 1);
  if (prevTo > prevCap) prevTo = prevCap;

  const includesToday = from <= today && today <= selectedTo;
  const comparisonLabel = monthAnchored
    ? "vs mismo período del mes anterior"
    : "vs período anterior equivalente";

  return { from, effTo, prevFrom, prevTo, includesToday, comparisonLabel };
}

// Agrega el resumen por creadora (ya viene 1 fila por creadora desde el RPC
// get_dashboard2_creator_summary) a un mapa key → { earnings, name }.
const toCreatorMap = (rows: Dash2Summary[]) => {
  const map = new Map<string, { earnings: number; name: string | null }>();
  for (const r of rows) {
    map.set(r.group_key, {
      earnings: r.total,
      name: r.artistic_name || r.blu_creator_name,
    });
  }
  return map;
};

// Opera sobre el resumen POR CREADORA agregado server-side (~80 filas por período),
// ya no sobre las 40.9k filas crudas del histórico. Los dos períodos llegan de dos
// llamadas paralelas al RPC con rangos JUSTOS (buildComparisonRanges).
export const usePeriodComparison = (
  currentRows: Dash2Summary[] | undefined,
  previousRows: Dash2Summary[] | undefined,
): PeriodComparisonResult => {
  return useMemo(() => {
    const currentMap = toCreatorMap(currentRows ?? []);
    const prevMap = toCreatorMap(previousRows ?? []);

    const allKeys = new Set([...currentMap.keys(), ...prevMap.keys()]);

    const creators: CreatorComparison[] = [];
    for (const key of allKeys) {
      const cur = currentMap.get(key)?.earnings ?? 0;
      const prev = prevMap.get(key)?.earnings ?? 0;
      const name = currentMap.get(key)?.name ?? prevMap.get(key)?.name ?? null;
      if (cur === 0 && prev === 0) continue;

      const change = cur - prev;
      const changePercent = prev > 0 ? (change / prev) * 100 : cur > 0 ? 100 : 0;

      let status: CreatorComparison["status"] = "stable";
      if (changePercent > 30) status = "high_potential";
      else if (changePercent > 0) status = "rising";
      else if (changePercent < -20) status = "at_risk";
      else if (changePercent < 0) status = "falling";

      creators.push({ creatorKey: key, artisticName: name, currentEarnings: cur, previousEarnings: prev, change, changePercent, status });
    }

    const totalCurrent = creators.reduce((s, c) => s + c.currentEarnings, 0);
    const totalPrevious = creators.reduce((s, c) => s + c.previousEarnings, 0);
    const totalChangePercent = totalPrevious > 0 ? ((totalCurrent - totalPrevious) / totalPrevious) * 100 : 0;

    const rising = creators.filter((c) => c.status === "rising" || c.status === "high_potential").sort((a, b) => b.changePercent - a.changePercent);
    const falling = creators.filter((c) => c.status === "falling").sort((a, b) => a.changePercent - b.changePercent);
    const atRisk = creators.filter((c) => c.status === "at_risk").sort((a, b) => a.changePercent - b.changePercent);
    const highPotential = creators.filter((c) => c.status === "high_potential").sort((a, b) => b.changePercent - a.changePercent);
    const top10 = [...creators].sort((a, b) => b.currentEarnings - a.currentEarnings).slice(0, 10);
    const activeCreators = creators.filter((c) => c.currentEarnings > 0).length;

    return { totalCurrent, totalPrevious, totalChangePercent, activeCreators, creators, rising, falling, atRisk, highPotential, top10 };
  }, [currentRows, previousRows]);
};
