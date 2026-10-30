import { useEffect, useMemo, useState } from "react";
import { isToday, format } from "date-fns";
import {
  Eye, VideoOff, UserX, Smartphone, ScanFace, AlertTriangle, Users,
  RefreshCw, Loader2, ImageIcon, Cpu, Activity,
} from "lucide-react";
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
import { UserAvatar } from "@/components/UserAvatar";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { HRMetricCard } from "@/components/hr/HRMetricCard";
import { useMonitorEventos, urlCaptura, type MonitorEvento } from "@/hooks/useMonitorEventos";
import { useMonitorConfig } from "@/hooks/useMonitorConfig";
import { LABEL_FALTA, type FaltaTipo } from "@/lib/monitorFaltas";
import type { TranslationKey } from "@/lib/i18n";

// Panel de RRHH del monitor de cámara de Cowork. Muestra en vivo las faltas que
// registra el monitor (cámara apagada/tapada, se fue, cara incompleta, celular,
// distraído) por persona, con la captura cuando la IA la guardó. El admin prende/
// apaga el monitor y ajusta cada cuánto mira la IA. Todo el texto va por t().

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

// La etiqueta de cada falta vive en el catálogo único (lib/monitorFaltas); acá
// solo el ícono y si es grave, que son decisiones de presentación.
const ESTILO_TIPO: Record<FaltaTipo, { icon: typeof VideoOff; grave: boolean }> = {
  camara_apagada: { icon: VideoOff, grave: true },
  camara_tapada: { icon: VideoOff, grave: false },
  se_fue: { icon: UserX, grave: true },
  cara_incompleta: { icon: ScanFace, grave: false },
  celular: { icon: Smartphone, grave: true },
  distraido: { icon: Eye, grave: true },
  no_mira: { icon: Eye, grave: true },
};

function FilaEvento({ e, t }: { e: MonitorEvento; t: (k: TranslationKey) => string }) {
  const estilo = ESTILO_TIPO[e.tipo as FaltaTipo];
  const label = LABEL_FALTA[e.tipo as FaltaTipo];
  const Icono = estilo?.icon ?? AlertTriangle;
  const abrirCaptura = async () => {
    if (!e.captura_path) return;
    const u = await urlCaptura(e.captura_path);
    if (u) window.open(u, "_blank", "noopener");
  };
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/50 bg-card px-3 py-2.5">
      <UserAvatar name={e.nombre ?? ""} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{e.nombre ?? t("hr.noName")}</span>
          <Badge variant={estilo?.grave ? "destructive" : "secondary"} className="gap-1 px-2 py-0.5 text-[11px]">
            <Icono className="h-3 w-3" />
            {label ? t(label) : e.tipo}
          </Badge>
          <Badge variant="outline" className="gap-1 px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {e.fuente === "ia" ? <Cpu className="h-2.5 w-2.5" /> : <Activity className="h-2.5 w-2.5" />}
            {e.fuente === "ia" ? t("hr.monia.source.ia") : t("hr.monia.source.auto")}
          </Badge>
        </div>
        {e.detalle && <p className="truncate text-xs text-muted-foreground">{e.detalle}</p>}
      </div>
      {e.captura_path && (
        <Button variant="ghost" size="sm" className="shrink-0 gap-1 text-xs" onClick={abrirCaptura}>
          <ImageIcon className="h-3.5 w-3.5" />
          {t("hr.monia.verCaptura")}
        </Button>
      )}
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {format(new Date(e.created_at), "HH:mm")}
      </span>
    </div>
  );
}

function PanelAjustes({ t }: { t: (k: TranslationKey) => string }) {
  const { toast } = useToast();
  const { config } = useMonitorConfig(true);
  const [activo, setActivo] = useState(true);
  const [intervalo, setIntervalo] = useState(120);
  const [avisar, setAvisar] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!config) return;
    setActivo(config.activo);
    setIntervalo(config.intervaloIaSeg);
    setAvisar(config.avisarSupervisor);
  }, [config]);

  const guardar = async () => {
    setGuardando(true);
    try {
      const { error } = await sinTipar.from("monitor_config").update({
        activo,
        intervalo_ia_seg: Math.max(30, Math.min(900, Math.round(intervalo))),
        avisar_supervisor: avisar,
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
        <div className="flex items-center gap-3">
          <Switch checked={avisar} onCheckedChange={setAvisar} id="monia-avisar" />
          <Label htmlFor="monia-avisar" className="cursor-pointer text-sm">{t("hr.monia.cfg.avisar")}</Label>
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

export default function HRMonitorIA() {
  const { t } = useLanguage();
  const { isAdmin } = useUserRole();
  const { eventos, cargando, error, refrescar } = useMonitorEventos();
  const { config } = useMonitorConfig(true);

  const hoy = useMemo(() => eventos.filter((e) => isToday(new Date(e.created_at))), [eventos]);
  const personas = useMemo(() => new Set(hoy.map((e) => e.user_id)).size, [hoy]);
  const enCel = useMemo(() => hoy.filter((e) => e.tipo === "celular" || e.tipo === "distraido" || e.tipo === "no_mira").length, [hoy]);
  const camOff = useMemo(() => hoy.filter((e) => e.tipo === "camara_apagada" || e.tipo === "camara_tapada").length, [hoy]);

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
            <Button variant="outline" size="sm" onClick={() => refrescar()}>
              <RefreshCw className="mr-1.5 h-4 w-4" />
              {t("hr.monia.refrescar")}
            </Button>
          </>
        }
      />

      <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
        <HRMetricCard title={t("hr.monia.kpi.hoy")} value={hoy.length} icon={AlertTriangle} color={hoy.length > 0 ? "warning" : "default"} subtitle={t("hr.monia.kpi.hoySub")} />
        <HRMetricCard title={t("hr.monia.kpi.personas")} value={personas} icon={Users} color="primary" subtitle={t("hr.monia.kpi.personasSub")} />
        <HRMetricCard title={t("hr.monia.kpi.celular")} value={enCel} icon={Smartphone} color={enCel > 0 ? "destructive" : "default"} subtitle={t("hr.monia.kpi.celularSub")} />
        <HRMetricCard title={t("hr.monia.kpi.camOff")} value={camOff} icon={VideoOff} color={camOff > 0 ? "warning" : "default"} subtitle={t("hr.monia.kpi.camOffSub")} />
      </div>

      {isAdmin && <div className="mt-4"><PanelAjustes t={t} /></div>}

      <div className="mt-5">
        {error && eventos.length === 0 ? (
          <div className="mx-auto mt-6 max-w-md rounded-card border border-destructive/40 bg-destructive/5 p-6 text-center">
            <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-destructive" />
            <p className="text-sm text-foreground">{t("hr.monia.error")}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => refrescar()}>
              {t("hr.monia.reintentar")}
            </Button>
          </div>
        ) : cargando && eventos.length === 0 ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : eventos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center text-muted-foreground">
            <Eye className="mb-3 h-8 w-8 opacity-40" />
            <p className="text-sm">{t("hr.monia.vacio")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {eventos.map((e) => <FilaEvento key={e.id} e={e} t={t} />)}
          </div>
        )}
      </div>
    </Page>
  );
}
