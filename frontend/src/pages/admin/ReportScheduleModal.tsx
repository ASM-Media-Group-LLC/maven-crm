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
  useTenantRoles,
  roleToModule,
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
  const [roleName, setRoleName] = useState<string>("");
  const [period, setPeriod] = useState<ReportPeriod>("weekly");
  const [dispatchHour, setDispatchHour] = useState<number>(8);
  const [emailSubject, setEmailSubject] = useState<string>("");
  const [recipients, setRecipients] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");
  const [saving, setSaving] = useState(false);

  const createSchedule = useCreateReportSchedule();
  const updateSchedule = useUpdateReportSchedule();
  const { data: roles = [] } = useTenantRoles();

  // Reset/hydrate state cuando abre el modal.
  useEffect(() => {
    if (open) {
      if (schedule) {
        setName(schedule.name);
        // role_name puede estar null en schedules viejos — fallback a module.
        setRoleName(schedule.role_name ?? (schedule.module === "closers" ? "closer" : schedule.module === "chatters" ? "Chatter Supervisor" : "employee"));
        setPeriod(schedule.period);
        setDispatchHour(schedule.dispatch_hour ?? 8);
        setEmailSubject(schedule.email_subject ?? "");
        setRecipients(schedule.recipients.map((r) => r.email));
      } else {
        setName("");
        setRoleName("employee");
        setPeriod("weekly");
        setDispatchHour(8);
        setEmailSubject("");
        setRecipients([]);
      }
      setEmailInput("");
    }
  }, [open, schedule]);

  // Email validation: local part no termina con punto, dominio tiene
  // al menos un punto, no admite dobles puntos. Mismo criterio que
  // Resend usa antes de mandar (sino devuelve 422 "Invalid `to` field").
  const isValidEmail = (raw: string): boolean => {
    const v = raw.trim().toLowerCase();
    if (!v || v.length > 254) return false;
    const at = v.indexOf("@");
    if (at < 1 || at !== v.lastIndexOf("@")) return false;
    const local = v.slice(0, at);
    const domain = v.slice(at + 1);
    if (local.startsWith(".") || local.endsWith(".") || local.includes("..")) return false;
    if (!/^[a-zA-Z0-9._%+-]+$/.test(local)) return false;
    if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return false;
    if (!/^[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(domain)) return false;
    return true;
  };

  const addEmail = () => {
    const v = emailInput.trim().toLowerCase();
    if (!v) return;
    if (!isValidEmail(v)) {
      toast.error("Email inválido", {
        description: "Verificá que no tenga puntos antes/después del @ y que tenga un dominio válido.",
      });
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
    if (!roleName) {
      toast.error("Elegí un rol");
      return;
    }
    setSaving(true);
    try {
      const recipientsPayload = recipients.map((email) => ({ email, user_id: null }));
      const subjectPayload = emailSubject.trim() ? emailSubject.trim() : null;
      const derivedModule = roleToModule(roleName);
      if (isEdit && schedule) {
        await updateSchedule.mutateAsync({
          id: schedule.id,
          patch: {
            name: name.trim(),
            module: derivedModule,
            role_name: roleName,
            period,
            dispatch_hour: dispatchHour,
            email_subject: subjectPayload,
          },
          recipients: recipientsPayload,
        });
        toast.success("Reporte actualizado");
      } else {
        await createSchedule.mutateAsync({
          name: name.trim(),
          role_name: roleName,
          module: derivedModule,
          period,
          dispatch_hour: dispatchHour,
          email_subject: subjectPayload,
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

          <div className="space-y-1.5">
            <Label htmlFor="report-subject">Asunto del email (opcional)</Label>
            <Input
              id="report-subject"
              value={emailSubject}
              onChange={(e) => setEmailSubject(e.target.value)}
              placeholder={`Maven CRM · Reporte ${period === "daily" ? "diario" : period === "weekly" ? "semanal" : period === "monthly" ? "mensual" : "anual"} ${roleName || "rol"}`}
              maxLength={200}
            />
            <p className="text-[11px] text-muted-foreground">
              Si lo dejás vacío, se genera automático según rol y periodicidad.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label>Rol *</Label>
              <Select value={roleName} onValueChange={(v) => setRoleName(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Elegí un rol" />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.name}>
                      {r.name}
                    </SelectItem>
                  ))}
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
            <div className="space-y-1.5">
              <Label>Hora envío *</Label>
              <Select value={String(dispatchHour)} onValueChange={(v) => setDispatchHour(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {Array.from({ length: 24 }, (_, h) => (
                    <SelectItem key={h} value={String(h)}>
                      {String(h).padStart(2, "0")}:00 (Miami)
                    </SelectItem>
                  ))}
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

          {/* Pista del rango que cubriría según period + hora elegida */}
          <div className="rounded-md border border-border/60 bg-muted/20 p-2.5 text-[11px] text-muted-foreground">
            {(() => {
              const hh = `${String(dispatchHour).padStart(2, "0")}:00`;
              if (period === "daily") return `Cada día a las ${hh} Miami recibirás los datos del día anterior (00:00 a 23:59).`;
              if (period === "weekly") return `Cada lunes ${hh} Miami recibirás los datos de la semana pasada (lunes 00:00 a domingo 23:59).`;
              if (period === "monthly") return `El día 1 de cada mes a las ${hh} Miami recibirás los datos del mes pasado.`;
              return `El 1 de enero a las ${hh} Miami recibirás los datos del año anterior.`;
            })()}
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
