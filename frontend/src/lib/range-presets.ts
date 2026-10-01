import { startOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, endOfDay } from "date-fns";
import { conEtiqueta, type ConEtiqueta } from "@/lib/etiquetaTraducida";

// Presets de rango de fecha compartidos (mismos que Panel de Control / Dashboard 2).
// Centralizados acá para que el tab Ventas use exactamente la misma UX.
// `key` es el dato (rangeForPreset lo lee); la etiqueta es `t(p.labelKey)`, y
// `p.label` se traduce al leerlo (ver lib/etiquetaTraducida.ts).
export type RangePreset = "yesterday" | "today" | "this_week" | "this_month";

export const PRESET_CONFIG: Array<ConEtiqueta<{ key: RangePreset }>> = [
  conEtiqueta({ key: "yesterday" as const }, "int.range.yesterday"),
  conEtiqueta({ key: "today" as const }, "common.today"),
  conEtiqueta({ key: "this_week" as const }, "common.thisWeek"),
  conEtiqueta({ key: "this_month" as const }, "common.thisMonth"),
];

export function rangeForPreset(preset: RangePreset, ref: Date): { from: Date; to: Date } {
  const today = startOfDay(ref);
  switch (preset) {
    case "yesterday": {
      const y = subDays(today, 1);
      return { from: y, to: endOfDay(y) };
    }
    case "this_week":
      return { from: startOfWeek(today, { weekStartsOn: 1 }), to: endOfWeek(today, { weekStartsOn: 1 }) };
    case "this_month":
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case "today":
    default:
      return { from: today, to: endOfDay(today) };
  }
}

/**
 * Los días (ISO `YYYY-MM-DD`) que hay entre dos fechas, inclusive. Los
 * gráficos "día por día" tienen que cubrir el rango del calendario: con solo
 * los días que tienen dato, una semana con 3 días dibujaba 3 barras y parecía
 * un rango de 3 días. Devuelve [] si el rango es absurdo (>92 días), para que
 * quien llame se quede con sus propios datos.
 */
export function diasEntre(desde: string, hasta: string): string[] {
  const salida: string[] = [];
  const fin = new Date(`${hasta}T12:00:00`);
  // Mediodía: así ningún cambio de horario corre el día.
  for (const t = new Date(`${desde}T12:00:00`); t <= fin; t.setDate(t.getDate() + 1)) {
    salida.push(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`);
    if (salida.length > 92) return [];
  }
  return salida;
}
