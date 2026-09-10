// Lo que ve un CHATTER cuando su supervisor marcó break, lunch o ausente desde
// la tacita del Hub. Jhon (10/09/2026): "una pantalla especial, bonita,
// notificando que estoy en break, con su fondo bonito así como los chatters
// cuando se ponen en break, aunque sin contador visible para los empleados".
// El tiempo que lleva lo ven solo los otros supervisores, en el tablero.
import { Coffee, UtensilsCrossed, UserX, type LucideIcon } from "lucide-react";
import { PaisajeDePausa } from "@/pages/cowork/SalaEnPausa";
import { fraseDePausaSupervisor, subtituloDePausaSupervisor, type EstadoSupervisor } from "@/lib/pausaSupervisor";
import { cn } from "@/lib/utils";

const ICONO: Record<EstadoSupervisor, LucideIcon> = { break: Coffee, lunch: UtensilsCrossed, ausente: UserX };

export interface SupervisorEnPausaItem {
  uid: string;
  nombre: string;
  estado: EstadoSupervisor;
}

export default function SupervisorEnPausa({ supervisores, className }: { supervisores: SupervisorEnPausaItem[]; className?: string }) {
  if (!supervisores.length) return null;
  return (
    <div
      data-testid="aviso-supervisor-en-pausa"
      className={cn("relative overflow-hidden rounded-2xl border border-warning/25 text-white", className)}
    >
      <PaisajeDePausa excedida={false} />
      <div className="relative flex flex-col divide-y divide-white/10">
        {supervisores.map((s) => {
          const Icono = ICONO[s.estado];
          return (
            <div key={s.uid} className="flex items-center gap-3 px-3 py-2.5 md:px-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-warning/15 text-warning ring-1 ring-warning/50">
                <Icono className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="truncate font-display text-sm font-semibold">{s.nombre} {fraseDePausaSupervisor(s.estado)}</div>
                <div className="truncate text-[11px] text-white/70">{subtituloDePausaSupervisor(s.estado)}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
