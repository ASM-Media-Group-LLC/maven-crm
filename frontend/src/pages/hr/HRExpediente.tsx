import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronDown, AlertTriangle, ScreenShare, ScreenShareOff, CameraOff, ImageIcon, Loader2, Gauge, CalendarDays, Sparkles, ShieldCheck, Check, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import { UserAvatar } from "@/components/UserAvatar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { useExpedienteEmpleado, type DiaExpediente, type CapturaDia } from "@/hooks/useExpedienteEmpleado";
import { usePerdonarCaptura, usePuedePerdonar } from "@/hooks/usePerdonarCaptura";
import { urlCaptura } from "@/hooks/useMonitorEventos";
import { useArgosDia, useEvidenciaDia } from "@/hooks/useArgosJornada";
import type { HoraJornada } from "@/lib/argosJornada";
import { piezasEntre, type ClipArgos, type Momento, type Pieza } from "@/lib/argosMomentos";
import { BarraDelTurno } from "@/components/argos/BarraDelTurno";
import { Cuadrito, NOMBRE_ESTADO, hora, horaRedonda, pct, textoMin } from "@/components/argos/piezas";
import { LABEL_FALTA, type FaltaTipo } from "@/lib/monitorFaltas";
import type { BandaNota } from "@/lib/notaEmpleado";
import type { TranslationKey } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { correoTardanzaHTML } from "@/lib/correoTardanzaHtml";
import { a12, rango12 } from "@/lib/horaBogota";
import { ClipsDelDia } from "@/components/hr/ClipsDelDia";
import { AvisosDeArgos } from "@/components/hr/AvisosDeArgos";
import { TarjetaArgos } from "@/components/hr/TarjetaArgos";
import { Mail } from "lucide-react";

// Expediente del empleado, estilo Hubstaff: se abre en HOY, con su nota y sus
// horas arriba, y la TIRA de pantallazos del día —cada pantalla con su cámara
// pegada en la esquina— agrupada por hora. Para otros días, flechas ‹ ayer / hoy ›
// y un calendario opcional. Todo por t().
//
// 11/11 (Alvaro: «desde el clock in contabilizamos cada minuto»): los cuadritos
// suman minutos sin cámara, sin pantalla, almuerzo, fallas (cortes de 1 min o
// más) y cada cuánto, y horas productivas (90 % o más), todo del turno minuto a
// minuto (useArgosDia). Debajo de Argos, la barra del turno de la hora de
// entrada a la de salida; y la tira de pantallazos va hora por hora, en fila.

const TONO: Record<BandaNota, { bg: string; tx: string; bar: string; chip: string }> = {
  bien: { bg: "bg-success/15 border-success/30", tx: "text-success", bar: "bg-success", chip: "bg-success/10 text-success" },
  ojo: { bg: "bg-warning/15 border-warning/30", tx: "text-warning", bar: "bg-warning", chip: "bg-warning/10 text-warning" },
  mal: { bg: "bg-destructive/15 border-destructive/30", tx: "text-destructive", bar: "bg-destructive", chip: "bg-destructive/10 text-destructive" },
};

type Tr = (k: TranslationKey, v?: Record<string, string | number>) => string;

function sumarDias(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

// Abrir una captura del buzón por su path (las faltas de monitor_eventos nunca van al NAS).
const abrirPath = async (path: string) => { const u = await urlCaptura(path); if (u) window.open(u, "_blank", "noopener"); };

// LA TIRA DEL DÍA, POR HORA (Alvaro, 11/11/2026: «la grilla se ve barata»). Una
// fila por hora del turno, como Hubstaff: arriba cuántos pantallazos y
// grabaciones hubo, su % trabajando bien y si fue productiva (90 % o más);
// debajo, las miniaturas EN FILA, todas del mismo marco, con una sola línea de
// texto. Las fuera de lugar llevan el filo rojo y lo dicen en su línea (sin
// cartel encima). Las grabaciones de Argos van en su minuto, dentro de la fila.
type FiltroCaptura = "todos" | "fuera" | "camara" | "pantalla";
const sinCamaraMom = (m: Momento): boolean => !m.camara || m.camara.caraVisible === false;
function pasaFiltro(m: Momento, f: FiltroCaptura): boolean {
  if (f === "fuera") return m.flojo;
  if (f === "camara") return sinCamaraMom(m);
  if (f === "pantalla") return !m.pantalla;
  return true;
}
const HORA_MS = 3_600_000;
const mismaPieza = (a: Pieza, b: Pieza) => a.tipo === b.tipo && (a.tipo === "clip" ? b.tipo === "clip" && a.c.id === b.c.id : b.tipo === "momento" && a.m.id === b.m.id);

function TiraDelDia({ momentos, clips, horas, t, lang }: {
  momentos: Momento[];
  clips: ClipArgos[];
  horas: HoraJornada[] | null;
  t: Tr;
  lang: string;
}) {
  const [filtro, setFiltro] = useState<FiltroCaptura>("todos");
  const conteos = useMemo(() => ({
    fuera: momentos.filter((m) => m.flojo).length,
    camara: momentos.filter(sinCamaraMom).length,
    pantalla: momentos.filter((m) => !m.pantalla).length,
  }), [momentos]);
  const visibles = useMemo(() => momentos.filter((m) => pasaFiltro(m, filtro)), [momentos, filtro]);
  const clipsVisibles = filtro === "todos" ? clips : [];

  // Las filas: cada hora del turno (aunque no haya capturas) y cualquier otra
  // hora con capturas (fuera de su horario). De la primera a la última.
  const filas = useMemo(() => {
    const porHora = new Map<number, HoraJornada | null>();
    if (filtro === "todos") for (const h of horas ?? []) porHora.set(Math.floor(h.desde / HORA_MS) * HORA_MS, h);
    for (const m of visibles) { const k = Math.floor(m.at / HORA_MS) * HORA_MS; if (!porHora.has(k)) porHora.set(k, (horas ?? []).find((h) => Math.floor(h.desde / HORA_MS) * HORA_MS === k) ?? null); }
    for (const c of clipsVisibles) { const k = Math.floor(Date.parse(c.desde) / HORA_MS) * HORA_MS; if (!porHora.has(k)) porHora.set(k, null); }
    return [...porHora.entries()].sort((a, b) => a[0] - b[0]).map(([desde, h]) => ({
      desde, h, piezas: piezasEntre(visibles, clipsVisibles, desde, desde + HORA_MS),
    }));
  }, [horas, visibles, clipsVisibles, filtro]);
  const todas = useMemo(() => filas.flatMap((f) => f.piezas), [filas]);

  // Visor pop-up: la pieza abierta dentro de `todas` (en orden de hora).
  const [visorIdx, setVisorIdx] = useState<number | null>(null);
  const puedePerdonar = usePuedePerdonar();
  const perdonar = usePerdonarCaptura();
  useEffect(() => {
    if (visorIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") setVisorIdx((i) => (i === null ? i : Math.min(todas.length - 1, i + 1)));
      else if (e.key === "ArrowLeft") setVisorIdx((i) => (i === null ? i : Math.max(0, i - 1)));
      else if (e.key === "Escape") setVisorIdx(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visorIdx, todas.length]);

  if (momentos.length === 0 && clips.length === 0 && (horas ?? []).length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
        <ScreenShare className="h-7 w-7 opacity-40" />
        <p className="text-sm">{t("hr.exp.sinCapturas")}</p>
      </div>
    );
  }

  const chips: Array<{ k: FiltroCaptura; lbl: string; n?: number }> = [
    { k: "todos", lbl: t("hr.exp.filtroTodos") },
    { k: "fuera", lbl: t("hr.exp.filtroFuera"), n: conteos.fuera },
    { k: "camara", lbl: t("hr.exp.filtroCamara"), n: conteos.camara },
    { k: "pantalla", lbl: t("hr.exp.filtroPantalla"), n: conteos.pantalla },
  ];
  const abrir = (p: Pieza) => setVisorIdx(todas.findIndex((x) => mismaPieza(x, p)));

  return (
    <div className="flex flex-col gap-5">
      {/* Filtros: ver solo fuera de lugar, sin cámara o sin pantalla. */}
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <button key={c.k} type="button" onClick={() => setFiltro(c.k)}
            className={`inline-flex items-center gap-1.5 rounded-control border px-3 py-1 text-xs font-medium transition ${filtro === c.k ? "border-primary/50 bg-primary/10 text-primary" : "border-border/60 text-muted-foreground hover:bg-foreground/5"}`}>
            {c.lbl}
            {c.n != null && c.n > 0 && <span className="text-[11px] font-semibold tabular-nums">{c.n}</span>}
          </button>
        ))}
      </div>

      {filas.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{t("hr.exp.filtroVacio")}</p>
      ) : (
        <div className="flex flex-col divide-y divide-border/40">
          {filas.map(({ desde, h, piezas }) => {
            const pantallazos = piezas.filter((p) => p.tipo === "momento" && p.m.pantalla).length;
            const grabaciones = piezas.filter((p) => p.tipo === "clip").length;
            const futura = !!h && h.seg.pendiente >= (h.hasta - h.desde) / 1000 - 1;
            const mayor = h ? (Object.keys(h.seg) as Array<keyof typeof h.seg>).filter((e) => e !== "pendiente").reduce((a, e) => (h.seg[e] > h.seg[a] ? e : a), "bien" as keyof typeof h.seg) : null;
            return (
              <div key={desde} className={`py-3 first:pt-0 ${futura ? "opacity-50" : ""}`}>
                <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <span className="text-sm font-semibold tabular-nums">{horaRedonda(desde, lang)}</span>
                  <span className="text-xs tabular-nums text-muted-foreground">{pantallazos === 1 ? t("argos.tira.pantallazo1") : t("argos.tira.pantallazos", { n: pantallazos })} · {grabaciones === 1 ? t("argos.tira.grabacion1") : t("argos.tira.grabaciones", { n: grabaciones })}</span>
                  <span className="ml-auto flex items-baseline gap-2 text-xs">
                    {!h ? <span className="text-muted-foreground">{t("argos.tira.fueraDeTurno")}</span>
                      : futura ? <span className="text-muted-foreground">{t("argos.hora.aunNo")}</span>
                      : <>
                          <span className="font-semibold tabular-nums">{pct(h.pctBien)}</span>
                          <span className={h.productiva ? "font-medium text-success" : "text-muted-foreground"}>
                            {h.productiva === null ? t("argos.hora.pausa") : h.productiva ? t("argos.hora.productiva") : t("argos.hora.noProductiva")}
                          </span>
                        </>}
                  </span>
                </div>
                {piezas.length > 0 ? (
                  <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
                    {piezas.map((p) => <Miniatura key={`${p.tipo}-${p.tipo === "clip" ? p.c.id : p.m.id}`} p={p} onAbrir={() => abrir(p)} t={t} lang={lang} />)}
                  </div>
                ) : h && !futura && mayor ? (
                  <p className="text-xs text-muted-foreground">{t("argos.hora.sinCapturas", { e: t(NOMBRE_ESTADO[mayor]), m: textoMin(h.seg[mayor] / 60, t) })}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Pop-up: pantalla grande + cámara flotante (o la grabación), con su minuto exacto ── */}
      {visorIdx !== null && todas[visorIdx] && (() => {
        const p = todas[visorIdx];
        const m = p.tipo === "momento" ? p.m : null;
        const hp = m?.pantalla ? format(new Date(m.pantalla.at), "HH:mm:ss") : null;
        const hc = m?.camara ? format(new Date(m.camara.at), "HH:mm:ss") : null;
        const veredicto = m?.pantalla?.veredicto ?? null;
        return (
          <Dialog open onOpenChange={(o) => { if (!o) setVisorIdx(null); }}>
            <DialogContent className="max-w-5xl bg-none from-transparent p-2 sm:p-3">
              <DialogTitle className="sr-only">{t("hr.exp.pantallazosDia")}</DialogTitle>
              <div className="flex flex-col gap-2.5">
                <div className="relative overflow-hidden rounded-panel border border-border/50 bg-black">
                  <div className="relative aspect-[16/10] w-full">
                    {p.tipo === "clip" ? (
                      p.c.url ? <video key={p.c.id} src={p.c.url} controls autoPlay muted playsInline className="h-full w-full object-contain" />
                        : <div className="flex h-full w-full items-center justify-center px-6 text-center text-sm text-white/75">{t("argos.visor.videoEnArchivo")}</div>
                    ) : m?.pantalla ? (
                      m.pantalla.url ? <img src={m.pantalla.url} alt="" className="h-full w-full object-contain" /> : <div className="flex h-full w-full items-center justify-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
                    ) : (
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground"><ScreenShareOff className="h-9 w-9 opacity-60" /><span className="text-xs font-semibold">{t("hr.exp.sinPantalla")}</span></div>
                    )}
                    <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-2 rounded-control bg-black/60 px-2.5 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
                      {p.tipo === "clip" ? t("argos.visor.video") : t("hr.exp.pantalla")}
                      <span className="font-normal tabular-nums opacity-75">· {p.tipo === "clip" ? hora(p.at, lang) : hp ?? hora(p.at, lang)}</span>
                    </span>
                    {m && (
                      <div className="absolute bottom-2.5 right-2.5 w-[32%] max-w-[230px] overflow-hidden rounded-control border-2 border-white/80 shadow-xl">
                        <div className="relative aspect-[4/3] bg-black">
                          {m.camara?.url ? <img src={m.camara.url} alt="" className="h-full w-full object-cover" />
                            : <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-destructive"><CameraOff className="h-5 w-5" /><span className="text-[9px] font-semibold">{t("hr.exp.camaraApagada")}</span></div>}
                          <span className="absolute left-1.5 top-1.5 rounded-control bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                            {t("hr.exp.camara")}{hc && <span className="font-normal tabular-nums opacity-75"> · {hc}</span>}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {/* Lo que dijo Argos */}
                {(veredicto || p.tipo === "clip") && (
                  <div className={`flex items-start gap-2 rounded-panel border border-border/40 bg-card/40 px-3 py-2 text-sm ${m?.flojo ? "text-destructive" : "text-muted-foreground"}`}>
                    <Sparkles className="mt-0.5 h-4 w-4 shrink-0 opacity-70" />
                    <span>{p.tipo === "clip" ? `${t(MOTIVO_CLIP[p.c.motivo ?? "distraido"] ?? "argos.visor.motivo.distraido")}${p.c.duracionSeg ? ` · ${textoMin(p.c.duracionSeg / 60, t)}` : ""}` : veredicto}</span>
                  </div>
                )}
                {/* Perdonar la falta (solo dueño + admins): no baja la nota. */}
                {m?.pantalla && m.pantalla.fueraDeLugar === true && (
                  m.pantalla.perdonado ? (
                    <div className="flex items-center justify-between gap-2 rounded-panel border border-success/30 bg-success/10 px-3 py-2 text-sm text-success">
                      <span className="flex items-center gap-2"><Check className="h-4 w-4 shrink-0" />{t("hr.exp.perdonada")}</span>
                      {puedePerdonar && (
                        <button type="button" disabled={perdonar.isPending} onClick={() => perdonar.mutate({ id: m.pantalla!.id, perdonar: false })}
                          className="text-xs font-medium text-muted-foreground underline-offset-2 hover:underline disabled:opacity-50">
                          {t("hr.exp.perdonarQuitar")}
                        </button>
                      )}
                    </div>
                  ) : puedePerdonar ? (
                    <button type="button" disabled={perdonar.isPending} onClick={() => perdonar.mutate({ id: m.pantalla!.id, perdonar: true })}
                      className="flex items-center justify-center gap-2 rounded-panel border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-semibold text-primary transition hover:bg-primary/15 disabled:opacity-50">
                      {perdonar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                      {t("hr.exp.perdonar")}
                    </button>
                  ) : null
                )}
                {/* Navegación entre momentos (en orden de hora) */}
                <div className="flex items-center justify-between">
                  <button type="button" onClick={() => setVisorIdx((i) => (i === null ? i : Math.max(0, i - 1)))} disabled={visorIdx <= 0} className="flex h-9 items-center gap-1.5 rounded-control border border-border/50 bg-card/40 px-3 text-sm font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-40">
                    <ChevronLeft className="h-4 w-4" />{t("argos.visor.anterior")}
                  </button>
                  <span className="text-xs tabular-nums text-muted-foreground">{hora(p.at, lang)} · {visorIdx + 1}/{todas.length}</span>
                  <button type="button" onClick={() => setVisorIdx((i) => (i === null ? i : Math.min(todas.length - 1, i + 1)))} disabled={visorIdx >= todas.length - 1} className="flex h-9 items-center gap-1.5 rounded-control border border-border/50 bg-card/40 px-3 text-sm font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-40">
                    {t("argos.visor.siguiente")}<ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        );
      })()}
    </div>
  );
}

const MOTIVO_CLIP: Record<string, TranslationKey> = {
  distraido: "argos.visor.motivo.distraido",
  usando_celular: "argos.visor.motivo.celular",
  celular: "argos.visor.motivo.celular",
  no_mira: "argos.visor.motivo.no_mira",
  fuera_lugar: "argos.visor.motivo.fuera_lugar",
};

/** Una miniatura de la tira: mismo marco para todas, la cámara en la esquina y una sola línea abajo. */
function Miniatura({ p, onAbrir, t, lang }: { p: Pieza; onAbrir: () => void; t: Tr; lang: string }) {
  if (p.tipo === "clip") {
    return (
      <button type="button" onClick={onAbrir} className="group w-[124px] shrink-0 text-left sm:w-[148px]">
        <span className="relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-control border border-border/60 bg-foreground/80 text-background transition group-hover:border-primary/60">
          <Play className="h-5 w-5" />
        </span>
        <span className="mt-1 block truncate text-[11px] tabular-nums text-muted-foreground">
          {hora(p.at, lang)} · {t("argos.tira.grabacion")}{p.c.duracionSeg ? ` ${textoMin(p.c.duracionSeg / 60, t)}` : ""}
        </span>
      </button>
    );
  }
  const m = p.m;
  return (
    <button type="button" onClick={onAbrir} title={m.pantalla?.veredicto ?? undefined} className="group w-[124px] shrink-0 text-left sm:w-[148px]">
      <span className={`relative block aspect-[16/10] w-full overflow-hidden rounded-control border bg-muted/40 transition ${m.flojo ? "border-destructive/70" : "border-border/60 group-hover:border-primary/60"}`}>
        {m.pantalla ? (
          m.pantalla.url ? <img src={m.pantalla.url} alt="" loading="lazy" className="h-full w-full object-cover" />
            : <span className="flex h-full w-full items-center justify-center text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /></span>
        ) : m.camara?.url ? (
          <img src={m.camara.url} alt="" loading="lazy" className="h-full w-full object-cover opacity-80" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-muted-foreground"><ScreenShareOff className="h-4 w-4 opacity-60" /></span>
        )}
        {m.pantalla && (
          <span className="absolute bottom-1 right-1 h-7 w-10 overflow-hidden rounded-[4px] border border-background/80 bg-muted/60">
            {m.camara?.url ? <img src={m.camara.url} alt="" loading="lazy" className="h-full w-full object-cover" />
              : <span className="flex h-full w-full items-center justify-center bg-destructive/15 text-destructive"><CameraOff className="h-3 w-3" /></span>}
          </span>
        )}
      </span>
      <span className={`mt-1 block truncate text-[11px] tabular-nums ${m.flojo ? "font-medium text-destructive" : "text-muted-foreground"}`}>
        {hora(m.at, lang)}{m.flojo ? ` · ${t("hr.exp.fueraDeLugar").toLowerCase()}` : !m.pantalla ? ` · ${t("hr.exp.sinPantalla").toLowerCase()}` : ""}
      </span>
    </button>
  );
}

// Etiqueta y color de cada factor de la nota, para el desglose.
const FACTOR_LBL: Record<string, TranslationKey> = {
  pantalla: "hr.resumen.pantalla", camara: "hr.resumen.camara", atencion: "hr.resumen.atencion", horas: "hr.panel.factorHoras",
};

// El CONTENIDO del desglose «Cómo se arma la nota» (Alvaro, 04/11). Responde
// «69, ¿basado en qué?» — cada factor (pantalla/cámara/atención/horas) con su %
// REAL, cuántos puntos aporta y sobre qué prueba se midió. Se usa en el HOVER
// (al poner el cursor sobre un número) y en el pop-up de clic, para que la nota
// nunca sea una cifra a ciegas. La evidencia (pantallazos con su cámara y el
// juicio de la IA) está abajo en la misma página.
// ASISTENCIA del día (Alvaro, 05/11): horario asignado + entró/salió reales +
// diferencia (tarde/temprano). No toca la nota (son sanciones aparte). Si no hay
// horario asignado o no se registró ingreso, se dice así, no se inventa.
function AsistenciaDia({ horario, dia, userId, nombre, t }: {
  horario: { entrada: string | null; salida: string | null };
  dia: DiaExpediente;
  userId: string | undefined;
  nombre: string;
  t: Tr;
}) {
  const hhmm = (iso: string | null | undefined): string | null => {
    if (!iso) return null;
    try {
      return new Date(iso).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false });
    } catch { return null; }
  };
  const entradaReal = hhmm(dia.entroAt);
  const salidaReal = hhmm(dia.salioAt);
  const minDif = (hAsig: string | null, hReal: string | null): number | null => {
    if (!hAsig || !hReal) return null;
    const [ha, ma] = hAsig.split(":").map(Number);
    const [hr, mr] = hReal.split(":").map(Number);
    if (Number.isNaN(ha) || Number.isNaN(hr)) return null;
    return (hr * 60 + mr) - (ha * 60 + ma);
  };
  const difEntrada = minDif(horario.entrada, entradaReal);  // + = tarde, − = antes
  const difSalida = minDif(horario.salida, salidaReal);     // − = temprano, + = de más

  // ¿Sigue EN SALA ahora? (hoy + última captura fresca). Si es así no mostramos
  // "Salió": lo que se calculaba como salida puede ser un break o el último latido
  // de alguien que sigue trabajando (Alvaro, 09/11).
  const hoyBog = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const ultimaCap = dia.capturas.reduce((mx, c) => (c.createdAt > mx ? c.createdAt : mx), "");
  const enSalaAhora = dia.fecha === hoyBog && !!ultimaCap && Date.now() - Date.parse(ultimaCap) < 5 * 60_000;

  const diasTardes = difEntrada != null && difEntrada > 5; // tolerancia fija 5 min aquí
  const dioSalidaTemprano = !enSalaAhora && difSalida != null && difSalida < -5;

  return (
    <div className="mt-3 rounded-2xl border border-border/40 bg-card/20 p-3.5">
      <p className="mb-2.5 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Gauge className="h-3.5 w-3.5 text-primary" />{t("hr.exp.asistencia")}
      </p>
      <div className="grid gap-2.5 sm:grid-cols-3">
        <div className="rounded-panel border border-border/40 bg-card/30 p-2.5">
          <div className="text-xs font-semibold text-muted-foreground">{t("hr.exp.asigHorario")}</div>
          <div className="mt-1 font-display text-sm font-bold tabular-nums">
            {horario.entrada && horario.salida ? rango12(horario.entrada, horario.salida) : t("hr.exp.sinHorarioAsignado")}
          </div>
        </div>
        <div className={`rounded-panel border p-2.5 ${diasTardes ? "border-destructive/40 bg-destructive/5" : "border-border/40 bg-card/30"}`}>
          <div className="text-xs font-semibold text-muted-foreground">{t("hr.exp.entroHora")}</div>
          <div className={`mt-1 font-display text-sm font-bold tabular-nums ${diasTardes ? "text-destructive" : ""}`}>
            {a12(entradaReal) ?? "—"}
            {difEntrada != null && difEntrada > 5 && <span className="ml-1.5 text-[10px] font-semibold text-destructive">+{difEntrada}m</span>}
          </div>
        </div>
        <div className={`rounded-panel border p-2.5 ${enSalaAhora ? "border-success/40 bg-success/5" : dioSalidaTemprano ? "border-warning/40 bg-warning/5" : "border-border/40 bg-card/30"}`}>
          <div className="text-xs font-semibold text-muted-foreground">{t("hr.exp.salioHora")}</div>
          {enSalaAhora ? (
            <div className="mt-1 flex items-center gap-1.5 font-display text-sm font-bold text-success">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />{t("hr.exp.enSala")}
            </div>
          ) : (
            <div className={`mt-1 font-display text-sm font-bold tabular-nums ${dioSalidaTemprano ? "text-warning" : ""}`}>
              {a12(salidaReal) ?? "—"}
              {difSalida != null && difSalida < -5 && <span className="ml-1.5 text-[10px] font-semibold text-warning">{difSalida}m</span>}
            </div>
          )}
        </div>
      </div>
      {(diasTardes || dioSalidaTemprano) && (
        <p className="mt-2 text-[11px] text-muted-foreground">{t("hr.exp.asistenciaNota")}</p>
      )}

      {/* PRUEBA de la tardanza (Alvaro, 08/11): foto del momento que entró + hora
          exacta + a quién/cuándo llegó el correo + ver el correo. Nada de adivinar. */}
      {diasTardes && (
        <PruebaTardanza
          userId={userId}
          fecha={dia.fecha}
          nombre={nombre}
          entroAt={dia.entroAt ?? null}
          horarioEntrada={horario.entrada}
          entradaReal={entradaReal}
          tardeMin={difEntrada ?? 0}
          capturas={dia.capturas}
          t={t}
        />
      )}
    </div>
  );
}

// Busca la captura de CÁMARA más cercana a la hora de entrada (±15 min).
function fotoDeEntrada(capturas: CapturaDia[], entroAt: string | null): CapturaDia | null {
  if (!entroAt) return null;
  const t0 = Date.parse(entroAt);
  if (Number.isNaN(t0)) return null;
  let best: CapturaDia | null = null;
  let bestD = 15 * 60 * 1000;
  for (const c of capturas) {
    if (c.tipo !== "camara") continue;
    const d = Math.abs(Date.parse(c.createdAt) - t0);
    if (d < bestD) { bestD = d; best = c; }
  }
  return best;
}

function PruebaTardanza({ userId, fecha, nombre, entroAt, horarioEntrada, entradaReal, tardeMin, capturas, t }: {
  userId: string | undefined;
  fecha: string;
  nombre: string;
  entroAt: string | null;
  horarioEntrada: string | null;
  entradaReal: string | null;
  tardeMin: number;
  capturas: CapturaDia[];
  t: Tr;
}) {
  const foto = useMemo(() => fotoDeEntrada(capturas, entroAt), [capturas, entroAt]);
  const [urlFoto, setUrlFoto] = useState<string | null>(null);
  const [verGrande, setVerGrande] = useState(false);
  const [verCorreo, setVerCorreo] = useState(false);
  const [correo, setCorreo] = useState<{ a: string[] | null; enviadoAt: string | null; rol: string | null } | null>(null);

  const hhmm = (iso: string | null): string | null => {
    if (!iso) return null;
    try { return new Date(iso).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false }); } catch { return null; }
  };

  // Firma la foto de entrada (caduca ~2 min; se re-firma al abrir en grande).
  useEffect(() => {
    let vivo = true;
    void (async () => {
      const path = foto ? (foto.enNas ? foto.nasPath : foto.path) : null;
      if (!path) { setUrlFoto(null); return; }
      const u = await urlCaptura(path);
      if (vivo) setUrlFoto(u ?? null);
    })();
    return () => { vivo = false; };
  }, [foto]);

  // ¿Se mandó el correo de constancia? A quién y cuándo (tardanzas_registro).
  useEffect(() => {
    let vivo = true;
    void (async () => {
      if (!userId) return;
      const { data } = await (supabase as unknown as { from: (t: string) => { select: (c: string) => { eq: (k: string, v: string) => { eq: (k: string, v: string) => { maybeSingle: () => Promise<{ data: { correo_a: string[] | null; correo_enviado_at: string | null; turno_nombre: string | null } | null }> } } } } })
        .from("tardanzas_registro").select("correo_a, correo_enviado_at, turno_nombre").eq("user_id", userId).eq("dia", fecha).maybeSingle();
      if (vivo) setCorreo(data ? { a: data.correo_a, enviadoAt: data.correo_enviado_at, rol: data.turno_nombre } : null);
    })();
    return () => { vivo = false; };
  }, [userId, fecha]);

  const correoHoraTxt = a12(hhmm(correo?.enviadoAt ?? null));

  return (
    <div className="mt-3 rounded-2xl border border-destructive/25 bg-destructive/5 p-3.5">
      <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-destructive">
        <AlertTriangle className="h-3.5 w-3.5" />{t("hr.exp.prueba.titulo")}
        <span className="font-normal text-muted-foreground">· {t("hr.exp.prueba.entroTarde", { min: tardeMin })}</span>
      </p>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-stretch">
        {/* Foto del momento de entrada */}
        <div className="shrink-0">
          {urlFoto ? (
            <button type="button" onClick={() => setVerGrande(true)} className="group relative block h-28 w-40 overflow-hidden rounded-xl border border-border/50">
              <img src={urlFoto} alt="" className="h-full w-full object-cover transition group-hover:brightness-110" />
              <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1 text-left text-[10px] font-semibold text-white tabular-nums">
                {t("hr.exp.prueba.fotoEntrada", { hora: a12(hhmm(foto?.createdAt ?? null) ?? entradaReal) ?? "—" })}
              </span>
            </button>
          ) : (
            <div className="flex h-28 w-40 flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/50 bg-card/20 text-center text-muted-foreground">
              <CameraOff className="h-5 w-5 opacity-50" />
              <span className="px-2 text-[10px]">{t("hr.exp.prueba.sinFoto")}</span>
            </div>
          )}
        </div>

        {/* Info del correo + botón */}
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-2 rounded-xl border border-border/40 bg-card/30 p-3">
          <div className="flex items-start gap-2">
            <Mail className={`mt-0.5 h-4 w-4 shrink-0 ${correo?.enviadoAt ? "text-success" : "text-muted-foreground"}`} />
            <div className="min-w-0">
              <p className={`text-sm font-semibold ${correo?.enviadoAt ? "text-success" : "text-muted-foreground"}`}>
                {correo?.enviadoAt
                  ? t("hr.exp.prueba.correoSi", { n: correo.a?.length ?? 0, hora: correoHoraTxt ?? "—" })
                  : t("hr.exp.prueba.correoNo")}
              </p>
              {correo?.a && correo.a.length > 0 && (
                <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{correo.a.join(" · ")}</p>
              )}
            </div>
          </div>
          <Button variant="outline" size="sm" className="self-start rounded-control" onClick={() => setVerCorreo(true)}>
            <Mail className="mr-1.5 h-3.5 w-3.5" />{correo?.enviadoAt ? t("hr.exp.prueba.verCorreo") : t("hr.exp.prueba.verCorreoPreview")}
          </Button>
        </div>
      </div>

      {/* Foto grande */}
      <Dialog open={verGrande} onOpenChange={setVerGrande}>
        <DialogContent className="max-w-2xl p-2">
          <DialogTitle className="sr-only">{t("hr.exp.prueba.titulo")}</DialogTitle>
          {urlFoto && <img src={urlFoto} alt="" className="max-h-[80vh] w-full rounded-lg object-contain" />}
        </DialogContent>
      </Dialog>

      {/* El correo exacto que se mandó */}
      <Dialog open={verCorreo} onOpenChange={setVerCorreo}>
        <DialogContent className="max-w-2xl overflow-hidden p-0">
          <DialogTitle className="border-b border-border/40 p-4">{correo?.enviadoAt ? t("hr.exp.prueba.correoTitulo") : t("hr.exp.prueba.verCorreoPreview")}</DialogTitle>
          {correo?.a && correo.a.length > 0 && (
            <p className="px-4 pt-3 text-[11px] text-muted-foreground">
              <span className="font-semibold">{t("hr.exp.prueba.destinatarios")}</span> {correo.a.join(" · ")}
            </p>
          )}
          <iframe
            title="email"
            srcDoc={correoTardanzaHTML({
              nombre,
              rol: correo?.rol ?? null,
              horario: horarioEntrada ?? "—",
              entro: entradaReal ?? "—",
              tardeMin,
              esPrueba: !correo?.enviadoAt,
            })}
            className="w-full border-0"
            style={{ height: "min(70vh, 640px)", background: "#eef1f6" }}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}

// El desglose en MINUTOS de un factor (Alvaro 08/11): de dónde sale el %.
// Pantalla = compartió vs no; Cámara = con cámara vs sin / fuera de cuadro.
function desgloseDeFactor(
  clave: string,
  dia: DiaExpediente,
  atencion: { pct: number; ok: number; n: number } | null,
  t: Tr,
): { lbl: string; valor: string; color: string }[] {
  const min = (s: number | undefined) => `${Math.round((Number(s) || 0) / 60)} min`;
  const act = dia.segActivo ?? 0, sp = dia.segSinPantalla ?? 0, sc = dia.segSinCamara ?? 0, fc = dia.segFueraCamara ?? 0;
  if (clave === "pantalla") {
    return [
      { lbl: t("hr.exp.desg.compartio"), valor: min(act + sc + fc), color: "hsl(var(--primary))" },
      { lbl: t("hr.exp.desg.sinPantalla"), valor: min(sp), color: "hsl(var(--muted-foreground))" },
    ];
  }
  if (clave === "camara") {
    return [
      { lbl: t("hr.exp.desg.conCamara"), valor: min(act + sp), color: "hsl(var(--primary))" },
      { lbl: t("hr.exp.desg.sinCamara"), valor: min(sc), color: "hsl(var(--muted-foreground))" },
      ...(fc > 0 ? [{ lbl: t("hr.exp.desg.fueraCuadro"), valor: min(fc), color: "hsl(var(--warning))" }] : []),
    ];
  }
  if (clave === "atencion" && atencion && atencion.n > 0) {
    return [{ lbl: t("hr.exp.desg.pantallazosBien"), valor: `${atencion.ok} / ${atencion.n}`, color: "hsl(var(--primary))" }];
  }
  return [];
}

function DesgloseNotaContenido({ dia, atencion, t, compacto }: {
  dia: DiaExpediente;
  atencion: { pct: number; ok: number; n: number } | null;
  t: Tr;
  /** inline bajo la nota (siempre visible): sin el número grande repetido ni la
   *  lista de faltas (que ya está abajo en la página). */
  compacto?: boolean;
}) {
  const nota = dia.nota;
  const [factorAbierto, setFactorAbierto] = useState<string | null>(null);
  const bandaTono = nota.banda ? TONO[nota.banda] : null;
  const pantallaFactor = nota.factores.find((f) => f.clave === "pantalla");
  const reglaDura = pantallaFactor?.sub != null && pantallaFactor.sub < 5;
  // Momentos de cámara que SE PUDIERON MEDIR hoy (cara_visible no nulo): la prueba
  // detrás del % de cámara.
  const momCamMedida = new Set(
    dia.capturas.filter((c) => c.tipo === "camara" && c.caraVisible != null).map((c) => Math.floor(Date.parse(c.createdAt) / 120000)),
  ).size;

  // Línea de prueba bajo cada factor: sobre qué se midió de verdad.
  const prueba = (clave: string): string | null => {
    if (clave === "camara") return momCamMedida > 0 ? t("hr.exp.pruebaCamara", { n: momCamMedida }) : t("hr.exp.pruebaCamaraNadie");
    if (clave === "atencion") return atencion ? t("hr.exp.pruebaAtencion", { ok: atencion.ok, n: atencion.n }) : t("hr.exp.pruebaAtencionSin");
    return null;
  };

  if (nota.valor == null) {
    return <p className="py-4 text-center text-sm text-muted-foreground">{t("hr.exp.desgloseSinNota")}</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* La nota grande + su banda (no en la versión inline: el tile ya la muestra) */}
      {!compacto && (
        <div className={`flex items-center gap-3 rounded-2xl border p-3 ${bandaTono?.bg ?? "border-border/40 bg-card/40"}`}>
          <span className={`font-display text-3xl font-bold tabular-nums ${bandaTono?.tx ?? ""}`}>{nota.valor}</span>
          <span className="text-xs text-muted-foreground">{t("hr.exp.desgloseSub", { valor: nota.valor })}</span>
        </div>
      )}

      {/* Los factores: % real, barra, aporte en puntos y la prueba. EXPANDIBLES
          (Alvaro 08/11): al tocar uno se abre el desglose en MINUTOS reales —
          cuánto compartió pantalla y cuánto no, cuánto con cámara y cuánto no —
          para ver de dónde sale el %. */}
      <div className="flex flex-col gap-2.5">
        {nota.factores.map((f) => {
          const pr = prueba(f.clave);
          const filas = desgloseDeFactor(f.clave, dia, atencion, t);
          const abierto = factorAbierto === f.clave;
          const puedeAbrir = filas.length > 0;
          return (
            <div key={f.clave} className="rounded-xl border border-border/40 bg-card/20">
              <button type="button" disabled={!puedeAbrir}
                onClick={() => setFactorAbierto(abierto ? null : f.clave)}
                className={`w-full space-y-1 px-3 py-2 text-left ${puedeAbrir ? "transition hover:bg-card/40" : ""}`}>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium">{t(FACTOR_LBL[f.clave] ?? "hr.resumen.pantalla")}</span>
                  {puedeAbrir && <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground/60 transition ${abierto ? "rotate-180" : ""}`} />}
                  <span className="ml-auto text-sm font-semibold tabular-nums">
                    {f.sub == null ? <span className="text-xs font-normal text-muted-foreground">{t("hr.exp.factorSinDato")}</span> : `${Math.round(f.sub)}%`}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-foreground/10">
                  <div className={`h-full rounded-full ${f.sub == null ? "bg-transparent" : "bg-primary/70"}`} style={{ width: `${f.sub == null ? 0 : Math.round(f.sub)}%` }} />
                </div>
                {pr && <p className="text-[11px] text-muted-foreground">{pr}</p>}
              </button>
              {abierto && (
                <div className="border-t border-border/40 px-3 py-2">
                  <div className="flex flex-col gap-1">
                    {filas.map((r) => (
                      <div key={r.lbl} className="flex items-baseline gap-2 text-[12px]">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: r.color }} />
                        <span className="text-muted-foreground">{r.lbl}</span>
                        <span className="ml-auto font-semibold tabular-nums">{r.valor}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {reglaDura && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{t("hr.exp.reglaDura")}
        </div>
      )}

      {/* Qué pasó hoy + nota de la prueba: solo en el pop-up completo. En la
          versión inline las faltas ya están listadas abajo en la página. */}
      {!compacto && (
        <>
          <div className="border-t border-border/40 pt-3">
            <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{t("hr.exp.desgloseFaltas")}</p>
            {dia.faltas.length === 0 ? (
              <p className="text-[11px] text-muted-foreground">{t("hr.exp.desgloseSinFaltas")}</p>
            ) : (
              <div className="flex flex-col gap-1">
                {dia.faltas.slice(0, 8).map((f) => {
                  const lbl = LABEL_FALTA[f.tipo as FaltaTipo];
                  return (
                    <div key={f.id} className="flex items-center gap-2 text-[11px]">
                      <AlertTriangle className="h-3 w-3 shrink-0 text-destructive/70" />
                      <span className="min-w-0 flex-1 truncate">{lbl ? t(lbl) : f.tipo}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{format(new Date(f.createdAt), "HH:mm")}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <p className="text-[11px] italic text-muted-foreground">{t("hr.exp.desglosePrueba")}</p>
        </>
      )}
    </div>
  );
}

export default function HRExpediente() {
  const { userId } = useParams<{ userId: string }>();
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  // Volver SIEMPRE a Argos (a la pestaña de donde saliste): si vinimos de un
  // panel de Argos, trae su URL en el state (volverA) y la usa; si no, al monitor.
  const volverA = (location.state as { volverA?: string } | null)?.volverA ?? "/hr/monitor-ia";
  const hoyStr = useMemo(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" }), []);
  // Se abre en HOY. El día elegido manda; el mes sale de él (para cargar y para el calendario).
  const [diaSel, setDiaSel] = useState<string>(hoyStr);
  const [verCalendario, setVerCalendario] = useState(false);
  const [verDesglose, setVerDesglose] = useState(false);
  const anio = Number(diaSel.slice(0, 4));
  const mes = Number(diaSel.slice(5, 7));
  const { expediente, cargando, error, hoy } = useExpedienteEmpleado(userId ?? null, anio, mes);
  const argos = useArgosDia(userId ?? null, diaSel);
  const jornada = argos.dia?.jornada ?? null;
  const evidencia = useEvidenciaDia(userId ?? null, jornada);

  const esHoy = diaSel === hoy;
  const puedeAvanzar = diaSel < hoy;
  const moverDia = (delta: number) => {
    const s = sumarDias(diaSel, delta);
    if (s <= hoy) { setDiaSel(s); setVerCalendario(false); }
  };

  const dia = useMemo<DiaExpediente>(() => {
    const d = expediente?.dias.get(diaSel);
    if (d) return d;
    return { fecha: diaSel, horas: 0, faltas: [], minutosPausaDeMas: 0, capturas: [], nota: { valor: null, banda: null, factores: [] } };
  }, [diaSel, expediente]);

  const nombre = expediente?.nombre || t("hr.noName");
  const c = dia.nota.banda ? TONO[dia.nota.banda] : null;

  // % DE ATENCIÓN DEL DÍA (estilo Hubstaff): de los pantallazos que la IA ya
  // juzgó este día, qué porción estaba en lo suyo. Sin juzgados → "—" (no 0).
  const atencion = useMemo(() => {
    const juzgadas = dia.capturas.filter((x) => x.tipo === "pantalla" && x.veredicto != null);
    if (juzgadas.length === 0) return null;
    // Las PERDONADAS cuentan como en lo suyo (no bajan la nota).
    const ok = juzgadas.filter((x) => x.fueraDeLugar !== true || x.perdonado).length;
    return { pct: Math.round((ok / juzgadas.length) * 100), ok, n: juzgadas.length };
  }, [dia]);
  const tonoAt = atencion == null ? "" : atencion.pct >= 80 ? "text-success" : atencion.pct >= 60 ? "text-warning" : "text-destructive";
  const diaTexto = esHoy ? t("hr.exp.hoy") : format(new Date(diaSel + "T12:00:00"), "EEEE d 'de' MMMM", { locale: es });

  // Celdas del mes para el calendario opcional (lunes primero).
  const celdas = useMemo(() => {
    const primero = new Date(anio, mes - 1, 1).getDay();
    const offset = (primero + 6) % 7;
    const dias = new Date(anio, mes, 0).getDate();
    const out: (string | null)[] = [];
    for (let i = 0; i < offset; i++) out.push(null);
    for (let d = 1; d <= dias; d++) out.push(`${anio}-${String(mes).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
    return out;
  }, [anio, mes]);
  const mesTexto = useMemo(() => new Date(anio, mes - 1, 1).toLocaleDateString("es-CO", { month: "long", year: "numeric" }), [anio, mes]);

  return (
    <Page>
      <Button
        variant="ghost"
        size="sm"
        className="mb-1 gap-1.5 self-start text-muted-foreground hover:text-foreground"
        onClick={() => navigate(volverA)}
      >
        <ArrowLeft className="h-4 w-4" />
        {t("hr.exp.volverArgos")}
      </Button>
      <PageHeader title={t("hr.exp.title")} subtitle={t("hr.exp.sub")} icon={<Gauge className="h-5 w-5" />} />

      {/* Identidad + nota + día + flechas */}
      <section className="vidrio sube mt-4 p-4 lg:p-5">
        <div className="v-cont">
          <div className="flex flex-wrap items-center gap-3">
            {expediente && <UserAvatar name={nombre} src={expediente.avatarUrl} seed={expediente.avatarSeed} size="md" />}
            <div className="min-w-0 flex-1">
              <h2 className="truncate font-display text-base font-bold leading-tight tracking-tight">{nombre}</h2>
              {dia.nota.banda && (
                <span className={`mt-0.5 inline-flex items-center rounded-control px-1.5 py-0.5 text-[11px] font-semibold ${c?.chip}`}>
                  {dia.nota.valor} / 100
                </span>
              )}
            </div>
            {/* Navegación de día */}
            <div className="flex items-center gap-1.5">
              <button onClick={() => moverDia(-1)} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/50 text-muted-foreground transition hover:text-foreground" aria-label={t("hr.exp.diaAnterior")}>
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="min-w-[8.5rem] text-center text-sm font-semibold capitalize tabular-nums">{diaTexto}</span>
              <button onClick={() => moverDia(1)} disabled={!puedeAvanzar} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border/50 text-muted-foreground transition hover:text-foreground disabled:opacity-40" aria-label={t("hr.exp.diaSiguiente")}>
                <ChevronRight className="h-4 w-4" />
              </button>
              <button onClick={() => setVerCalendario((v) => !v)} className={`flex h-8 w-8 items-center justify-center rounded-lg border transition ${verCalendario ? "border-primary/50 text-primary" : "border-border/50 text-muted-foreground hover:text-foreground"}`} aria-label={t("hr.exp.calendario")}>
                <CalendarDays className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Calendario opcional */}
          {verCalendario && (
            <div className="mt-4 rounded-2xl border border-border/40 bg-card/30 p-3">
              <p className="mb-2 text-center text-xs capitalize text-muted-foreground">{mesTexto}</p>
              {/* Calendario: 7 columnas = los 7 días de la semana, a propósito en
                  toda anchura (en móvil las celdas quedan chicas pero caben). */}
              <div className="mb-1 grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-muted-foreground sm:grid-cols-7">
                {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => <div key={i}>{d}</div>)}
              </div>
              <div className="grid grid-cols-7 gap-1 sm:grid-cols-7">
                {celdas.map((f, i) => {
                  if (!f) return <div key={i} />;
                  const d = expediente?.dias.get(f);
                  const cc = d?.nota.banda ? TONO[d.nota.banda] : null;
                  const futuro = f > hoy;
                  const sel = f === diaSel;
                  return (
                    <button key={i} disabled={futuro} onClick={() => { setDiaSel(f); setVerCalendario(false); }}
                      className={`flex aspect-square flex-col items-center justify-center rounded-lg border text-xs transition disabled:opacity-30
                        ${cc ? cc.bg : "border-border/30 bg-card/20"} ${sel ? "ring-2 ring-primary" : "hover:border-primary/40"}`}>
                      <span className={`tabular-nums ${f === hoy ? "font-bold text-primary" : "text-foreground/80"}`}>{Number(f.slice(8))}</span>
                      {d?.nota.valor != null && <span className={`text-[10px] font-bold tabular-nums ${cc?.tx}`}>{d.nota.valor}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Las cifras del día. Las nuevas (11/11) salen del turno minuto a minuto:
              sin cámara, sin pantalla, almuerzo, fallas de 1 min o más y cada
              cuánto, horas productivas. Mientras carga: «—» (nunca un 0 falso). */}
          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Cuadrito valor={String(dia.nota.valor ?? "—")} etiqueta={t("hr.exp.nota")} tono={c?.tx} className={c?.bg} />
            <Cuadrito valor={atencion ? `${atencion.pct}%` : "—"} etiqueta={t("hr.exp.atencion")} tono={tonoAt}
              title={atencion ? t("hr.exp.atencionDetalle", { ok: atencion.ok, n: atencion.n }) : undefined} />
            <Cuadrito valor={jornada ? textoMin(jornada.conectadoSeg / 60, t) : `${dia.horas.toFixed(1)}h`} etiqueta={t("hr.exp.horas")} />
            <Cuadrito valor={String(dia.faltas.length)} etiqueta={t("hr.exp.faltas")} />
            <Cuadrito valor={`${Math.round(dia.minutosPausaDeMas)}m`} etiqueta={t("hr.exp.pausas")} />
            <Cuadrito valor={jornada ? textoMin((jornada.seg.sin_camara + jornada.seg.fuera_de_camara) / 60, t) : "—"} etiqueta={t("argos.cuadro.sinCamara")} />
            <Cuadrito valor={jornada ? textoMin(jornada.seg.sin_pantalla / 60, t) : "—"} etiqueta={t("argos.cuadro.sinPantalla")} />
            <Cuadrito valor={jornada ? textoMin((jornada.pausaPorTipo.almuerzo ?? 0) / 60, t) : "—"} etiqueta={t("argos.cuadro.almuerzo")} />
            <Cuadrito valor={jornada ? String(jornada.fallas.length) : "—"} etiqueta={t("argos.cuadro.fallas")}
              tono={jornada && jornada.fallas.length > 0 ? "text-destructive" : undefined}
              detalle={jornada ? (jornada.cadaMin ? t("argos.cifra.cadaMin", { m: textoMin(jornada.cadaMin, t) }) : t("argos.cuadro.ninguna")) : undefined} />
            <Cuadrito valor={jornada ? t("argos.cifra.deN", { a: jornada.horasProductivas, b: jornada.horasEvaluadas }) : "—"} etiqueta={t("argos.cifra.horasProductivas")}
              detalle={t("argos.cuadro.productiva")} />
          </div>
        </div>
      </section>

      {/* Argos como MANAGER del día: lo PRIMERO, juzga el día con criterio
          (Alvaro, 09/11). Reemplaza las barras abiertas de pantalla/cámara. */}
      <TarjetaArgos nombre={nombre} dia={dia} horario={expediente?.horario ?? { entrada: null, salida: null }} jornada={jornada} clips={evidencia.evidencia?.clips ?? null} />

      {/* El turno MINUTO A MINUTO, de la hora de entrada a la de salida (11/11). */}
      <BarraDelTurno jornada={jornada} cargando={argos.cargando} error={argos.error} onReintentar={argos.reintentar}
        momentos={evidencia.evidencia?.momentos ?? []} onAbrirMomento={() => document.getElementById("tira-del-dia")?.scrollIntoView({ behavior: "smooth" })}
        t={t} lang={language} />

      {/* Asistencia + el desglose técnico, ya COLAPSADO: el perfil abre limpio y
          el detalle (pantalla/cámara/atención) se abre solo si se quiere. */}
      <section className="vidrio sube mt-4 p-4 lg:p-5">
        <div className="v-cont">
          {expediente && <AsistenciaDia horario={expediente.horario} dia={dia} userId={userId} nombre={nombre} t={t} />}

          <button
            type="button"
            onClick={() => setVerDesglose((v) => !v)}
            className="mt-3 flex w-full items-center justify-between rounded-2xl border border-border/40 bg-card/20 px-3.5 py-2.5 text-xs font-semibold text-muted-foreground transition hover:bg-card/40"
          >
            <span className="flex items-center gap-2"><Gauge className="h-3.5 w-3.5 text-primary" />{verDesglose ? t("hr.exp.ocultarDesglose") : t("hr.exp.verDesglose")}</span>
            <ChevronDown className={`h-4 w-4 transition-transform ${verDesglose ? "rotate-180" : ""}`} />
          </button>
          {verDesglose && (
            <div className="mt-2 rounded-2xl border border-border/40 bg-card/20 p-3.5">
              <DesgloseNotaContenido dia={dia} atencion={atencion} t={t} compacto />
            </div>
          )}
        </div>
      </section>

      {/* Videos de Argos del día (si los hubo). Se esconde solo si no hay. */}
      {userId && <ClipsDelDia userId={userId} fecha={dia.fecha} />}

      {/* Qué le dijo Argos ese día: cronología de nudges (Alvaro, 09/11). */}
      {userId && <AvisosDeArgos userId={userId} fecha={dia.fecha} />}

      {/* La tira de pantallazos del día (Hubstaff) */}
      <section id="tira-del-dia" className="vidrio sube mt-5 p-4 lg:p-5" style={{ animationDelay: "0.05s" }}>
        <div className="v-cont">
          <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <ScreenShare className="h-3.5 w-3.5" />{t("hr.exp.pantallazosDia")}
          </p>
          {error || evidencia.error ? (
            <div role="alert" className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
              <AlertTriangle className="h-7 w-7 text-destructive/70" /><p className="text-sm">{t("hr.exp.error")}</p>
              {evidencia.error && (
                <button type="button" onClick={evidencia.reintentar} className="inline-flex items-center gap-1.5 rounded-control border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted">
                  <RefreshCw className="h-3.5 w-3.5" />{t("argos.reintentar")}
                </button>
              )}
            </div>
          ) : cargando || argos.cargando || (jornada && evidencia.cargando) ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <TiraDelDia momentos={evidencia.evidencia?.momentos ?? []} clips={evidencia.evidencia?.clips ?? []} horas={jornada?.horas ?? null} t={t} lang={language} />
          )}

          {/* Faltas del día, si hay */}
          {dia.faltas.length > 0 && (
            <div className="mt-5 border-t border-border/40 pt-4">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">{t("hr.exp.faltas")}</p>
              <div className="flex flex-col gap-1.5">
                {dia.faltas.slice(0, 20).map((f) => {
                  const lbl = LABEL_FALTA[f.tipo as FaltaTipo];
                  return (
                    <div key={f.id} className="flex items-center gap-2 rounded-control border border-border/50 bg-card/40 px-2.5 py-1.5">
                      <span className="min-w-0 flex-1 truncate text-xs">{lbl ? t(lbl) : f.tipo}{f.detalle ? ` · ${f.detalle}` : ""}</span>
                      {f.capturaPath && (
                        <button type="button" onClick={() => abrirPath(f.capturaPath!)} className="shrink-0 text-muted-foreground hover:text-primary" title={t("hr.exp.abrir")}><ImageIcon className="h-3.5 w-3.5" /></button>
                      )}
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{format(new Date(f.createdAt), "HH:mm")}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>
    </Page>
  );
}
