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
  // Color en dosis chica (Alvaro, 12/11/2026: primero «sin colorcitos», luego
  // «un poquitito más de color no estaría mal»): el ícono en su color, sobre un
  // tinte muy leve con filo fino, y un brillo de esquina suave y quieto. La cifra
  // sigue en blanco.
  const chip =
    tono === "success" ? "bg-success/[0.08] text-success/90 ring-success/20"
    : tono === "warning" ? "bg-warning/[0.08] text-warning/90 ring-warning/20"
    : tono === "danger" ? "bg-destructive/[0.08] text-destructive/90 ring-destructive/20"
    : "bg-primary/[0.08] text-primary/90 ring-primary/20";
  const glow =
    tono === "success" ? "glow-g"
    : tono === "warning" ? "glow-a"
    : tono === "danger" ? "glow-r"
    : "glow-b";
  return (
    <div className={`vidrio vidrio-glow glow-suave vidrio-lift sube ${glow} p-4`} style={{ animationDelay: `${indice * 0.06}s` }}>
      <div className="v-cont flex flex-col gap-3">
        <div className="flex items-center gap-2.5">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1 ${chip}`}>
            <Icono className="h-[18px] w-[18px]" />
          </span>
          <span className="truncate text-xs font-medium text-muted-foreground">{etiqueta}</span>
        </div>
        <div className="font-display text-[22px] sm:text-[26px] font-bold leading-tight tracking-tight tabular-nums text-foreground [text-wrap:balance]">{valor}</div>
        <div className="text-xs text-muted-foreground">{detalle}</div>
      </div>
    </div>
  );
}
