import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCopiasDelDrive } from "@/hooks/useCopiasDelDrive";
import { useRecordings, RecordingRow, FILTROS_VACIOS } from "@/hooks/useRecordings";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/UserAvatar";
import { motivoDeFallo } from "@/lib/grabacionMotivoFallo";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import StatChip from "@/components/StatChip";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/ui/page-header";
import {
  Clapperboard, Download, Loader2, Trash2, Users2, Video, AlertTriangle, HardDrive, Clock, Play,
  Search, X, Share2, Square, CalendarPlus,
} from "lucide-react";
import { CompartirGrabacionDialog } from "./CompartirGrabacionDialog";
import { invokeRecordings } from "@/hooks/useRecordings";
import { useFormato } from "@/hooks/useFormato";
import type { Formato } from "@/lib/formato";
import { useLanguage } from "@/hooks/useLanguage";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// Grabaciones de Meet/Cowork. Dos reglas que la página tiene que hacer
// imposibles de ignorar (vienen del diseño de la tabla, ver la migración):
//
//   1. TODO vence a los 90 días, sin excepciones. Fueron 15 mientras el
//      archivo vivía en el disco del VPS; ahora va a Cloudflare R2 y esa
//      restricción no existe. La fecha de vencimiento va en cada fila y el
//      aviso arriba — quien necesite algo más tiempo, lo descarga.
//      ⚠️ R2 tiene su PROPIA regla de ciclo de vida a 90 días: si este
//      número cambia, hay que cambiar la del bucket maven-grabaciones.
//   2. El espacio usado se muestra SIEMPRE arriba. En Google terminamos con
//      33 TB que nadie sabía que existían; acá el total nunca es invisible.

function formatBytes(n: number | null): string {
  if (!n) return "—";
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDur(s: number | null): string | null {
  if (!s && s !== 0) return null;
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${m}:${String(sec).padStart(2, "0")}`;
}

function diasHasta(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 3600 * 1000));
}

const fechaDia = (iso: string, f: Formato) =>
  new Date(iso).toLocaleDateString(f.intl("es-CO"), { day: "numeric", month: "short", year: "numeric" });

const fechaCorta = (iso: string, f: Formato) =>
  new Date(iso).toLocaleDateString(f.intl("es-CO"), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function GrabacionesPage() {
  const {
    rows, grabadores, usage, myUserId, loading, download, view, remove,
    filtros, setFiltros, cargarMas, cargandoMas, hayMas,
    refresh,
  } = useRecordings();
  const { isAdmin } = useUserRole();
  const f = useFormato();
  const { t } = useLanguage();
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [viendo, setViendo] = useState<{ rec: RecordingRow; url: string } | null>(null);
  // Compartir con gente de Maven (pedido de Jhon, 09/09/2026): la lista de
  // destinatarios la guarda la edge; el diálogo solo elige.
  const [compartiendo, setCompartiendo] = useState<RecordingRow | null>(null);

  // Detener desde la lista: hasta hoy solo se podía desde dentro de la
  // llamada, y una grabación que nadie paró seguía "En curso" durante días
  // (PLUS 2 llevaba 92 horas). La edge ya deja parar a cualquiera que la vea.
  // Confirmaciones con el diálogo de Maven, no el `confirm` del navegador
  // (Jhon, 09/09/2026). El botón de la fila solo abre el diálogo; la acción
  // corre al confirmar.
  const [porDetener, setPorDetener] = useState<RecordingRow | null>(null);
  const [porBorrar, setPorBorrar] = useState<RecordingRow | null>(null);

  // La copia en el Drive dura 30 días desde que se copia (Alvaro, 17/11/2026):
  // cada fila dice hasta cuándo y quien grabó puede pedir 30 días más. El
  // aviso de la campana y el correo llegan con ?extender=<id>, que abre la
  // pregunta directo.
  const { copias, extender } = useCopiasDelDrive(rows.filter((r) => r.status === "ready").map((r) => r.id));
  const [params, setParams] = useSearchParams();
  const [porExtender, setPorExtender] = useState<string | null>(null);
  useEffect(() => {
    const id = params.get("extender");
    if (!id) return;
    setPorExtender(id);
    const resto = new URLSearchParams(params);
    resto.delete("extender");
    setParams(resto, { replace: true });
  }, [params, setParams]);

  const handleExtender = async (id: string) => {
    setTrabajando(id);
    try {
      const vence = await extender(id);
      toast.success(t("grab.drive.extended", { fecha: fechaDia(vence, f) }));
    } catch (e) {
      toast.error((e as Error).message || t("grab.drive.extendError"));
    } finally {
      setTrabajando(null);
    }
  };
  const grabacionPorExtender = porExtender ? rows.find((r) => r.id === porExtender) : undefined;
  const copiaPorExtender = porExtender ? copias.get(porExtender) : undefined;

  const handleDetener = async (r: RecordingRow) => {
    setTrabajando(r.id);
    try {
      await invokeRecordings("stop", { recording_id: r.id, recipients: [] });
      toast.success(t("grab.stopped"), { description: t("grab.stoppedDesc") });
      await refresh();
    } catch (e) {
      toast.error((e as Error).message || t("grab.stopError"));
    } finally {
      setTrabajando(null);
    }
  };
  const hayFiltro = filtros.q !== "" || filtros.fuente !== "todas" || filtros.soloMias;

  const handleVer = async (r: RecordingRow) => {
    setTrabajando(r.id);
    try {
      setViendo({ rec: r, url: await view(r.id) });
    } catch (e) {
      toast.error((e as Error).message || t("grab.openError"));
    } finally {
      setTrabajando(null);
    }
  };

  const handleDownload = async (r: RecordingRow) => {
    setTrabajando(r.id);
    try {
      await download(r.id);
    } catch (e) {
      toast.error((e as Error).message || t("grab.downloadError"));
    } finally {
      setTrabajando(null);
    }
  };

  const handleDelete = async (r: RecordingRow) => {
    setTrabajando(r.id);
    try {
      await remove(r.id);
      toast.success(t("grab.deleted"));
    } catch (e) {
      toast.error((e as Error).message || t("grab.deleteError"));
    } finally {
      setTrabajando(null);
    }
  };

  return (
    // El AppShell da `h-dvh` + `overflow-hidden` y CADA página pone su propio
    // scroll. Sin este contenedor, con más de una pantalla de grabaciones el
    // resto de la lista quedaba recortado y no había forma de llegar a él.
    // `min-h-0` es imprescindible: sin eso el hijo no puede encogerse dentro
    // de la columna flex y el overflow no se activa.
    <main className="flex-1 min-h-0 overflow-y-auto">
      <div className="flex w-full flex-col gap-5 p-4 md:p-6">
      <PageHeader
        title={t("nav.recordings")}
        subtitle={t("grab.subtitle")}
        icon={<Clapperboard />}
      />

      {/* El espacio y el vencimiento, siempre a la vista. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <StatChip
          label={t("nav.recordings")}
          value={usage ? String(usage.total_recordings) : "—"}
          color="bg-primary"
          icon={<Clapperboard className="h-3.5 w-3.5" />}
        />
        <StatChip
          label={t("grab.spaceUsed")}
          value={usage ? formatBytes(usage.total_bytes) : "—"}
          color="bg-sky-500"
          icon={<HardDrive className="h-3.5 w-3.5" />}
        />
        <StatChip
          label={t("grab.expiringThisWeek")}
          value={usage ? String(usage.expiring_next_week) : "—"}
          color={usage && usage.expiring_next_week > 0 ? "bg-warning" : "bg-muted-foreground/40"}
          icon={<Clock className="h-3.5 w-3.5" />}
          className={cn(
            "col-span-2 sm:col-span-1",
            !!usage && usage.expiring_next_week > 0 && "border-warning/30 bg-warning/10",
          )}
        />
      </div>

      <div className="flex items-start gap-2 rounded-2xl border border-warning/25 bg-warning/10 px-4 py-3 text-[13px] leading-snug text-warning">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          {t("grab.warnBefore")}<b>{t("grab.warnBold")}</b>{t("grab.warnAfterDrive")}
        </span>
      </div>

      {/* Buscador y filtros. Existen desde ahora y no cuando duela: con el
          video mudándose a R2 esto pasa de 54 grabaciones a cientos, y una
          lista plana sin forma de acotarla deja de servir mucho antes de
          llenarse. Filtran en el SERVIDOR, no sobre lo ya cargado: filtrar en
          el cliente solo mira la tanda que bajó y miente. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filtros.q}
            onChange={(e) => setFiltros({ ...filtros, q: e.target.value })}
            placeholder={t("grab.searchPlaceholder")}
            className="h-9 rounded-full pl-9 pr-9"
          />
          {filtros.q && (
            <button
              type="button"
              onClick={() => setFiltros({ ...filtros, q: "" })}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:bg-muted"
              aria-label={t("common.clearSearch")}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {/* `id` es el filtro que va al servidor (dato); Meet y Cowork son nombres propios. */}
          {([
            { id: "todas", label: t("common.allF") },
            { id: "meet", label: "Meet" },
            { id: "cowork", label: "Cowork" },
          ] as const).map((fuente) => (
            <button
              key={fuente.id}
              type="button"
              onClick={() => setFiltros({ ...filtros, fuente: fuente.id })}
              aria-pressed={filtros.fuente === fuente.id}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
                filtros.fuente === fuente.id
                  ? "bg-primary/15 text-primary"
                  : "text-muted-foreground hover:bg-muted",
              )}
            >
              {fuente.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setFiltros({ ...filtros, soloMias: !filtros.soloMias })}
            aria-pressed={filtros.soloMias}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold transition-colors",
              filtros.soloMias
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted",
            )}
          >
            {t("grab.onlyMine")}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      ) : rows.length === 0 ? (
        hayFiltro ? (
          // Decirle "todavía no hay grabaciones" a quien acaba de filtrar es
          // desconcertante: parece que se borraron.
          <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border/70 px-6 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              {t("grab.noMatch")}
            </p>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => setFiltros(FILTROS_VACIOS)}>
              {t("grab.clearFilters")}
            </Button>
          </div>
        ) : (
          <EmptyState
            className="rounded-3xl border border-dashed border-border/70"
            seed="empty-grabaciones"
            title={t("grab.empty")}
            description={t("grab.emptyDesc")}
          />
        )
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => {
            const dias = diasHasta(r.expires_at);
            const dur = formatDur(r.duration_seconds);
            const mia = r.started_by === myUserId;
            const ocupado = trabajando === r.id;
            const grabador = grabadores[r.started_by];
            const nombreGrabador = mia ? t("grab.you") : (grabador?.full_name || t("grab.someoneFromTeam"));
            const copia = copias.get(r.id);
            const enElDrive = copia?.estado === "listo" && !!copia.vence_drive_at;
            const copiando = copia?.estado === "pendiente" || copia?.estado === "subiendo" || copia?.estado === "juntando";
            return (
              <div key={r.id} className="flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3">
                <div className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
                  r.source === "meet" ? "bg-primary/10 text-primary" : "bg-violet-500/10 text-violet-500",
                )}>
                  {r.source === "meet" ? <Video className="h-5 w-5" /> : <Users2 className="h-5 w-5" />}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-semibold text-foreground">{r.title || r.room_name}</span>
                    {r.status === "recording" && (
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" /> {t("grab.status.recording")}
                      </span>
                    )}
                    {r.status === "processing" && (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">{t("grab.status.processing")}</span>
                    )}
                    {r.status === "failed" && (
                      <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">{t("grab.status.failed")}</span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{fechaCorta(r.started_at, f)}</span>
                    {dur && <><span>·</span><span>{dur}</span></>}
                    {r.size_bytes != null && <><span>·</span><span>{formatBytes(r.size_bytes)}</span></>}
                    {r.status === "ready" && dias !== null && (
                      <>
                        <span>·</span>
                        <span className={cn(
                          dias <= 2 ? "font-semibold text-destructive" : dias <= 7 ? "font-medium text-warning" : "",
                        )}>
                          {dias <= 0 ? t("grab.expiresToday") : t(dias === 1 ? "grab.expiresInOne" : "grab.expiresInMany", { n: dias })}
                        </span>
                      </>
                    )}
                    {r.status === "ready" && enElDrive && (
                      <><span>·</span><span data-testid="en-el-drive">{t("grab.drive.until", { fecha: fechaDia(copia!.vence_drive_at!, f) })}</span></>
                    )}
                    {r.status === "ready" && copiando && (
                      <><span>·</span><span>{t("grab.drive.copying")}</span></>
                    )}
                  </div>
                  {/* Quién grabó, con su cara: pedido de Jhon (05/09) — la
                      lista tenía fecha y peso, pero no decía de quién era. */}
                  <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="grabo">
                    <UserAvatar name={grabador?.full_name ?? nombreGrabador} src={grabador?.avatar_url} seed={grabador?.avatar_seed} size="xs" />
                    <span className="truncate">
                      {r.status === "recording" ? t("grab.by.recording") : r.status === "failed" ? t("grab.by.failed") : t("grab.by.done")}{" "}
                      <span className="font-medium text-foreground">{nombreGrabador}</span>
                    </span>
                  </div>
                  {r.status === "failed" && (
                    <p className="mt-1 text-xs leading-snug text-destructive/90" title={r.error ?? undefined}>
                      {motivoDeFallo(r.error)}
                    </p>
                  )}
                </div>

                {/* Acciones en una cápsula de iconos (Jhon, 09/09/2026: "más
                    pequeños, sin letras, ocupan mucho"). Ver es el primario;
                    Descargar y Compartir, neutros; Detener y Borrar, en rojo.
                    El texto va en title/aria-label. */}
                <div className="flex shrink-0 items-center gap-1 rounded-full border border-border/60 bg-card/60 p-1" data-testid="acciones">
                  {r.status === "ready" && (
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center rounded-full bg-primary text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-50"
                      title={t("common.view")}
                      aria-label={t("grab.viewAria")}
                      disabled={ocupado}
                      onClick={() => void handleVer(r)}
                    >
                      {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5 fill-current" />}
                    </button>
                  )}
                  {r.status === "ready" && (
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                      title={t("common.download")}
                      aria-label={t("grab.downloadAria")}
                      disabled={ocupado}
                      onClick={() => void handleDownload(r)}
                    >
                      <Download className="h-4 w-4" />
                    </button>
                  )}
                  {r.status === "ready" && (
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                      title={t("grab.shareTitle")}
                      aria-label={t("grab.share.title")}
                      disabled={ocupado}
                      onClick={() => setCompartiendo(r)}
                    >
                      <Share2 className="h-4 w-4" />
                    </button>
                  )}
                  {r.status === "ready" && enElDrive && (mia || isAdmin) && (
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-50"
                      title={t("grab.drive.extend")}
                      aria-label={t("grab.drive.extend")}
                      disabled={ocupado}
                      onClick={() => void handleExtender(r.id)}
                    >
                      <CalendarPlus className="h-4 w-4" />
                    </button>
                  )}
                  {r.status === "recording" && (mia || isAdmin) && (
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center rounded-full text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
                      title={t("grab.stopTitle")}
                      aria-label={t("grab.stop")}
                      disabled={ocupado}
                      onClick={() => setPorDetener(r)}
                    >
                      {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5 fill-current" />}
                    </button>
                  )}
                  {(mia || isAdmin) && r.status !== "recording" && (
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                      title={t("grab.delete")}
                      aria-label={t("grab.delete")}
                      disabled={ocupado}
                      onClick={() => setPorBorrar(r)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {hayMas && (
            <Button
              variant="outline"
              className="mt-1 rounded-full"
              onClick={() => void cargarMas()}
              disabled={cargandoMas}
            >
              {cargandoMas
                ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> {t("common.loading")}</>
                : t("grab.loadMore")}
            </Button>
          )}
        </div>
      )}

      {/* Reproductor. El <video> apunta a la ruta /v del servidor de
          grabaciones, que la sirve inline y con Range: sin eso el navegador
          tendría que bajarse el archivo entero antes de mostrar nada y la
          barra de progreso no dejaría saltar. */}
      <CompartirGrabacionDialog grabacion={compartiendo} miId={myUserId} onClose={() => setCompartiendo(null)} />

      <AlertDialog open={!!porBorrar} onOpenChange={(o) => { if (!o) setPorBorrar(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("grab.deleteTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              <b className="text-foreground">{porBorrar?.title || porBorrar?.room_name}</b>
              {porBorrar?.started_at ? ` · ${fechaCorta(porBorrar.started_at, f)}` : ""}. {t("grab.deleteDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { const r = porBorrar; setPorBorrar(null); if (r) void handleDelete(r); }}
            >
              {t("grab.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!porExtender} onOpenChange={(o) => { if (!o) setPorExtender(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("grab.drive.askTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {grabacionPorExtender && <b className="text-foreground">{grabacionPorExtender.title || grabacionPorExtender.room_name} </b>}
              {copiaPorExtender?.vence_drive_at
                ? t("grab.drive.askDesc", { fecha: fechaDia(copiaPorExtender.vence_drive_at, f) })
                : t("grab.drive.askDescSinFecha")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel />
            <AlertDialogAction onClick={() => { const id = porExtender; setPorExtender(null); if (id) void handleExtender(id); }}>
              {t("grab.drive.extend")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!porDetener} onOpenChange={(o) => { if (!o) setPorDetener(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("grab.stopConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              <b className="text-foreground">{porDetener?.title || porDetener?.room_name}</b> {t("grab.stopConfirmDesc")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("grab.keepRecording")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { const r = porDetener; setPorDetener(null); if (r) void handleDetener(r); }}
            >
              {t("grab.stop")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!viendo} onOpenChange={(abierto) => { if (!abierto) setViendo(null); }}>
        <DialogContent className="max-w-4xl p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4">
            <DialogTitle className="text-base">
              {viendo?.rec.title || (viendo?.rec.source === "cowork" ? t("grab.coworkSession") : t("meet.guest.meetingFallback"))}
            </DialogTitle>
            <DialogDescription className="text-xs">
              {viendo && fechaCorta(viendo.rec.started_at, f)}
              {viendo?.rec.duration_seconds != null && ` · ${formatDur(viendo.rec.duration_seconds)}`}
              {viendo?.rec.size_bytes != null && ` · ${formatBytes(viendo.rec.size_bytes)}`}
            </DialogDescription>
          </DialogHeader>
          {viendo && (
            <video
              key={viendo.rec.id}
              src={viendo.url}
              controls
              autoPlay
              playsInline
              controlsList="nodownload"
              className="w-full max-h-[70vh] bg-black"
              onError={() => toast.error(t("grab.playError"))}

            />
          )}
        </DialogContent>
      </Dialog>
      </div>
    </main>
  );
}
