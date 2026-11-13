import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

// LOS NÚMEROS en una lista limpia (Alvaro, 13/11/2026: el inicio en dos columnas;
// a la derecha «los números en una lista»). Cada fila: ícono en su color suave,
// la etiqueta y su detalle en gris, y la cifra a la derecha en blanco. Sin cajas
// sueltas: una sola tarjeta con filas separadas por una línea fina.

export type FilaNumero = {
  icono: LucideIcon;
  tono?: "primary" | "success" | "warning" | "danger";
  etiqueta: string;
  valor: ReactNode;
  detalle?: ReactNode;
};

const CHIP: Record<NonNullable<FilaNumero["tono"]>, string> = {
  primary: "bg-primary/[0.08] text-primary/90 ring-primary/20",
  success: "bg-success/[0.08] text-success/90 ring-success/20",
  warning: "bg-warning/[0.08] text-warning/90 ring-warning/20",
  danger: "bg-destructive/[0.08] text-destructive/90 ring-destructive/20",
};

export function ListaDeNumeros({ titulo, icono: IconoTitulo, filas }: { titulo: string; icono: LucideIcon; filas: FilaNumero[] }) {
  if (filas.length === 0) return null;
  return (
    <section className="vidrio sube p-4">
      <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/[0.08] text-primary/90 ring-1 ring-primary/20"><IconoTitulo className="h-4 w-4" /></span>
        {titulo}
      </h2>
      <ul className="divide-y divide-border/40">
        {filas.map(({ icono: Icono, tono = "primary", etiqueta, valor, detalle }) => (
          <li key={etiqueta} className="flex items-center gap-3 py-2.5">
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ${CHIP[tono]}`}>
              <Icono className="h-4 w-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium text-foreground/85">{etiqueta}</span>
              {detalle != null && <span className="block truncate text-[11px] text-muted-foreground">{detalle}</span>}
            </span>
            <span className="shrink-0 font-display text-lg font-medium tabular-nums text-foreground/90">{valor}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
