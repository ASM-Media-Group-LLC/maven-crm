import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { isToday, format } from "date-fns";
import {
  Eye, VideoOff, UserX, Smartphone, ScanFace, AlertTriangle, Users,
  RefreshCw, Loader2, ImageIcon, Cpu, Activity, Check, X, StickyNote,
  Mail, Copy, Trophy,
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
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { UserAvatar } from "@/components/UserAvatar";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { HRMetricCard } from "@/components/hr/HRMetricCard";
import { useMonitorEventos, urlCaptura, type MonitorEvento } from "@/hooks/useMonitorEventos";
import { useMonitorConfig } from "@/hooks/useMonitorConfig";
import { useMonitorRanking } from "@/hooks/useMonitorPanel";
import { ConectadosAhoraPanel } from "@/components/hr/ConectadosAhoraPanel";
import { RondinVivoPanel } from "@/components/hr/RondinVivoPanel";
import { PantallazosVivoPanel } from "@/components/hr/PantallazosVivoPanel";
import { ContextoEmpresaPanel } from "@/components/hr/ContextoEmpresaPanel";
import { AtencionAhoraPanel } from "@/components/hr/AtencionAhoraPanel";
import { ResumenDiaPanel } from "@/components/hr/ResumenDiaPanel";
import { ArgosSituacionesPanel } from "@/components/hr/ArgosSituacionesPanel";
import { LABEL_FALTA, type FaltaTipo } from "@/lib/monitorFaltas";
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

type Filtro = "pendiente" | "falta" | "todos";

function FilaEvento({
  e, t, actuando, onFalta, onDescartar, onNota, onCorreo,
}: {
  e: MonitorEvento;
  t: Tr;
  actuando: boolean;
  onFalta: () => void;
  onDescartar: () => void;
  onNota: () => void;
  onCorreo: () => void;
}) {
  const estilo = ESTILO_TIPO[e.tipo as FaltaTipo];
  const label = LABEL_FALTA[e.tipo as FaltaTipo];
  const Icono = estilo?.icon ?? AlertTriangle;
  const abrirCaptura = async () => {
    if (!e.captura_path) return;
    const u = await urlCaptura(e.captura_path);
    if (u) window.open(u, "_blank", "noopener");
  };
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border/50 bg-card px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <UserAvatar name={e.nombre ?? ""} size="sm" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{e.nombre ?? t("hr.noName")}</span>
            <Badge variant={estilo?.grave ? "destructive" : "secondary"} className="gap-1 px-2 py-0.5 text-[11px]">
              <Icono className="h-3 w-3" />
              {label ? t(label) : e.tipo}
            </Badge>
            <Badge variant="outline" className="gap-1 px-1.5 py-0.5 text-[10px] text-muted-foreground">
              {e.fuente === "ia" ? <Cpu className="h-2.5 w-2.5" /> : <Activity className="h-2.5 w-2.5" />}
              {e.fuente === "ia" ? t("hr.monia.source.ia") : t("hr.monia.source.auto")}
            </Badge>
            {e.estado === "falta" && (
              <Badge className="gap-1 bg-destructive/15 px-1.5 py-0.5 text-[10px] text-destructive">{t("hr.monia.estado.falta")}</Badge>
            )}
            {e.estado === "descartado" && (
              <Badge variant="outline" className="px-1.5 py-0.5 text-[10px] text-muted-foreground line-through">{t("hr.monia.estado.descartado")}</Badge>
            )}
          </div>
          {e.detalle && <p className="truncate text-xs text-muted-foreground">{e.detalle}</p>}
          {e.nota && <p className="truncate text-xs italic text-primary/80">“{e.nota}”</p>}
        </div>
        {e.captura_path && (
          <button type="button" onClick={abrirCaptura} className="shrink-0 rounded-control border border-border/50 p-0.5" title={t("hr.monia.verCaptura")}>
            <ImageIcon className="h-7 w-7 p-1 text-muted-foreground" />
          </button>
        )}
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {format(new Date(e.created_at), "HH:mm")}
        </span>
      </div>

      {/* Acciones de RRHH */}
      <div className="flex shrink-0 flex-wrap items-center gap-1.5 border-t border-border/40 pt-2 sm:border-t-0 sm:pt-0">
        {e.estado !== "falta" && (
          <Button size="sm" variant="outline" className="h-7 gap-1 px-2 text-[11px]" disabled={actuando} onClick={onFalta}>
            <Check className="h-3 w-3" /> {t("hr.monia.accion.falta")}
          </Button>
        )}
        {e.estado !== "descartado" && (
          <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px] text-muted-foreground" disabled={actuando} onClick={onDescartar}>
            <X className="h-3 w-3" /> {t("hr.monia.accion.descartar")}
          </Button>
        )}
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px] text-muted-foreground" onClick={onNota}>
          <StickyNote className="h-3 w-3" /> {t("hr.monia.accion.nota")}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 gap-1 px-2 text-[11px] text-muted-foreground" onClick={onCorreo}>
          <Mail className="h-3 w-3" /> {t("hr.monia.accion.correo")}
        </Button>
      </div>
    </div>
  );
}

// ── Ranking de faltas confirmadas por persona ──
function PanelRanking({ t }: { t: Tr }) {
  const { ranking } = useMonitorRanking(7);
  const top = ranking.slice(0, 8);
  return (
    <Card className="border-border/60">
      <CardContent className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Trophy className="h-4 w-4 text-warning" />
          <div>
            <p className="text-sm font-semibold text-foreground">{t("hr.monia.rank.title")}</p>
            <p className="text-xs text-muted-foreground">{t("hr.monia.rank.sub")}</p>
          </div>
        </div>
        {top.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">{t("hr.monia.rank.vacio")}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {top.map((r, i) => (
              <div key={r.user_id} className="flex items-center gap-2.5">
                <span className="w-4 shrink-0 text-center text-xs font-semibold tabular-nums text-muted-foreground">{i + 1}</span>
                <UserAvatar name={r.nombre ?? ""} size="sm" />
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{r.nombre ?? t("hr.noName")}</span>
                <Badge variant={i === 0 ? "destructive" : "secondary"} className="shrink-0 tabular-nums">
                  {t("hr.monia.rank.faltas", { count: r.total })}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function PanelAjustes({ t }: { t: Tr }) {
  const { toast } = useToast();
  const { config } = useMonitorConfig(true);
  const [activo, setActivo] = useState(true);
  const [intervalo, setIntervalo] = useState(120);
  const [avisar, setAvisar] = useState(true);
  const [vigilanciaApp, setVigilanciaApp] = useState(false);
  const [avisarCaptura, setAvisarCaptura] = useState(true);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!config) return;
    setActivo(config.activo);
    setIntervalo(config.intervaloIaSeg);
    setAvisar(config.avisarSupervisor);
    setVigilanciaApp(config.vigilanciaApp);
    setAvisarCaptura(config.avisarCaptura);
  }, [config]);

  const guardar = async () => {
    setGuardando(true);
    try {
      const { error } = await sinTipar.from("monitor_config").update({
        activo,
        intervalo_ia_seg: Math.max(30, Math.min(900, Math.round(intervalo))),
        avisar_supervisor: avisar,
        vigilancia_app: vigilanciaApp,
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
            <Switch checked={vigilanciaApp} onCheckedChange={setVigilanciaApp} id="monia-vigapp" />
            <Label htmlFor="monia-vigapp" className="cursor-pointer text-sm font-medium">{t("hr.monia.cfg.vigilanciaApp")}</Label>
          </div>
          <p className="max-w-xs text-[11px] text-muted-foreground">{t("hr.monia.cfg.vigilanciaAppHint")}</p>
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
function DialogNota({ evento, t, onGuardar, onClose }: {
  evento: MonitorEvento | null; t: Tr; onGuardar: (nota: string) => Promise<void>; onClose: () => void;
}) {
  const [texto, setTexto] = useState("");
  const [guardando, setGuardando] = useState(false);
  useEffect(() => { setTexto(evento?.nota ?? ""); }, [evento]);
  if (!evento) return null;
  const guardar = async () => {
    setGuardando(true);
    try { await onGuardar(texto); onClose(); } finally { setGuardando(false); }
  };
  return (
    <Dialog open={!!evento} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("hr.monia.nota.title")}</DialogTitle>
          <DialogDescription>{evento.nombre ?? t("hr.noName")}</DialogDescription>
        </DialogHeader>
        <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} placeholder={t("hr.monia.nota.ph")} rows={4} />
        <DialogFooter>
          <Button onClick={guardar} disabled={guardando}>
            {guardando && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}
            {t("hr.monia.nota.guardar")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Modal: borrador de correo (RRHH lo copia y lo manda) ──
function DialogCorreo({ evento, t, onClose }: { evento: MonitorEvento | null; t: Tr; onClose: () => void }) {
  const { toast } = useToast();
  if (!evento) return null;
  const label = LABEL_FALTA[evento.tipo as FaltaTipo];
  const motivo = (label ? t(label) : evento.tipo) + (evento.detalle ? ` — ${evento.detalle}` : "");
  const asunto = t("hr.monia.correo.asuntoText");
  const cuerpo = t("hr.monia.correo.cuerpo", {
    nombre: evento.nombre ?? t("hr.noName"),
    fecha: format(new Date(evento.created_at), "d MMM yyyy"),
    hora: format(new Date(evento.created_at), "HH:mm"),
    motivo,
  });
  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(`${asunto}\n\n${cuerpo}`);
      toast({ title: t("hr.monia.correo.copiado") });
    } catch {
      toast({ title: t("hr.monia.errorAccion"), variant: "destructive" });
    }
  };
  return (
    <Dialog open={!!evento} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("hr.monia.correo.title")}</DialogTitle>
          <DialogDescription>{t("hr.monia.correo.desc")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">{t("hr.monia.correo.asunto")}</Label>
            <Input defaultValue={asunto} readOnly />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs text-muted-foreground">{t("hr.monia.correo.cuerpoLabel")}</Label>
            <Textarea defaultValue={cuerpo} rows={9} className="text-sm" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={copiar} className="gap-1.5"><Copy className="h-4 w-4" /> {t("hr.monia.correo.copiar")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function HRMonitorIA() {
  const { t } = useLanguage();
  const { isAdmin } = useUserRole();
  const { eventos, cargando, error, refrescar, marcarFalta, descartar, guardarNota, actuando } = useMonitorEventos();
  const { config } = useMonitorConfig(true);
  const { toast } = useToast();

  const [filtro, setFiltro] = useState<Filtro>("pendiente");
  const [notaDe, setNotaDe] = useState<MonitorEvento | null>(null);
  const [correoDe, setCorreoDe] = useState<MonitorEvento | null>(null);
  // Argos en PESTAÑAS. Entra en «Conectados ahora» (el tablero de personal); el
  // vivo y las alertas quedan en sus pestañas. La pestaña vive en la URL (?t=…)
  // para que al entrar a un perfil y volver (atrás del navegador) Argos te deje
  // DONDE ESTABAS, no reiniciado (Álvaro, 02/11).
  type TabArgos = "equipo" | "envivo" | "atencion" | "resumen" | "ajustes";
  const [searchParams, setSearchParams] = useSearchParams();
  const TABS_VALIDAS: TabArgos[] = ["equipo", "envivo", "atencion", "resumen", "ajustes"];
  const tabURL = searchParams.get("t") as TabArgos | null;
  const tab: TabArgos = tabURL && TABS_VALIDAS.includes(tabURL) ? tabURL : "equipo";
  const setTab = (k: TabArgos) => setSearchParams((prev) => { const n = new URLSearchParams(prev); n.set("t", k); return n; }, { replace: true });

  const hoy = useMemo(() => eventos.filter((e) => isToday(new Date(e.created_at))), [eventos]);
  const personas = useMemo(() => new Set(hoy.map((e) => e.user_id)).size, [hoy]);
  const enCel = useMemo(() => hoy.filter((e) => e.tipo === "celular" || e.tipo === "distraido" || e.tipo === "no_mira").length, [hoy]);
  const camOff = useMemo(() => hoy.filter((e) => e.tipo === "camara_apagada" || e.tipo === "camara_tapada").length, [hoy]);
  const nPend = useMemo(() => eventos.filter((e) => e.estado === "pendiente").length, [eventos]);
  const nFalta = useMemo(() => eventos.filter((e) => e.estado === "falta").length, [eventos]);

  const lista = useMemo(() => {
    if (filtro === "todos") return eventos;
    return eventos.filter((e) => e.estado === filtro);
  }, [eventos, filtro]);

  const monitorOff = config ? !config.activo : false;

  const accion = async (fn: () => Promise<void>, okKey: TranslationKey) => {
    try { await fn(); toast({ title: t(okKey) }); }
    catch (err) { toast({ title: t("hr.monia.errorAccion"), description: (err as Error).message, variant: "destructive" }); }
  };

  const FILTROS: Array<{ k: Filtro; tk: TranslationKey; n?: number }> = [
    { k: "pendiente", tk: "hr.monia.filtro.pendientes", n: nPend },
    { k: "falta", tk: "hr.monia.filtro.faltas", n: nFalta },
    { k: "todos", tk: "hr.monia.filtro.todos" },
  ];

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

      {/* Pestañas de Argos */}
      {(() => {
        const tabs: Array<{ k: TabArgos; label: string }> = [
          { k: "equipo", label: t("hr.monia.tab.equipo") },
          { k: "envivo", label: t("hr.monia.tab.envivo") },
          { k: "atencion", label: t("hr.monia.tab.atencion") },
          { k: "resumen", label: t("hr.monia.tab.resumen") },
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

      {/* ENTRADA — Notas del equipo: el equipo y su día; clic en alguien → su día. */}
      {tab === "equipo" && <div className="mt-5"><ConectadosAhoraPanel /></div>}

      {/* Pantallazos en vivo: la muralla (Muralla/Cuadrícula/Lista). */}
      {tab === "envivo" && <div className="mt-5"><PantallazosVivoPanel /></div>}

      {/* Resumen del día: quién va mejor/peor hoy, con la película del día. */}
      {tab === "resumen" && <div className="mt-5"><ResumenDiaPanel /></div>}

      {/* Atención ahora + el rondín (estado de cada quien AHORA). */}
      {tab === "atencion" && (
        <>
          <div className="mt-5"><AtencionAhoraPanel /></div>
          <div className="mt-5"><RondinVivoPanel /></div>
        </>
      )}

      {/* Ajustes (solo dueño): 4 secciones limpias — Argos general, la voz, qué
          avisa (situaciones) y el contexto. Lo viejo (KPIs de faltas, lista de
          eventos, ranking) se jubiló: esos números viven en Resumen del día y
          Atención ahora (Alvaro, 02/11). */}
      {tab === "ajustes" && isAdmin && (
        <div className="mt-5 flex flex-col gap-4">
          {/* 1) Argos general */}
          <PanelAjustes t={t} />
          {/* 2) La voz · 3) Qué avisa (situaciones) */}
          <ArgosSituacionesPanel />
          {/* 4) El contexto de la empresa */}
          <ContextoEmpresaPanel />
        </div>
      )}
    </Page>
  );
}
