import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Eye, Loader2 } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useUserRole } from "@/hooks/useUserRole";
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
import { ConectadosAhoraPanel } from "@/components/hr/ConectadosAhoraPanel";
import { PantallazosVivoPanel } from "@/components/hr/PantallazosVivoPanel";
import { ContextoEmpresaPanel } from "@/components/hr/ContextoEmpresaPanel";
import { ArgosPanelDia } from "@/components/hr/ArgosPanelDia";
import { ArgosHistorial } from "@/components/hr/ArgosHistorial";
import { ArgosAjustesContenido } from "@/pages/hr/ArgosAjustes";
import type { TranslationKey } from "@/lib/i18n";

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
  const { config } = useMonitorConfig(true);

  // Argos en 3 PESTAÑAS (Alvaro, 08/11): antes eran 5 y se pisaban.
  //   · Ahora  = el piso en vivo: tablero de caras con semáforo + muralla de pantallazos.
  //   · El día = resumen del día (números + tendencia) + historial por turno.
  //   · Ajustes.
  // La pestaña vive en la URL (?t=…) para volver DONDE ESTABAS al entrar a un
  // perfil y pulsar atrás. Mapeamos los nombres viejos (panel/equipo/envivo/
  // historial) a los nuevos para no romper links guardados.
  type TabArgos = "ahora" | "dia" | "ajustes";
  const [searchParams, setSearchParams] = useSearchParams();
  const VIEJO_A_NUEVO: Record<string, TabArgos> = {
    ahora: "ahora", dia: "dia", ajustes: "ajustes",
    equipo: "ahora", envivo: "ahora", panel: "dia", historial: "dia", resumen: "dia", atencion: "ahora",
  };
  const tabURL = searchParams.get("t");
  // Al entrar a Argos se cae en "El día" (ahí están los días para ir hacia
  // atrás), no en "En vivo" (Alvaro, 08/11).
  const tab: TabArgos = (tabURL && VIEJO_A_NUEVO[tabURL]) || "dia";
  const setTab = (k: TabArgos) => setSearchParams((prev) => { const n = new URLSearchParams(prev); n.set("t", k); return n; }, { replace: true });

  const monitorOff = config ? !config.activo : false;

  return (
    <Page>
      <PageHeader
        title={t("hr.monia.title")}
        subtitle={t("hr.monia.subtitle")}
        icon={<Eye className="h-5 w-5" />}
        actions={
          <>
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
          { k: "dia", label: t("hr.monia.tab.dia") },
          { k: "ahora", label: t("hr.monia.tab.ahora") },
          ...(isAdmin ? [{ k: "ajustes" as TabArgos, label: t("hr.monia.tab.ajustes") }] : []),
        ];
        return (
          <div className="mt-4 flex gap-1 overflow-x-auto rounded-2xl border border-border/50 bg-background/40 p-1">
            {tabs.map((x) => (
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

      {/* AHORA — el piso en vivo: tablero de caras con semáforo + muralla de pantallazos. */}
      {tab === "ahora" && (
        <div className="mt-5 flex flex-col gap-5">
          <ConectadosAhoraPanel />
          <PantallazosVivoPanel />
        </div>
      )}

      {/* EL DÍA — el HISTORIAL primero (turnos), una sola gráfica (Alvaro, 08/11).
          Se quitó el "Panel del día" (tenía una 2ª tendencia duplicada). Para
          quien no es admin, cae al resumen simple. */}
      {tab === "dia" && (
        <div className="mt-5 flex flex-col gap-5">
          {isAdmin ? (
            <>
              {/* Historial primero (turnos + 1 gráfica); debajo los números de
                  disciplina + podio + cajas, SIN la tendencia duplicada. */}
              <ArgosHistorial />
              <ArgosPanelDia sinTendencia />
            </>
          ) : (
            <ArgosPanelDia />
          )}
        </div>
      )}

      {/* Ajustes (solo dueño): 4 secciones limpias — Argos general, la voz, qué
          avisa (situaciones) y el contexto. Lo viejo (KPIs de faltas, lista de
          eventos, ranking) se jubiló: esos números viven en Resumen del día y
          Atención ahora (Alvaro, 02/11). */}
      {tab === "ajustes" && isAdmin && (
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
    </Page>
  );
}
