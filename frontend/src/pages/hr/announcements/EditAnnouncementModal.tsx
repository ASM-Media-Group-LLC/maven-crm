import { useState, useEffect, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimeSelect } from "@/components/ui/time-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DateInput } from "@/components/ui/date-input";
import { Progress } from "@/components/ui/progress";
import { ChevronLeft, ChevronRight, FileText, Clock, Users } from "lucide-react";
import AudienceSelector from "./AudienceSelector";
import { useUpdateAnnouncement, type AnnouncementRow, type AudienceTarget } from "./useAnnouncementsAdmin";
import { supabase } from "@/integrations/supabase/client";

const TYPES = [
  { value: "general", label: "General" },
  { value: "policy", label: "Política" },
  { value: "celebration", label: "Celebración" },
  { value: "holiday", label: "Feriado" },
  { value: "urgent", label: "Urgente" },
  { value: "reminder", label: "Recordatorio" },
  { value: "update", label: "Actualización interna" },
];

const PRIORITIES = [
  { value: "low", label: "Baja" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "Alta" },
];

const RECURRENCE = [
  { value: "none", label: "Sin repetición" },
  { value: "weekly", label: "Semanal" },
  { value: "monthly", label: "Mensual" },
];

const MODULES = [
  { value: "none", label: "Ninguno" },
  { value: "hr", label: "Recursos Humanos" },
  { value: "finance", label: "Finanzas" },
  { value: "operations", label: "Operaciones" },
  { value: "projects", label: "Proyectos" },
  { value: "sales", label: "Ventas" },
];

const STEPS = [
  { label: "Contenido", icon: FileText },
  { label: "Programación", icon: Clock },
  { label: "Audiencia", icon: Users },
];

type AudienceEntry = Omit<AudienceTarget, "id" | "announcement_id">;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  announcement: AnnouncementRow | null;
}

const EditAnnouncementModal = ({ open, onOpenChange, announcement }: Props) => {
  const update = useUpdateAnnouncement();
  const [step, setStep] = useState(0);

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState("general");
  const [priority, setPriority] = useState("normal");
  const [relatedModule, setRelatedModule] = useState("none");
  const [startsAt, setStartsAt] = useState("");
  const [startsTime, setStartsTime] = useState("08:00");
  const [expiresAt, setExpiresAt] = useState("");
  const [expiresTime, setExpiresTime] = useState("23:59");
  const [recurrence, setRecurrence] = useState("none");
  const [recurrenceEnd, setRecurrenceEnd] = useState("");
  const [status, setStatus] = useState("draft");
  const [visibility, setVisibility] = useState("global");
  const [audience, setAudience] = useState<AudienceEntry[]>([]);
  const [deliveryChannels, setDeliveryChannels] = useState<string[]>(["feed"]);

  useEffect(() => {
    if (announcement) {
      setStep(0);
      setTitle(announcement.title);
      setContent(announcement.content_html ?? announcement.message ?? "");
      setType(announcement.announcement_type);
      setPriority(announcement.priority);
      setRelatedModule(announcement.related_module ?? "none");
      setStartsAt(announcement.starts_at.slice(0, 10));
      setStartsTime(announcement.starts_at.slice(11, 16) || "08:00");
      setExpiresAt(announcement.expires_at?.slice(0, 10) ?? "");
      setExpiresTime(announcement.expires_at?.slice(11, 16) ?? "23:59");
      setRecurrence(announcement.recurrence_type ?? "none");
      setRecurrenceEnd(announcement.recurrence_end_at?.slice(0, 10) ?? "");
      setStatus(announcement.status);
      setVisibility(announcement.visibility);
      setDeliveryChannels(announcement.delivery_channels ?? ["feed"]);
      setAudience(
        (announcement.audience ?? []).map((a) => ({
          target_type: a.target_type,
          target_id: a.target_id,
          target_label: a.target_label,
        }))
      );
    }
  }, [announcement]);

  const handleSubmit = () => {
    if (!announcement || !title.trim()) return;

    const startsIso = startsAt ? new Date(`${startsAt}T${startsTime}:00`).toISOString() : new Date().toISOString();
    const expiresIso = expiresAt ? new Date(`${expiresAt}T${expiresTime}:00`).toISOString() : null;

    update.mutate(
      {
        id: announcement.id,
        title: title.trim(),
        message: content.trim() || null,
        content_html: content.trim() || null,
        announcement_type: type,
        priority,
        status,
        visibility,
        delivery_channels: deliveryChannels,
        related_module: relatedModule === "none" ? null : relatedModule,
        recurrence_type: recurrence,
        recurrence_end_at: recurrenceEnd ? new Date(`${recurrenceEnd}T23:59:59`).toISOString() : null,
        starts_at: startsIso,
        expires_at: expiresIso,
        audience,
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Anuncio</DialogTitle>
        </DialogHeader>

        {/* Stepper */}
        <div className="flex items-center gap-2 mb-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === step;
            const isDone = i < step;
            return (
              <div key={i} className="flex items-center gap-2 flex-1">
                <div
                  className={`flex items-center justify-center h-8 w-8 rounded-full shrink-0 text-xs font-medium transition-all ${
                    isActive
                      ? "bg-gradient-to-r from-accent to-primary text-primary-foreground ring-2 ring-accent/30"
                      : isDone
                      ? "bg-gradient-to-r from-accent to-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <span className={`text-xs font-medium hidden sm:block ${isActive ? "text-foreground" : "text-muted-foreground"}`}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div className="flex-1 h-0.5 rounded-full bg-muted mx-1">
                    <div className={`h-full rounded-full transition-all ${isDone ? "bg-gradient-to-r from-accent to-primary w-full" : "w-0"}`} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <Progress value={((step + 1) / STEPS.length) * 100} className="h-1" indicatorClassName="bg-gradient-to-r from-accent to-primary" />

        <div className="mt-4 space-y-4">
          {step === 0 && (
            <>
              <div className="space-y-2">
                <Label>Título *</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Contenido (Markdown)</Label>
                <Textarea value={content} onChange={(e) => setContent(e.target.value)} rows={6} className="font-mono text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Tipo</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Prioridad</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORITIES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Módulo relacionado</Label>
                <Select value={relatedModule} onValueChange={setRelatedModule}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MODULES.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Fecha de publicación</Label>
                  <DateInput value={startsAt} onChange={setStartsAt} />
                </div>
                <div className="space-y-2">
                  <Label>Hora de publicación</Label>
                  <TimeSelect value={startsTime} onChange={setStartsTime} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Fecha de expiración</Label>
                  <DateInput value={expiresAt} onChange={setExpiresAt} placeholder="Sin expiración" />
                </div>
                <div className="space-y-2">
                  <Label>Repetición</Label>
                  <Select value={recurrence} onValueChange={setRecurrence}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {RECURRENCE.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              {(expiresAt || recurrence !== "none") && (
                <div className="grid grid-cols-2 gap-4">
                  {expiresAt && (
                    <div className="space-y-2">
                      <Label>Hora de expiración</Label>
                      <TimeSelect value={expiresTime} onChange={setExpiresTime} />
                    </div>
                  )}
                  {recurrence !== "none" && (
                    <div className={`space-y-2 ${!expiresAt ? "col-start-2" : ""}`}>
                      <Label>Fin de repetición</Label>
                      <DateInput value={recurrenceEnd} onChange={setRecurrenceEnd} placeholder="Sin fin" />
                    </div>
                  )}
                </div>
              )}
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Borrador</SelectItem>
                    <SelectItem value="scheduled">Programado</SelectItem>
                    <SelectItem value="active">Activo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          {step === 2 && (
            <AudienceSelector
              visibility={visibility}
              onVisibilityChange={setVisibility}
              audience={audience}
              onAudienceChange={setAudience}
              deliveryChannels={deliveryChannels}
              onDeliveryChannelsChange={setDeliveryChannels}
            />
          )}
        </div>

        <DialogFooter className="mt-4 gap-2">
          {step > 0 && (
            <Button variant="outline" onClick={() => setStep(step - 1)} className="gap-1">
              <ChevronLeft className="h-4 w-4" /> Anterior
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} className="gap-1">
              Siguiente <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!title.trim() || update.isPending}>
              {update.isPending ? "Guardando..." : "Guardar"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditAnnouncementModal;
