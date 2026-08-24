// Tooltip canónico del mini-sistema de charts (auditoría dataviz #13):
// reemplaza el default de Recharts (caja blanca, borde #ccc, texto negro)
// que flasheaba sobre el tema oscuro. Superficie de card, borde y radios
// del sistema, valores en tabular-nums.
//
// Uso:  <Tooltip content={<MavenTooltip />} />
// Acepta formatter / labelFormatter con la misma forma que Recharts.
import type { ReactNode } from "react";

interface TooltipEntry {
  name?: string | number;
  value?: number | string;
  color?: string;
  fill?: string;
  dataKey?: string | number;
  /** Dato original de la fila; en pies trae el fill de la slice. */
  payload?: Record<string, unknown> & { fill?: string };
}

interface MavenTooltipProps {
  active?: boolean;
  label?: string | number;
  payload?: TooltipEntry[];
  formatter?: (
    value: TooltipEntry["value"],
    name: TooltipEntry["name"],
    entry: TooltipEntry,
  ) => ReactNode | [ReactNode, ReactNode];
  labelFormatter?: (label: string | number, payload: TooltipEntry[]) => ReactNode;
}

const defaultFormat = (v: TooltipEntry["value"]) =>
  typeof v === "number" ? v.toLocaleString() : v;

export function MavenTooltip({ active, label, payload, formatter, labelFormatter }: MavenTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="rounded-xl border border-border bg-card px-3 py-2 text-xs shadow-lg">
      {label !== undefined && label !== "" && (
        <p className="mb-1 font-medium text-muted-foreground">
          {labelFormatter ? labelFormatter(label, payload) : label}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((entry, i) => {
          const out = formatter ? formatter(entry.value, entry.name, entry) : undefined;
          const [value, name] = Array.isArray(out)
            ? out
            : [out ?? defaultFormat(entry.value), entry.name];
          const swatch = entry.color ?? entry.fill ?? entry.payload?.fill;
          return (
            <div key={i} className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-1.5 text-muted-foreground">
                {swatch && (
                  <span
                    aria-hidden="true"
                    className="h-2 w-2 shrink-0 rounded-[3px]"
                    style={{ backgroundColor: swatch }}
                  />
                )}
                {name}
              </span>
              <span className="font-semibold tabular-nums text-foreground">{value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
