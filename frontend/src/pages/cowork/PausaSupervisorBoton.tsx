import { useSyncExternalStore } from "react";
import { Coffee, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  ESTADOS_SUPERVISOR,
  leerPausaSupervisor, fijarPausaSupervisor, suscribirPausaSupervisor,
} from "@/lib/pausaSupervisor";
import { useLanguage } from "@/hooks/useLanguage";
import { ESTAS_SUPERVISOR, ETIQUETA_SUPERVISOR } from "./textosCowork";

// La tacita del Supervisor Hub (Jhon, 10/09/2026): a la derecha del chat, y al
// tocarla, tres estados —break, almuerzo, ausente— más "Disponible" para
// volver. Lee y escribe el store del módulo: el elemento se crea una vez al
// arrancar la llamada del Hub y vive dentro de ella, así que no puede depender
// de props que cambien; y el tablero, que es quien publica el estado por
// presencia, se entera por el mismo store.
export default function PausaSupervisorBoton() {
  const estado = useSyncExternalStore(suscribirPausaSupervisor, leerPausaSupervisor, leerPausaSupervisor);
  const { t } = useLanguage();
  const activo = estado !== null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          title={estado ? t(ESTAS_SUPERVISOR[estado]) : t("cowork.supPause.markHint")}
          aria-label={t("cowork.supPause.aria")}
          aria-pressed={activo}
          className={cn(
            "h-8 w-8 rounded-full flex items-center justify-center transition-colors",
            activo ? "bg-warning text-black hover:bg-warning/90" : "bg-card text-foreground hover:bg-muted",
          )}
        >
          <Coffee className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="z-[200] w-56 p-1.5 bg-background border-border">
        <p className="px-2 pt-1 pb-1.5 text-[11px] font-medium text-muted-foreground">
          {t("cowork.supPause.chattersWillSee")}
        </p>
        {ESTADOS_SUPERVISOR.map((op) => (
          <button
            key={op.valor}
            type="button"
            onClick={() => fijarPausaSupervisor(op.valor)}
            className={cn(
              "w-full flex items-center justify-between rounded-lg px-2 py-2 text-sm text-left hover:bg-muted",
              estado === op.valor && "bg-warning/15 text-warning",
            )}
          >
            <span>{t(ETIQUETA_SUPERVISOR[op.valor])}</span>
            {estado === op.valor && <Check className="h-3.5 w-3.5" />}
          </button>
        ))}
        <div className="my-1 h-px bg-border" />
        <button
          type="button"
          onClick={() => fijarPausaSupervisor(null)}
          className={cn(
            "w-full flex items-center justify-between rounded-lg px-2 py-2 text-sm text-left hover:bg-muted",
            !activo && "text-muted-foreground",
          )}
        >
          <span>{t("cowork.supPause.available")}</span>
          {!activo && <Check className="h-3.5 w-3.5" />}
        </button>
      </PopoverContent>
    </Popover>
  );
}
