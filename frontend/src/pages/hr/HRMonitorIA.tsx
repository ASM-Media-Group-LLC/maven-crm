import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Eye, Loader2, FileSpreadsheet, CalendarClock } from "lucide-react";
import { useHorariosEquipo } from "@/hooks/useHorariosEquipo";
import { useLanguage } from "@/hooks/useLanguage";
import { usePermissions } from "@/hooks/usePermissions";
import { useUserRole } from "@/hooks/useUserRole";
import { useEsRh } from "@/hooks/useEsRh";
import { useExportarHorasAHoja } from "@/hooks/useOnlyOffice";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { useMonitorConfig } from "@/hooks/useMonitorConfig";
import { DondeEstaPanel } from "@/components/hr/DondeEstaPanel";
import { useFuncionesCasos } from "@/hooks/useCasosArgos";
import { veRevision } from "@/lib/casosArgos";
import { useEsDueno } from "@/hooks/useEsDueno";
import type { TranslationKey } from "@/lib/i18n";
import { estaEnLlamadaDeMaven } from "@/lib/llamadaEnMaven";

// PANTALLAS AL INSTANTE (19/11/2026): Argos abre en «Dónde está» y es lo único
// que se dibuja al entrar. Las demás pestañas (con gráficos y tableros pesados)
// bajan recién al tocarlas, y en ocio después de abrir, así el primer pantallazo
// no espera código que no se ve. El contenido de cada pestaña no cambia.
const cargarPestanas = {
  ahora: () => Promise.all([import("@/components/hr/ConectadosAhoraPanel"), import("@/components/hr/PantallazosVivoPanel")]),
  dia: () => Promise.all([import("@/components/hr/ArgosHistorial"), import("@/components/hr/ArgosPanelDia")]),
  llamadas: () => Promise.all([import("@/components/hr/EstadoPanel"), import("@/components/hr/TableroCalidadLlamadas"), import("@/components/hr/LlamadasPanel")]),
  hub: () => import("@/components/hr/HistorialHubPanel"),
  revision: () => import("@/components/hr/RevisionCasos"),
  ajustes: () => Promise.all([import("@/pages/hr/ArgosAjustes"), import("@/components/hr/ContextoEmpresaPanel")]),
};
const ConectadosAhoraPanel = lazy(() => import("@/components/hr/ConectadosAhoraPanel").then((m) => ({ default: m.ConectadosAhoraPanel })));
const PantallazosVivoPanel = lazy(() => import("@/components/hr/PantallazosVivoPanel").then((m) => ({ default: m.PantallazosVivoPanel })));
const ArgosHistorial = lazy(() => import("@/components/hr/ArgosHistorial").then((m) => ({ default: m.ArgosHistorial })));
const ArgosPanelDia = lazy(() => import("@/components/hr/ArgosPanelDia").then((m) => ({ default: m.ArgosPanelDia })));
const EstadoPanel = lazy(() => import("@/components/hr/EstadoPanel").then((m) => ({ default: m.EstadoPanel })));
const TableroCalidadLlamadas = lazy(() => import("@/components/hr/TableroCalidadLlamadas").then((m) => ({ default: m.TableroCalidadLlamadas })));
const LlamadasPanel = lazy(() => import("@/components/hr/LlamadasPanel").then((m) => ({ default: m.LlamadasPanel })));
const HistorialHubPanel = lazy(() => import("@/components/hr/HistorialHubPanel").then((m) => ({ default: m.HistorialHubPanel })));
const RevisionCasos = lazy(() => import("@/components/hr/RevisionCasos").then((m) => ({ default: m.RevisionCasos })));
const ArgosAjustesContenido = lazy(() => import("@/pages/hr/ArgosAjustes").then((m) => ({ default: m.ArgosAjustesContenido })));
const ContextoEmpresaPanel = lazy(() => import("@/components/hr/ContextoEmpresaPanel").then((m) => ({ default: m.ContextoEmpresaPanel })));

/** Mientras baja una pestaña: la misma ruedita de carga de la app. */
const CargandoPestana = () => (
  <div className="mt-10 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
);

// Panel de RRHH del monitor de cámara de Cowork. Muestra en vivo las faltas que
// registra el monitor (cámara apagada/tapada, se fue, cara incompleta, celular,
// distraído), con la captura cuando la IA la guardó, y desde acá RRHH actúa:
// marca falta, descarta (falsa alarma), anota o prepara un borrador de correo.
// Arriba, el "rondín": cuándo pasó el robot por última vez y cuántos hay en sala.
// A la derecha, el ranking de faltas confirmadas por persona. El admin prende/
// apaga el monitor y ajusta cada cuánto mira la IA. Todo el texto va por t().

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

type Tr = (k: TranslationKey, vars?: Record<string, string | number>) => string;


function PanelAjustes({ t }: { t: Tr }) {
  const { toast } = useToast();
  const { config } = useMonitorConfig(true);
  const [activo, setActivo] = useState(true);
  const [intervalo, setIntervalo] = useState(120);
  const [avisar, setAvisar] = useState(true);
  const [avisarCaptura, setAvisarCaptura] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!config) return;
    setActivo(config.activo);
    setIntervalo(config.intervaloIaSeg);
    setAvisar(config.avisarSupervisor);
    setAvisarCaptura(config.avisarCaptura);
  }, [config]);

  const guardar = async () => {
    setGuardando(true);
    try {
      const { error } = await sinTipar.from("monitor_config").update({
        activo,
        intervalo_ia_seg: Math.max(30, Math.min(900, Math.round(intervalo))),
        avisar_supervisor: avisar,
        vigilancia_app: false,
        avisar_captura: avisarCaptura,
        updated_at: new Date().toISOString(),
      }).eq("id", 1);
      if (error) throw error;
      toast({ title: t("hr.monia.guardado") });
    } catch (err) {
      toast({ title: t("hr.monia.errorGuardar"), description: (err as Error).message, variant: "destructive" });
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Card className="border-border/60">
      <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-end sm:gap-6">
        <div className="flex items-center gap-3">
          <Switch checked={activo} onCheckedChange={setActivo} id="monia-activo" />
          <Label htmlFor="monia-activo" className="cursor-pointer text-sm">{t("hr.monia.cfg.activo")}</Label>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <Switch checked={avisarCaptura} onCheckedChange={setAvisarCaptura} id="monia-aviso-cap" />
            <Label htmlFor="monia-aviso-cap" className="cursor-pointer text-sm font-medium">{t("hr.monia.cfg.avisarCaptura")}</Label>
          </div>
          <p className="max-w-xs text-[11px] text-muted-foreground">{t("hr.monia.cfg.avisarCapturaHint")}</p>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="monia-int" className="text-xs text-muted-foreground">{t("hr.monia.cfg.intervalo")}</Label>
          <Input
            id="monia-int"
            type="number"
            min={30}
            max={900}
            value={intervalo}
            onChange={(ev) => setIntervalo(Number(ev.target.value))}
            className="w-28"
          />
        </div>
        <Button onClick={guardar} disabled={guardando} size="sm" className="sm:ml-auto">
          {guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
          {t("hr.monia.guardar")}
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Modal: nota libre sobre un evento ──
export default function HRMonitorIA() {
  const { t } = useLanguage();
  const { isAdmin } = useUserRole();
  const { esDueno } = useEsDueno();
  const { esRh } = useEsRh();
  // HR (Andrea) ve la vista COMPLETA igual que un admin (el historial por turno),
  // aunque su nivel sea agente. La RLS ya filtra que no vea a los admins.
  const { canFunction } = usePermissions();
  const { toast } = useToast();
  const vePresencia = canFunction("N:argos.presencia", true);
  const veExpediente = canFunction("N:argos.expediente", true);
  const ajustaArgos = canFunction("N:argos.ajustes", isAdmin);
  const vistaCompleta = canFunction("N:argos.expediente", isAdmin || esRh === true);
  // Exportar las horas del MES (del 1 a hoy) a una hoja, de un clic (Alvaro 08/11).
  const exportar = useExportarHorasAHoja();
  const exportarHoras = () => {
    const hoy = new Date();
    const yyyyMmDd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const desde = yyyyMmDd(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
    const hasta = yyyyMmDd(hoy);
    exportar.mutate({ desde, hasta }, {
      onSuccess: ({ id }) => window.open(`/hoja/${id}`, "_blank"),
      onError: (e) => toast({ title: t("hr.monia.exportError"), description: (e as Error).message, variant: "destructive" }),
    });
  };
  const { config } = useMonitorConfig(true);

  // Argos en 3 PESTAÑAS (Alvaro, 08/11): antes eran 5 y se pisaban.
  //   · Ahora  = el piso en vivo: tablero de caras con semáforo + muralla de pantallazos.
  //   · El día = resumen del día (números + tendencia) + historial por turno.
  //   · Ajustes.
  // La pestaña vive en la URL (?t=…) para volver DONDE ESTABAS al entrar a un
  // perfil y pulsar atrás. Mapeamos los nombres viejos (panel/equipo/envivo/
  // historial) a los nuevos para no romper links guardados.
  //   · Llamadas (13/11/2026) = a quién se le corta la llamada hoy y por qué.
  //   · Historial del Hub (19/11/2026) = qué quitaron los supervisores, cuándo y por qué.
  type TabArgos = "donde" | "ahora" | "dia" | "llamadas" | "hub" | "revision" | "ajustes";
  const [searchParams, setSearchParams] = useSearchParams();
  const VIEJO_A_NUEVO: Record<string, TabArgos> = {
    donde: "donde", ahora: "ahora", dia: "dia", llamadas: "llamadas", hub: "hub", revision: "revision", ajustes: "ajustes",
    equipo: "ahora", envivo: "ahora", panel: "dia", historial: "dia", resumen: "dia", atencion: "ahora",
  };
  const tabURL = searchParams.get("t");
  // Al entrar a Argos se cae en «Dónde está» (Alvaro, 10/11: «necesito saber
  // dónde está el empleado en todo momento»); antes era «El día» (08/11).
  const solicitada: TabArgos = (tabURL && VIEJO_A_NUEVO[tabURL]) || "donde";
  const tabPermitida = (k: TabArgos) => k === "ajustes" ? ajustaArgos : k === "dia" ? veExpediente : k === "revision" ? true : vePresencia;
  const tab: TabArgos = tabPermitida(solicitada) ? solicitada : vePresencia ? "donde" : veExpediente ? "dia" : ajustaArgos ? "ajustes" : "revision";
  const setTab = (k: TabArgos) => setSearchParams((prev) => { const n = new URLSearchParams(prev); n.set("t", k); return n; }, { replace: true });

  // Revisión de RR. HH. (19/11/2026): la ve quien tenga alguna función de la
  // revisión en su puesto (o el dueño).
  const funcionesCasos = useFuncionesCasos();
  const veCasos = veRevision(funcionesCasos.data);

  // Las otras pestañas bajan en ocio una vez abierta la primera (de a una, con
  // un respiro entre cada una), así al tocarlas ya están.
  useEffect(() => {
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
    const pendientes = Object.values(cargarPestanas);
    let cancelado = false;
    let t: number | undefined;
    const siguiente = () => {
      const cargar = pendientes.shift();
      // En llamada no se baja nada (cada KB es para el video): la pestaña bajará al tocarla.
      if (cancelado || !cargar || estaEnLlamadaDeMaven()) return;
      cargar().catch(() => { /* bajará al tocar la pestaña */ }).finally(() => { t = window.setTimeout(siguiente, 800); });
    };
    const id = typeof w.requestIdleCallback === "function" ? w.requestIdleCallback(siguiente, { timeout: 4_000 }) : undefined;
    if (id === undefined) t = window.setTimeout(siguiente, 1_500);
    return () => { cancelado = true; if (id !== undefined) w.cancelIdleCallback?.(id); window.clearTimeout(t); };
  }, []);

  const monitorOff = config ? !config.activo : false;
  const horariosEq = useHorariosEquipo();

  return (
    <Page>
      <PageHeader
        title={t("hr.monia.title")}
        subtitle={t("hr.monia.subtitle")}
        icon={<Eye className="h-5 w-5" />}
        actions={
          <>
            {/* Horarios del equipo (19/11/2026): solo si tiene a alguien a cargo. */}
            {(horariosEq.data?.length ?? 0) > 0 && (
              <Button asChild variant="outline" size="sm" className="rounded-full">
                <Link to="/hr/horarios-equipo"><CalendarClock className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">{t("hr.horEq.abrir")}</span></Link>
              </Button>
            )}
            {vistaCompleta && (
              <Button variant="outline" size="sm" className="rounded-full" onClick={exportarHoras} disabled={exportar.isPending}>
                {exportar.isPending ? <Loader2 className="h-4 w-4 animate-spin sm:mr-1.5" /> : <FileSpreadsheet className="h-4 w-4 sm:mr-1.5" />}
                <span className="hidden sm:inline">{t("hr.monia.exportarHoras")}</span>
              </Button>
            )}
            <Badge
              variant="outline"
              className={`gap-1.5 px-3 py-1.5 text-xs font-medium ${monitorOff ? "border-warning/50 bg-warning/10 text-warning" : "border-success/50 bg-success/10 text-success"}`}
            >
              <Eye className="h-3 w-3" />
              {monitorOff ? t("hr.monia.apagado") : t("hr.monia.activo")}
            </Badge>
          </>
        }
      />

      {/* Pestañas de Argos (3) */}
      {(() => {
        const tabs: Array<{ k: TabArgos; label: string }> = [
          { k: "donde", label: t("hr.monia.tab.donde") },
          { k: "dia", label: t("hr.monia.tab.dia") },
          { k: "ahora", label: t("hr.monia.tab.ahora") },
          { k: "llamadas", label: t("hr.monia.tab.llamadas") },
          { k: "hub", label: t("hr.monia.tab.hub") },
          ...(veCasos ? [{ k: "revision" as TabArgos, label: t("hr.monia.tab.revision") }] : []),
          ...(ajustaArgos ? [{ k: "ajustes" as TabArgos, label: t("hr.monia.tab.ajustes") }] : []),
        ];
        return (
          <div className="mt-4 flex gap-1 overflow-x-auto rounded-2xl border border-border/50 bg-background/40 p-1">
            {tabs.filter(x => tabPermitida(x.k)).map((x) => (
              <button
                key={x.k}
                type="button"
                onClick={() => setTab(x.k)}
                className={`shrink-0 rounded-xl px-4 py-2 text-sm font-semibold transition ${tab === x.k ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {x.label}
              </button>
            ))}
          </div>
        );
      })()}

      {/* DÓNDE ESTÁ — cada empleado ahora: en Cowork o fuera, qué tiene en pantalla. */}
      {tab === "donde" && (
        <div className="mt-5">
          <DondeEstaPanel />
        </div>
      )}

      <Suspense fallback={<CargandoPestana />}>
      {/* AHORA — el piso en vivo: tablero de caras con semáforo + muralla de pantallazos. */}
      {tab === "ahora" && (
        <div className="mt-5 flex flex-col gap-5">
          <ConectadosAhoraPanel />
          <PantallazosVivoPanel />
        </div>
      )}

      {/* EL DÍA — UN SOLO bloque (Alvaro, 08/11): el Historial (turnos → dentro
          de cada turno su gente, quién está mal de ESE turno). Se quitó el
          "Panel del día" de abajo que repetía el mismo ranking y se sentía
          revuelto. Quien no es admin cae al resumen simple. */}
      {tab === "dia" && (
        <div className="mt-5 flex flex-col gap-5">
          {vistaCompleta ? <ArgosHistorial /> : <ArgosPanelDia />}
        </div>
      )}

      {/* LLAMADAS — a quién se le corta la llamada hoy, por qué, su internet
          medido de verdad y si la cancelación de ruido le corre (13/11/2026). */}
      {tab === "llamadas" && (
        <div className="mt-5 flex flex-col gap-8">
          {/* ESTADO (18/11/2026): todo lo que Argos reporta hoy, uno por uno. */}
          <EstadoPanel />
          {/* ¿Las llamadas mejoran? Solo el dueño (18/11/2026). */}
          {esDueno === true && <TableroCalidadLlamadas />}
          <LlamadasPanel />
        </div>
      )}

      {/* HISTORIAL DEL HUB — cada vez que un supervisor quitó la pantalla, apagó
          la cámara o salió del Hub, con la causa: a propósito o falla (19/11/2026). */}
      {tab === "hub" && (
        <div className="mt-5">
          <HistorialHubPanel />
        </div>
      )}

      {/* REVISIÓN DE RR. HH. — un caso por persona y día: cometió, no cometió o
          justificado, con su frase; y el reporte limpio (19/11/2026). */}
      {tab === "revision" && veCasos && (
        <div className="mt-5">
          <RevisionCasos />
        </div>
      )}

      {/* Ajustes (solo dueño): 4 secciones limpias — Argos general, la voz, qué
          avisa (situaciones) y el contexto. Lo viejo (KPIs de faltas, lista de
          eventos, ranking) se jubiló: esos números viven en Resumen del día y
          Atención ahora (Alvaro, 02/11). */}
      {tab === "ajustes" && ajustaArgos && (
        <div className="mt-5 flex flex-col gap-4">
          {/* El Centro de control de Argos: voz (Javi), las 15 situaciones y la
              mezcla. Reemplaza el panel viejo del selector de voz para que haya
              un solo lugar, sin confusión con Mario ni la robótica de Jhon. */}
          <ArgosAjustesContenido />
          {/* Argos general (prender/apagar el monitor) */}
          <PanelAjustes t={t} />
          {/* El contexto de la empresa */}
          <ContextoEmpresaPanel />
        </div>
      )}
      </Suspense>
    </Page>
  );
}
