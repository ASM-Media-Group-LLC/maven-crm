import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** Ícono opcional a la izquierda del título (en un cuadro bg-primary/10). */
  icon?: React.ReactNode;
  /** Acciones a la derecha (botones, filtros). Bajan a otra fila si no entran. */
  actions?: React.ReactNode;
  className?: string;
}

// Encabezado de página CANÓNICO de Maven. Escala de título única (text-2xl font-semibold),
// y layout responsive que evita el cramming: el bloque título/subtítulo no se aplasta
// (shrink-0) y las acciones bajan a una segunda fila (flex-wrap) en vez de exprimir el
// título. Reemplaza los 15+ headers inline con tamaños/pesos dispares.
export function PageHeader({ title, subtitle, icon, actions, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-3", className)}>
      <div className="flex shrink-0 items-start gap-3">
        {icon != null && (
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary [&_svg]:h-5 [&_svg]:w-5">
            {icon}
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold leading-tight tracking-tight">{title}</h1>
          {subtitle != null && (
            <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
          )}
        </div>
      </div>
      {actions != null && (
        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">{actions}</div>
      )}
    </div>
  );
}
