// Estado vacío reutilizable del reskin: columna centrada con muñequito
// DiceBear (determinista por seed) o un icono propio de la pantalla.
// Solo presentación: la condición de "está vacío" la decide quien lo usa.
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { dicebearUri } from "@/lib/avatar";

interface EmptyStateProps {
  title: string;
  description?: string;
  /** Icono propio de la pantalla; se ignora si viene `seed`. */
  icon?: ReactNode;
  /** Seed fijo por pantalla → mismo muñequito siempre. */
  seed?: string;
  /** Botón u otra acción opcional debajo del texto. */
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ title, description, icon, seed, action, className }: EmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-4 px-6 py-14 text-center", className)}>
      {seed ? (
        // Vidrio + glow de acento sutil detrás del muñequito: el vacío deja de
        // verse como un hueco y se integra al diseño glassy.
        <div className="relative">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-primary/25 blur-2xl" />
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-white/50 dark:border-white/10 bg-white/55 dark:bg-white/[0.06] backdrop-blur-xl shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_10px_30px_-10px_rgba(20,30,60,0.3)]">
            <img src={dicebearUri(seed)} alt="" aria-hidden="true" className="h-16 w-16" />
          </div>
        </div>
      ) : icon ? (
        <div className="relative">
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 rounded-full bg-primary/25 blur-2xl" />
          <div className="flex h-20 w-20 items-center justify-center rounded-full border border-white/50 dark:border-white/10 bg-white/55 dark:bg-white/[0.06] backdrop-blur-xl text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.6),0_10px_30px_-10px_rgba(20,30,60,0.3)]">
            {icon}
          </div>
        </div>
      ) : null}
      <div className="space-y-1.5">
        <p className="text-lg font-semibold text-foreground">{title}</p>
        {description && (
          <p className="mx-auto max-w-sm text-sm text-muted-foreground text-balance">{description}</p>
        )}
      </div>
      {action}
    </div>
  );
}
