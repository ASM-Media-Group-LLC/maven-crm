import { useEffect, useState } from "react";
import { PageHeader } from "@/components/ui/page-header";
import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";
import MiSemana from "./MiSemana";
import Equipo from "./Equipo";
import { useMiIdentidad, usePermisosHorarios, useRoster } from "./useHorarios";

type Vista = "mia" | "equipo";
const VISTA_KEY = "maven.horarios.vista";

// CHATTERS · HORARIOS: reemplaza el Excel de horarios. Una página, dos
// audiencias: el chatter ve SOLO su semana; el supervisor arma la del equipo.
export default function HorariosPage() {
  const { t } = useLanguage();
  const { esSupervisor, puedeGestionar } = usePermisosHorarios();
  const identidad = useMiIdentidad();
  const [vista, setVista] = useState<Vista | null>(() => {
    const v = localStorage.getItem(VISTA_KEY);
    return v === "mia" || v === "equipo" ? v : null;
  });

  // ¿Estoy en algún grupo? Tener identidad de chatter no alcanza: un admin
  // tiene identidad (para Rendimiento) pero no turno.
  const { miembros, cargando: cargandoRoster } = useRoster();
  const tengoGrupo = !!identidad.data && miembros.some((m) => m.identity_id === identidad.data);
  const cargando = identidad.isLoading || cargandoRoster;

  // Sin preferencia guardada: quien tiene grupo entra a lo suyo; el
  // supervisor sin grupo, directo al equipo.
  useEffect(() => {
    if (vista !== null || cargando) return;
    setVista(tengoGrupo ? "mia" : esSupervisor ? "equipo" : "mia");
  }, [vista, cargando, tengoGrupo, esSupervisor]);

  const elegir = (v: Vista) => { setVista(v); try { localStorage.setItem(VISTA_KEY, v); } catch { /* noop */ } };
  // "Mi semana" solo existe para quien tiene grupo (o no es supervisor, que no
  // tiene otra cosa que ver); "Equipo" solo para supervisores.
  const puedeMia = tengoGrupo || !esSupervisor;
  const vistaEfectiva: Vista = cargando ? (esSupervisor ? "equipo" : "mia")
    : vista === "equipo" && !esSupervisor ? "mia"
    : vista === "mia" && !puedeMia ? "equipo"
    : (vista ?? (esSupervisor ? "equipo" : "mia"));
  const pestanas = ([["mia", t("chatters.hor.myWeek")], ["equipo", t("common.team")]] as Array<[Vista, string]>)
    .filter(([v]) => (v === "mia" ? puedeMia : esSupervisor));

  return (
    // El AppShell recorta (h-dvh + overflow-hidden), así que el scroll lo pone
    // la página. Sin esto la tabla crecía hacia abajo y no había forma de bajarla.
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
      <div className="px-4 md:px-6 pt-4 md:pt-6 pb-8 space-y-4">
        <PageHeader
          title={t("chatters.hor.title")}
          subtitle={t("chatters.hor.subtitle")}
          icon={<CalendarDays className="h-5 w-5" />}
          actions={pestanas.length > 1 ? (
            <div className="inline-flex rounded-full border bg-muted/40 p-0.5" role="tablist">
              {pestanas.map(([v, l]) => (
                <button key={v} type="button" role="tab" aria-selected={vistaEfectiva === v} onClick={() => elegir(v)}
                  className={cn("rounded-full px-3.5 py-1 text-sm transition-colors", vistaEfectiva === v ? "bg-background font-semibold shadow-sm" : "text-muted-foreground hover:text-foreground")}>{l}</button>
              ))}
            </div>
          ) : undefined}
        />
        {vistaEfectiva === "equipo" ? <Equipo puedeGestionar={puedeGestionar} /> : <MiSemana />}
      </div>
    </div>
  );
}
