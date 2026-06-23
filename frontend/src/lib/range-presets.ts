import { startOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, subDays, endOfDay } from "date-fns";

// Presets de rango de fecha compartidos (mismos que Panel de Control / Dashboard 2).
// Centralizados acá para que el tab Ventas use exactamente la misma UX.
export type RangePreset = "yesterday" | "today" | "this_week" | "this_month";

export const PRESET_CONFIG: Array<{ key: RangePreset; label: string }> = [
  { key: "yesterday", label: "Ayer" },
  { key: "today", label: "Hoy" },
  { key: "this_week", label: "Esta semana" },
  { key: "this_month", label: "Este mes" },
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
