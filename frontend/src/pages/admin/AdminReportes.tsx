import { useState } from "react";
import { Plus, Mail, Trash2, Edit3, Power, Clock, Send, Loader2, Eye, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import {
  useReportSchedules,
  useDeleteReportSchedule,
  useUpdateReportSchedule,
  useSendReportNow,
  useReportPreview,
  type ReportScheduleWithRecipients,
  type ReportPeriod,
} from "@/hooks/useReportSchedules";
import ReportScheduleModal from "./ReportScheduleModal";

// Settings → Administración → Reportes
// CRUD de reports programados. Los reports se mandan via cron diario y
// la función dispatch-reports decide cuáles disparar HOY según period.

// Toggle inline que carga la vista previa del email cuando se expande.
// Cargada lazy: el query a send-report (preview_only=true) sólo corre
// cuando el user hace click en "Vista previa".
const ReportPreviewToggle = ({ scheduleId }: { scheduleId: string }) => {
  const [open, setOpen] = useState(false);
  const { data: preview, isLoading, isError, error } = useReportPreview(scheduleId, open);

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors"
      >
        <Eye className="h-3 w-3" />
        Vista previa del email
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open && (
        <div className="mt-2 w-full rounded-lg border border-border/60 bg-white">
          {isLoading ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              Generando preview…
            </div>
          ) : isError ? (
            <div className="p-4 text-center text-xs text-destructive">
              Error al generar preview: {(error as any)?.message ?? "desconocido"}
            </div>
          ) : preview ? (
            <div className="space-y-2 p-3">
              <div className="rounded bg-muted/30 px-3 py-2 text-[11px] text-foreground">
                <div><span className="font-semibold text-muted-foreground">Asunto:</span> {preview.subject}</div>
                <div className="text-muted-foreground">
                  {preview.row_count} {preview.row_count === 1 ? "fila" : "filas"} · rango usado: {new Date(preview.from).toLocaleString("es-CO")} → {new Date(preview.to).toLocaleString("es-CO")}
                </div>
              </div>
              {/* Wrapper full-width con scroll horizontal SOLO si el email
                  excede el ancho disponible. El email tiene max-width:720px
                  fijo en su template, así que en cards >720px se centra
                  con espacio a los lados. */}
              <div className="w-full overflow-x-auto rounded border border-border/40 bg-slate-50 p-3">
                <div
                  className="mx-auto"
                  // El HTML viene de nuestra propia function send-report — fuente confiable.
                  dangerouslySetInnerHTML={{ __html: preview.html }}
                />
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};

const PERIOD_LABELS: Record<ReportPeriod, string> = {
  daily: "Diario",
  weekly: "Semanal",
  quincenal: "Quincenal",
  monthly: "Mensual",
  annual: "Anual",
};

const PERIOD_TONES: Record<ReportPeriod, string> = {
  daily: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  weekly: "bg-blue-500/15 text-blue-300 ring-blue-400/30",
  quincenal: "bg-cyan-500/15 text-cyan-300 ring-cyan-400/30",
  monthly: "bg-violet-500/15 text-violet-300 ring-violet-400/30",
  annual: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
};

const AdminReportes = () => {
  const { data: schedules = [], isLoading } = useReportSchedules();
  const deleteSchedule = useDeleteReportSchedule();
  const updateSchedule = useUpdateReportSchedule();
  const sendNow = useSendReportNow();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ReportScheduleWithRecipients | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  // Confirm dialogs Maven-styled — reemplazo del confirm() nativo.
  const [sendConfirm, setSendConfirm] = useState<ReportScheduleWithRecipients | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<ReportScheduleWithRecipients | null>(null);

  const handleSendNow = (s: ReportScheduleWithRecipients) => {
    if (s.recipients.length === 0) {
      toast.error("Agregá al menos un destinatario antes de enviar");
      return;
    }
    setSendConfirm(s);
  };

  const confirmSendNow = async () => {
    if (!sendConfirm) return;
    const s = sendConfirm;
    setSendConfirm(null);
    setSendingId(s.id);
    try {
      await sendNow.mutateAsync(s.id);
      toast.success("Reporte enviado", {
        description: "El email se mandó a los destinatarios. La próxima ejecución programada no se modificó.",
      });
    } catch (e: any) {
      toast.error("Error al enviar", { description: e.message });
    } finally {
      setSendingId(null);
    }
  };

  const handleEdit = (s: ReportScheduleWithRecipients) => {
    setEditing(s);
    setModalOpen(true);
  };

  const handleDelete = (s: ReportScheduleWithRecipients) => setDeleteConfirm(s);

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    const s = deleteConfirm;
    setDeleteConfirm(null);
    try {
      await deleteSchedule.mutateAsync(s.id);
      toast.success("Reporte eliminado");
    } catch (e: any) {
      toast.error("Error al eliminar", { description: e.message });
    }
  };

  const handleToggle = async (s: ReportScheduleWithRecipients) => {
    try {
      await updateSchedule.mutateAsync({ id: s.id, patch: { is_active: !s.is_active } });
      toast.success(s.is_active ? "Reporte pausado" : "Reporte activado");
    } catch (e: any) {
      toast.error("Error", { description: e.message });
    }
  };

  return (
    <div className="space-y-4 p-6 lg:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reportes programados</h1>
          <p className="text-sm text-muted-foreground">
            Reportes automáticos por email — configurá módulo, periodicidad y destinatarios.
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setModalOpen(true); }}>
          <Plus className="h-4 w-4 mr-1.5" />
          Nuevo reporte
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : schedules.length === 0 ? (
        <Card>
          <CardContent className="p-10 text-center">
            <div className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 mb-3">
              <Send className="h-5 w-5 text-primary" />
            </div>
            <p className="text-base font-semibold">Sin reportes configurados</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Configurá un reporte automático y se enviará por email con la
              periodicidad que elijas (diario, semanal, mensual o anual).
            </p>
            <Button className="mt-4" onClick={() => { setEditing(null); setModalOpen(true); }}>
              <Plus className="h-4 w-4 mr-1.5" />
              Crear primer reporte
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {schedules.map((s) => (
            <Card
              key={s.id}
              className={
                s.is_active
                  ? "border-border"
                  : "border-border/50 opacity-60"
              }
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-base truncate">{s.name}</p>
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {s.role_name || s.module}
                      </Badge>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full ring-1 px-2 py-0.5 text-[10px] font-bold ${PERIOD_TONES[s.period]}`}
                      >
                        <Clock className="h-3 w-3" />
                        {PERIOD_LABELS[s.period]} · {String(s.dispatch_hour ?? 8).padStart(2, "0")}:00 Miami
                      </span>
                      {!s.is_active && (
                        <Badge variant="secondary" className="text-[10px]">
                          Pausado
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                      <Mail className="h-3 w-3 shrink-0" />
                      {s.recipients.length === 0 ? (
                        <span className="text-amber-500">Sin destinatarios</span>
                      ) : (
                        <span>
                          {s.recipients.length} {s.recipients.length === 1 ? "destinatario" : "destinatarios"}:{" "}
                          {s.recipients.slice(0, 3).map((r) => r.email).join(", ")}
                          {s.recipients.length > 3 && ` +${s.recipients.length - 3}`}
                        </span>
                      )}
                    </div>
                    {s.last_dispatched_at && (
                      <p className="text-[10px] text-muted-foreground">
                        Último envío: {new Date(s.last_dispatched_at).toLocaleString("es-CO")}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-1.5"
                      onClick={() => handleSendNow(s)}
                      disabled={sendingId === s.id || s.recipients.length === 0}
                      title="Enviar ahora"
                    >
                      {sendingId === s.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      Enviar ahora
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggle(s)}
                      title={s.is_active ? "Pausar" : "Activar"}
                    >
                      <Power className={`h-4 w-4 ${s.is_active ? "text-emerald-500" : "text-muted-foreground"}`} />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => handleEdit(s)} title="Editar">
                      <Edit3 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(s)}
                      title="Borrar"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                {/* Vista previa full-width — fuera del flex row para que
                    al expandirse ocupe todo el ancho de la Card. */}
                <ReportPreviewToggle scheduleId={s.id} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <ReportScheduleModal
        open={modalOpen}
        onOpenChange={(o) => {
          setModalOpen(o);
          if (!o) setEditing(null);
        }}
        schedule={editing}
      />

      <AlertDialog open={!!sendConfirm} onOpenChange={(o) => !o && setSendConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Enviar reporte ahora</AlertDialogTitle>
            <AlertDialogDescription>
              Se va a enviar <strong>"{sendConfirm?.name}"</strong> al instante a{" "}
              <strong>
                {sendConfirm?.recipients.length} destinatario
                {sendConfirm && sendConfirm.recipients.length === 1 ? "" : "s"}
              </strong>
              . La próxima ejecución programada del cron <strong>no se modifica</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmSendNow}>
              <Send className="h-3.5 w-3.5 mr-1.5" /> Enviar ahora
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={(o) => !o && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Borrar reporte</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Seguro que querés borrar <strong>"{deleteConfirm?.name}"</strong>? Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Borrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default AdminReportes;
