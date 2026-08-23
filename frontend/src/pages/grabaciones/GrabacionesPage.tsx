import { useState } from "react";
import { useRecordings, RecordingRow } from "@/hooks/useRecordings";
import { useUserRole } from "@/hooks/useUserRole";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/EmptyState";
import {
  Clapperboard, Download, Loader2, Trash2, Users2, Video, AlertTriangle, HardDrive, Clock,
} from "lucide-react";

// Grabaciones de Meet/Cowork. Dos reglas que la página tiene que hacer
// imposibles de ignorar (vienen del diseño de la tabla, ver la migración):
//
//   1. TODO vence a los 90 días, sin excepciones. Es lo que hace viable
//      guardar en el disco del VPS. La fecha de vencimiento va en cada fila
//      y el aviso arriba — quien necesite algo más tiempo, lo descarga.
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

const fechaCorta = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function GrabacionesPage() {
  const { rows, usage, myUserId, loading, download, remove } = useRecordings();
  const { isAdmin } = useUserRole();
  const [trabajando, setTrabajando] = useState<string | null>(null);

  const handleDownload = async (r: RecordingRow) => {
    setTrabajando(r.id);
    try {
      await download(r.id);
    } catch (e) {
      toast.error((e as Error).message || "No se pudo generar la descarga");
    } finally {
      setTrabajando(null);
    }
  };

  const handleDelete = async (r: RecordingRow) => {
    const nombre = r.title || r.room_name;
    if (!window.confirm(`¿Borrar la grabación "${nombre}"? El archivo se elimina ya mismo y no se puede recuperar.`)) return;
    setTrabajando(r.id);
    try {
      await remove(r.id);
      toast.success("Grabación borrada");
    } catch (e) {
      toast.error((e as Error).message || "No se pudo borrar");
    } finally {
      setTrabajando(null);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10">
          <Clapperboard className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-foreground">Grabaciones</h1>
          <p className="text-sm text-muted-foreground">Reuniones grabadas en Meet y Cowork</p>
        </div>
      </div>

      {/* El espacio y el vencimiento, siempre a la vista. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <UsageCard icon={Clapperboard} label="Grabaciones" value={usage ? String(usage.total_recordings) : "—"} />
        <UsageCard icon={HardDrive} label="Espacio usado" value={usage ? formatBytes(usage.total_bytes) : "—"} />
        <UsageCard
          icon={Clock}
          label="Vencen esta semana"
          value={usage ? String(usage.expiring_next_week) : "—"}
          warn={!!usage && usage.expiring_next_week > 0}
          className="col-span-2 sm:col-span-1"
        />
      </div>

      <div className="flex items-start gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[13px] leading-snug text-amber-700 dark:text-amber-300">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Toda grabación <b>se borra a los 90 días, sin excepciones</b>. Si necesitás
          conservar una por más tiempo, descargala a tu equipo antes de que venza.
        </span>
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
      ) : rows.length === 0 ? (
        <EmptyState
          className="rounded-3xl border border-dashed border-border/70"
          seed="empty-grabaciones"
          title="Todavía no hay grabaciones"
          description="Dentro de una reunión de Meet o de una sala de Cowork verás el botón Grabar arriba a la izquierda. Al detener, eliges con quién compartirla."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((r) => {
            const dias = diasHasta(r.expires_at);
            const dur = formatDur(r.duration_seconds);
            const mia = r.started_by === myUserId;
            const ocupado = trabajando === r.id;
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
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-semibold text-red-500">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" /> En curso
                      </span>
                    )}
                    {r.status === "processing" && (
                      <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">Procesando…</span>
                    )}
                    {r.status === "failed" && (
                      <span className="shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-[11px] font-semibold text-destructive">Falló</span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{fechaCorta(r.started_at)}</span>
                    {dur && <><span>·</span><span>{dur}</span></>}
                    {r.size_bytes != null && <><span>·</span><span>{formatBytes(r.size_bytes)}</span></>}
                    {r.status === "ready" && dias !== null && (
                      <>
                        <span>·</span>
                        <span className={cn(
                          dias <= 2 ? "font-semibold text-destructive" : dias <= 7 ? "font-medium text-amber-600 dark:text-amber-400" : "",
                        )}>
                          {dias <= 0 ? "vence hoy" : `vence en ${dias} ${dias === 1 ? "día" : "días"}`}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {r.status === "ready" && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0 gap-1.5 rounded-full"
                    disabled={ocupado}
                    onClick={() => void handleDownload(r)}
                  >
                    {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">Descargar</span>
                  </Button>
                )}
                {(mia || isAdmin) && r.status !== "recording" && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 shrink-0 rounded-full text-muted-foreground hover:text-destructive"
                    title="Borrar grabación"
                    disabled={ocupado}
                    onClick={() => void handleDelete(r)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UsageCard({ icon: Icon, label, value, warn, className }: {
  icon: typeof Clapperboard; label: string; value: string; warn?: boolean; className?: string;
}) {
  return (
    <div className={cn(
      "flex items-center gap-3 rounded-2xl border px-4 py-3",
      warn ? "border-amber-500/30 bg-amber-500/10" : "border-border bg-card",
      className,
    )}>
      <Icon className={cn("h-4 w-4 shrink-0", warn ? "text-amber-500" : "text-muted-foreground")} />
      <div className="min-w-0">
        <div className={cn("text-lg font-bold leading-tight", warn ? "text-amber-600 dark:text-amber-400" : "text-foreground")}>{value}</div>
        <div className="truncate text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      </div>
    </div>
  );
}
