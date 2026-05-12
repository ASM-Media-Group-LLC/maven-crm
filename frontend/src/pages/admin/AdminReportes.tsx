import { useState } from "react";
import { Plus, Mail, Trash2, Edit3, Power, Clock, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import {
  useReportSchedules,
  useDeleteReportSchedule,
  useUpdateReportSchedule,
  type ReportScheduleWithRecipients,
  type ReportModule,
  type ReportPeriod,
} from "@/hooks/useReportSchedules";
import ReportScheduleModal from "./ReportScheduleModal";

// Settings → Administración → Reportes
// CRUD de reports programados. Los reports se mandan via cron diario y
// la función dispatch-reports decide cuáles disparar HOY según period.

const MODULE_LABELS: Record<ReportModule, string> = {
  llg: "LLGs",
  closers: "Closers",
  chatters: "Chatters",
};

const PERIOD_LABELS: Record<ReportPeriod, string> = {
  daily: "Diario",
  weekly: "Semanal",
  monthly: "Mensual",
  annual: "Anual",
};

const PERIOD_TONES: Record<ReportPeriod, string> = {
  daily: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/30",
  weekly: "bg-blue-500/15 text-blue-300 ring-blue-400/30",
  monthly: "bg-violet-500/15 text-violet-300 ring-violet-400/30",
  annual: "bg-amber-500/15 text-amber-300 ring-amber-400/30",
};

const AdminReportes = () => {
  const { data: schedules = [], isLoading } = useReportSchedules();
  const deleteSchedule = useDeleteReportSchedule();
  const updateSchedule = useUpdateReportSchedule();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ReportScheduleWithRecipients | null>(null);

  const handleEdit = (s: ReportScheduleWithRecipients) => {
    setEditing(s);
    setModalOpen(true);
  };

  const handleDelete = async (s: ReportScheduleWithRecipients) => {
    if (!confirm(`¿Borrar el reporte "${s.name}"?`)) return;
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
                      <Badge variant="outline" className="text-[10px]">
                        {MODULE_LABELS[s.module]}
                      </Badge>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full ring-1 px-2 py-0.5 text-[10px] font-bold ${PERIOD_TONES[s.period]}`}
                      >
                        <Clock className="h-3 w-3" />
                        {PERIOD_LABELS[s.period]}
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
    </div>
  );
};

export default AdminReportes;
