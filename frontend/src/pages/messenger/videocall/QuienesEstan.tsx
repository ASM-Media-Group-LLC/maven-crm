// Bloque de la sala de espera que dice quién ya llegó a la llamada, con la
// cara de cada persona (foto → muñequito DiceBear → iniciales, lo que tenga).
import { Loader2 } from "lucide-react";
import { UserAvatar } from "@/components/UserAvatar";
import { cn } from "@/lib/utils";
import type { PersonaEnSala } from "@/hooks/useQuienesEstanEnLaSala";

const MAX_CARAS = 5;

// Redacta la frase como la diría una persona: "Ana", "Ana y Luis",
// "Ana, Luis y Marta", "Ana, Luis y 3 más". Con más de tres nombres deja de
// enumerar, así la frase no crece con la reunión.
export function fraseDeQuienesEstan(nombres: string[]): string {
  const limpios = nombres.map((n) => n.trim()).filter(Boolean);
  if (limpios.length === 0) return "Nadie más ha llegado todavía";
  if (limpios.length === 1) return `${limpios[0]} está en esta llamada`;
  if (limpios.length <= 3) {
    const cabeza = limpios.slice(0, -1).join(", ");
    return `${cabeza} y ${limpios[limpios.length - 1]} están en esta llamada`;
  }
  const resto = limpios.length - 2;
  return `${limpios[0]}, ${limpios[1]} y ${resto} más están en esta llamada`;
}

export default function QuienesEstan({
  personas,
  cargando,
  className,
}: {
  personas: PersonaEnSala[];
  cargando?: boolean;
  className?: string;
}) {
  if (cargando && personas.length === 0) {
    return (
      <div
        className={cn("flex items-center justify-center gap-2 text-xs text-muted-foreground", className)}
        role="status"
        aria-live="polite"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        Viendo quién está…
      </div>
    );
  }

  const visibles = personas.slice(0, MAX_CARAS);
  const ocultas = personas.length - visibles.length;

  return (
    <div
      className={cn("flex flex-col items-center gap-2.5", className)}
      role="status"
      aria-live="polite"
      data-testid="quienes-estan"
    >
      {personas.length > 0 && (
        <div className="flex items-center -space-x-2" aria-hidden>
          {visibles.map((p) => (
            <div
              key={p.id}
              title={p.nombre}
              className="rounded-full ring-2 ring-background"
            >
              <UserAvatar name={p.nombre} src={p.foto} seed={p.seed} size="md" />
            </div>
          ))}
          {ocultas > 0 && (
            <div className="h-10 w-10 rounded-full ring-2 ring-background bg-muted text-muted-foreground text-xs font-medium flex items-center justify-center">
              +{ocultas}
            </div>
          )}
        </div>
      )}
      <p
        className={cn(
          "text-sm text-center max-w-[280px] text-balance",
          personas.length > 0 ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {fraseDeQuienesEstan(personas.map((p) => p.nombre))}
      </p>
    </div>
  );
}
