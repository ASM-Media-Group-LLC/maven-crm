import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

// Tarjeta KPI oficial de Maven (Alvaro, 05/11): UN SOLO patrón para que todo el
// dashboard "se sienta igual en todos lados". Icono + etiqueta arriba, número
// grande, detalle abajo. Se reutiliza en el Centro de operaciones y en el Pulso.
export function TarjetaKpi({
  icono: Icono,
  etiqueta,
  valor,
  detalle,
  tono = "primary",
  indice = 0,
}: {
  icono: LucideIcon;
  etiqueta: string;
  valor: ReactNode;
  detalle: ReactNode;
  tono?: "primary" | "success" | "warning" | "danger";
  /** Orden de entrada: escalona la animación "sube". */
  indice?: number;
}) {
  // Sin colorcitos (Alvaro, 12/11/2026): ícono neutro, sin brillo de color, la
  // cifra en blanco. Lo malo (warning/danger) se marca solo con un puntito junto
  // a la etiqueta; lo bueno no lleva nada.
  const punto = tono === "warning" ? "bg-warning" : tono === "danger" ? "bg-destructive" : null;
  return (
    <div className="vidrio vidrio-lift sube p-4" style={{ animationDelay: `${indice * 0.06}s` }}>
      <div className="v-cont flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-foreground/[0.04] text-foreground/75">
            <Icono className="h-[18px] w-[18px]" />
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {punto && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${punto}`} aria-hidden />}
            <span className="truncate">{etiqueta}</span>
          </span>
        </div>
        <div className="font-display text-[22px] sm:text-[26px] font-bold leading-tight tracking-tight tabular-nums text-foreground [text-wrap:balance]">{valor}</div>
        <div className="text-xs text-muted-foreground">{detalle}</div>
      </div>
    </div>
  );
}
