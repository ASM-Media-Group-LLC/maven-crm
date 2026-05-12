import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  useCreateReportSchedule,
  useUpdateReportSchedule,
  type ReportModule,
  type ReportPeriod,
  type ReportScheduleWithRecipients,
} from "@/hooks/useReportSchedules";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  schedule: ReportScheduleWithRecipients | null;
}

const ReportScheduleModal = ({ open, onOpenChange, schedule }: Props) => {
  const isEdit = !!schedule;
  const [name, setName] = useState("");
  const [module, setModule] = useState<ReportModule>("llg");
  const [period, setPeriod] = useState<ReportPeriod>("weekly");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [saving, setSaving] = useState(false);

  const createSchedule = useCreateReportSchedule();
  const updateSchedule = useUpdateReportSchedule();

  // Reset/hydrate state cuando abre el modal.
  useEffect(() => {
    if (open) {
      if (schedule) {
        setName(schedule.name);
        setModule(schedule.module);
        setPeriod(schedule.period);
        setRecipients(schedule.recipients.map((r) => r.email));
      } else {
        setName("");
        setModule("llg");
        setPeriod("weekly");
        setRecipients([]);
      }
      setEmailInput("");
    }
  }, [open, schedule]);

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const addEmail = () => {
    const v = emailInput.trim().toLowerCase();
    if (!v) return;
    if (!emailRegex.test(v)) {
      toast.error("Email inválido");
      return;
    }
    if (recipients.includes(v)) {
      toast.error("Ese email ya está en la lista");
      return;
    }
    setRecipients([...recipients, v]);
    setEmailInput("");
  };

  const removeEmail = (e: string) => setRecipients(recipients.filter((x) => x !== e));

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Falta el nombre");
      return;
    }
    if (recipients.length === 0) {
      toast.error("Agregá al menos un destinatario");
      return;
    }
    setSaving(true);
    try {
      const recipientsPayload = recipients.map((email) => ({ email, user_id: null }));
      if (isEdit && schedule) {
        await updateSchedule.mutateAsync({
          id: schedule.id,
          patch: { name: name.trim(), module, period },
          recipients: recipientsPayload,
        });
        toast.success("Reporte actualizado");
      } else {
        await createSchedule.mutateAsync({
          name: name.trim(),
          module,
          period,
          recipients: recipientsPayload,
        });
        toast.success("Reporte creado");
      }
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Error al guardar", { description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar reporte" : "Nuevo reporte"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="report-name">Nombre *</Label>
            <Input
              id="report-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Reporte semanal LLGs"
              maxLength={120}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Módulo *</Label>
              <Select value={module} onValueChange={(v) => setModule(v as ReportModule)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="llg">LLGs</SelectItem>
                  <SelectItem value="closers">Closers</SelectItem>
                  <SelectItem value="chatters">Chatters</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Periodicidad *</Label>
              <Select value={period} onValueChange={(v) => setPeriod(v as ReportPeriod)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Diario</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="monthly">Mensual</SelectItem>
                  <SelectItem value="annual">Anual</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Destinatarios *</Label>
            <p className="text-[11px] text-muted-foreground -mt-1">
              Email libre — pueden ser users de Maven o externos.
            </p>
            <div className="flex gap-2">
              <Input
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addEmail();
                  }
                }}
                placeholder="ejemplo@dominio.com"
                type="email"
              />
              <Button type="button" variant="outline" size="icon" onClick={addEmail} title="Agregar">
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {recipients.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {recipients.map((e) => (
                  <Badge key={e} variant="secondary" className="gap-1 pr-1">
                    {e}
                    <button
                      type="button"
                      onClick={() => removeEmail(e)}
                      className="hover:bg-muted-foreground/20 rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Pista del rango que cubriría según period */}
          <div className="rounded-md border border-border/60 bg-muted/20 p-2.5 text-[11px] text-muted-foreground">
            {period === "daily" && "Cada día a las 8:00 AM Miami recibirás los datos del día anterior (00:00 a 23:59)."}
            {period === "weekly" && "Cada lunes 8:00 AM Miami recibirás los datos de la semana pasada (lunes 00:00 a domingo 23:59)."}
            {period === "monthly" && "El día 1 de cada mes a las 8:00 AM Miami recibirás los datos del mes pasado."}
            {period === "annual" && "El 1 de enero a las 8:00 AM Miami recibirás los datos del año anterior."}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Guardando..." : isEdit ? "Guardar cambios" : "Crear reporte"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReportScheduleModal;
