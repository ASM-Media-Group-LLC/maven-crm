import { Suspense, lazy, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CalendarCheck2, Loader2, Settings2 } from "lucide-react";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import { usePermissions } from "@/hooks/usePermissions";
import { useAsistencia, useBandejaAusencias, useMisPermisosAusencias, veAOtros } from "@/hooks/useAusencias";
import { hoyBogota } from "@/lib/ausencias";
import type { TranslationKey } from "@/lib/i18n";
import { AsistenciaHoy, AsistenciaMes, AsistenciaPersona, AsistenciaSemana } from "@/components/ausencias/AsistenciaVistas";
import { BandejaAusencias } from "@/components/ausencias/BandejaAusencias";
import { Festivos } from "@/components/ausencias/Festivos";
import { FormularioAusencia } from "@/components/ausencias/FormularioAusencia";
import { Fallo, Segmentos } from "@/components/ausencias/piezas";
import { ListaHorarios } from "@/components/horarios/ListaHorarios";

// ASISTENCIA (Alvaro, 20/11/2026): un solo lugar, al lado de Cowork, para todo lo
// del tiempo del equipo. Pestañas: Hoy · Calendario (Semana / Mes / Por persona) ·
// Ausencias (por aprobar + registrar) · Horarios · Festivos.
//
// Aquí se juntaron las pantallas sueltas de RR. HH. (/hr/asistencia,
// /hr/vacaciones, /hr/permisos, /hr/horarios, /hr/horarios-personal,
// /hr/horarios-chatters): sus rutas viejas redirigen a la pestaña que toca.
// Los horarios reusan las pantallas que ya existían.
//
// QUIÉN VE A QUIÉN: el alcance de la fila «Ausencias» del PUESTO (todos / su
// equipo / solo lo suyo) o un permiso especial de la persona; aprobar es una
// FUNCIÓN del puesto. Todo lo decide el servidor (mis_permisos_ausencias).

const HRSchedules = lazy(() => import("@/pages/hr/HRSchedules"));
const HRStaffSchedules = lazy(() => import("@/pages/hr/HRStaffSchedules"));
const HRChatterSchedules = lazy(() => import("@/pages/hr/HRChatterSchedules"));

type Pestana = "hoy" | "calendario" | "ausencias" | "horarios" | "festivos";
type VistaCal = "semana" | "mes" | "persona";
type VistaAus = "bandeja" | "registrar";
type VistaHor = "equipo" | "turnos" | "personal" | "chatters";

const PESTANAS: Pestana[] = ["hoy", "calendario", "ausencias", "horarios", "festivos"];

const Cargando = () => <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

export default function Asistencia() {
  const { t } = useLanguage();
  const { canAccess } = usePermissions();
  const [params, setParams] = useSearchParams();
  const permisos = useMisPermisosAusencias();
  const p = permisos.data;
  const veOtros = veAOtros(p);
  const bandeja = useBandejaAusencias(!!p && (p.aprueba_equipo || p.aprueba_final));
  const hoy = hoyBogota();
  // La lista de personas visibles (para «Por persona» y «Registrar») sale de la
  // misma consulta de Hoy: el servidor ya filtró por alcance.
  const gente = useAsistencia(hoy, hoy, null, veOtros);
  const personas = useMemo(() => (gente.data ?? []).map((x) => ({ user_id: x.user_id, nombre: x.nombre })), [gente.data]);

  const pedida = params.get("tab") as Pestana | null;
  const tab: Pestana = pedida && PESTANAS.includes(pedida) ? pedida : "hoy";
  const vistaCal = (params.get("vista") as VistaCal | null) ?? "semana";
  const vistaAus = (params.get("vista") as VistaAus | null) === "registrar" ? "registrar" : "bandeja";
  const horariosHr = canAccess("HR", "Horarios");
  const horariosCh = canAccess("HR", "Horarios Chatters");
  const vistaHor: VistaHor = (["equipo", "turnos", "personal", "chatters"] as VistaHor[]).includes(params.get("vista") as VistaHor)
    ? params.get("vista") as VistaHor : "equipo";
  const ir = (nuevaTab: Pestana, vista?: string) => {
    const n = new URLSearchParams();
    n.set("tab", nuevaTab);
    if (vista) n.set("vista", vista);
    setParams(n, { replace: true });
  };

  if (permisos.isLoading) return <Page><Cargando /></Page>;
  if (permisos.isError) return <Page><Fallo texto="aus.asis.fallo" reintentar={() => void permisos.refetch()} /></Page>;
  if (!veOtros) {
    return (
      <Page>
        <PageHeader icon={<CalendarCheck2 className="h-5 w-5" />} title={t("aus.equipo.titulo")} subtitle={t("aus.equipo.sub")} />
        <div className="vidrio mt-4 flex flex-col gap-2 p-6 text-sm text-muted-foreground">
          <p>{t("aus.sinAcceso")}</p>
          <Link to="/mis-dias" className="font-medium text-primary hover:underline">{t("aus.nav.mias")}</Link>
        </div>
      </Page>
    );
  }

  const pendientes = bandeja.data?.length ?? 0;
  const opciones: Array<[Pestana, TranslationKey, number?]> = [
    ["hoy", "aus.tab.hoy"], ["calendario", "aus.tab.calendario"], ["ausencias", "aus.tab.bandeja", pendientes],
    ["horarios", "aus.tab.horarios"], ["festivos", "aus.tab.festivos"],
  ];

  return (
    <Page>
      <PageHeader
        icon={<CalendarCheck2 className="h-5 w-5" />}
        title={t("aus.equipo.titulo")}
        subtitle={t("aus.equipo.sub")}
        actions={p?.configura_empresa ? (
          <Button asChild variant="outline" size="sm"><Link to="/ajustes/empresa"><Settings2 className="mr-1.5 h-4 w-4" /><span className="hidden sm:inline">{t("aus.politicaAtajo")}</span></Link></Button>
        ) : undefined}
      />
      <div className="mt-4 flex flex-col gap-3">
        <Segmentos opciones={opciones} valor={tab} onCambio={(k) => ir(k)} />

        {tab === "hoy" && <section className="vidrio overflow-hidden p-0"><AsistenciaHoy /></section>}

        {tab === "calendario" && (
          <>
            <Segmentos<VistaCal> opciones={[["semana", "aus.tab.semana"], ["mes", "aus.tab.mes"], ["persona", "aus.tab.persona"]]} valor={vistaCal} onCambio={(k) => ir("calendario", k)} />
            <section className="vidrio overflow-hidden p-0">
              {vistaCal === "mes" ? <AsistenciaMes /> : vistaCal === "persona" ? <AsistenciaPersona personas={personas} /> : <AsistenciaSemana />}
            </section>
          </>
        )}

        {tab === "ausencias" && (
          <>
            {p?.aprueba_final && (
              <Segmentos<VistaAus> opciones={[["bandeja", "aus.bandeja.titulo", pendientes], ["registrar", "aus.tab.registrar"]]} valor={vistaAus} onCambio={(k) => ir("ausencias", k)} />
            )}
            {vistaAus === "registrar" && p?.aprueba_final ? (
              <section className="vidrio flex flex-col gap-3 p-4">
                <div>
                  <h2 className="text-sm font-semibold text-foreground">{t("aus.reg.titulo")}</h2>
                  <p className="text-xs text-muted-foreground">{t("aus.reg.sub")}</p>
                </div>
                <FormularioAusencia personas={personas} />
              </section>
            ) : (
              <section className="vidrio overflow-hidden p-0"><BandejaAusencias resaltarId={params.get("id")} /></section>
            )}
          </>
        )}

        {tab === "horarios" && (
          <>
            {(horariosHr || horariosCh) && (
              <Segmentos<VistaHor>
                opciones={[
                  ["equipo", "aus.horarios.equipo"],
                  ...(horariosHr ? [["turnos", "aus.horarios.turnos"] as [VistaHor, TranslationKey], ["personal", "aus.horarios.personal"] as [VistaHor, TranslationKey]] : []),
                  ...(horariosCh ? [["chatters", "aus.horarios.chatters"] as [VistaHor, TranslationKey]] : []),
                ]}
                valor={vistaHor} onCambio={(k) => ir("horarios", k)} />
            )}
            {vistaHor === "turnos" && horariosHr ? <Suspense fallback={<Cargando />}><HRSchedules /></Suspense>
              : vistaHor === "personal" && horariosHr ? <Suspense fallback={<Cargando />}><HRStaffSchedules /></Suspense>
              : vistaHor === "chatters" && horariosCh ? <Suspense fallback={<Cargando />}><HRChatterSchedules /></Suspense>
              : <section className="vidrio overflow-hidden p-0"><ListaHorarios /></section>}
          </>
        )}

        {tab === "festivos" && <section className="vidrio overflow-hidden p-0"><Festivos editable={!!p?.es_rrhh} /></section>}
      </div>
    </Page>
  );
}
