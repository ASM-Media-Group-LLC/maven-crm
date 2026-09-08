import { cn } from "@/lib/utils";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  subDays,
} from "date-fns";

// DateRangePresets — chips de rango rápido (Ayer / Hoy / Esta semana /
// Este mes) + DateRangePicker custom alineado en una fila. Es el mismo
// patrón que usa PanelDeControl en su header — extraído acá para que
// otros pages (Promolog, etc.) lo reusen sin duplicar la lógica de
// presets, cálculo de rangos, ni el estilo del pill segmentado.
//
// Uso típico (en el header de la page, a la derecha del título):
//   const [range, setRange] = useState<DateRange>(() => rangeForPreset("today"));
//   const [activePreset, setActivePreset] = useState<RangePreset | null>("today");
//   <DateRangePresets
//     range={range}
//     activePreset={activePreset}
//     onChange={(r, preset) => { setRange(r); setActivePreset(preset); }}
//   />
//
// Cuando el user elige fechas custom del DateRangePicker, `activePreset`
// vuelve a null — el page muestra el pill sin highlight activo.

export type RangePreset = "yesterday" | "today" | "this_week" | "this_month";

export interface DateRange {
  from: Date;
  to: Date;
}

// shortLabel: en celular "Esta semana"/"Este mes" se partían en dos líneas.
export const PRESET_CONFIG: Array<{ key: RangePreset; label: string; shortLabel: string }> = [
  { key: "yesterday", label: "Ayer", shortLabel: "Ayer" },
  { key: "today", label: "Hoy", shortLabel: "Hoy" },
  { key: "this_week", label: "Esta semana", shortLabel: "Semana" },
  { key: "this_month", label: "Este mes", shortLabel: "Mes" },
];

export function rangeForPreset(preset: RangePreset, ref: Date = new Date()): DateRange {
  const today = startOfDay(ref);
  switch (preset) {
    case "yesterday": {
      const y = subDays(today, 1);
      return { from: y, to: endOfDay(y) };
    }
    case "today":
      return { from: today, to: endOfDay(today) };
    case "this_week":
      // weekStartsOn=1 (lunes) — convención local.
      return {
        from: startOfWeek(today, { weekStartsOn: 1 }),
        to: endOfWeek(today, { weekStartsOn: 1 }),
      };
    case "this_month":
      return { from: startOfMonth(today), to: endOfMonth(today) };
  }
}

interface Props {
  range: DateRange;
  activePreset: RangePreset | null;
  onChange: (range: DateRange, preset: RangePreset | null) => void;
  className?: string;
  /** Placeholder mostrado dentro del DateRangePicker cuando no hay seleccion. */
  placeholder?: string;
}

const DateRangePresets = ({ range, activePreset, onChange, className, placeholder }: Props) => (
  <div className={cn("flex items-center gap-2 flex-wrap", className)}>
    {/* Pill segmentado — click setea range y preset; el DateRangePicker
        de al lado lo desactiva si el user elige fechas custom. */}
    <div className="inline-flex items-center rounded-lg border border-border bg-card/40 p-0.5">
      {PRESET_CONFIG.map((p) => {
        const isActive = activePreset === p.key;
        return (
          <button
            key={p.key}
            type="button"
            onClick={() => onChange(rangeForPreset(p.key), p.key)}
            className={cn(
              "px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
              isActive
                ? "bg-primary/15 text-primary ring-1 ring-primary/30"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
            )}
          >
            <span className="sm:hidden">{p.shortLabel}</span>
            <span className="hidden sm:inline">{p.label}</span>
          </button>
        );
      })}
    </div>
    <DateRangePicker
      from={range.from}
      to={range.to}
      onApply={(from, to) => onChange({ from, to }, null)}
      placeholder={placeholder ?? "Seleccionar fechas"}
    />
  </div>
);

export default DateRangePresets;
