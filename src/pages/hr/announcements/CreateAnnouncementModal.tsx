import { useState, useCallback } from "react";
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
import { useCreateAnnouncement, type AudienceTarget } from "./useAnnouncementsAdmin";
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
  { value: "", label: "Ninguno" },
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
}

const CreateAnnouncementModal = ({ open, onOpenChange }: Props) => {
  const create = useCreateAnnouncement();
  const [step, setStep] = useState(0);

  // Step 1 - Content
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [type, setType] = useState("general");
  const [priority, setPriority] = useState("normal");
  const [relatedModule, setRelatedModule] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);

  // Step 2 - Scheduling
  const [startsAt, setStartsAt] = useState(new Date().toISOString().slice(0, 10));
  const [startsTime, setStartsTime] = useState("08:00");
  const [expiresAt, setExpiresAt] = useState("");
  const [expiresTime, setExpiresTime] = useState("23:59");
  const [recurrence, setRecurrence] = useState("none");
  const [recurrenceEnd, setRecurrenceEnd] = useState("");
  const [publishAs, setPublishAs] = useState("scheduled");

  // Step 3 - Audience
  const [visibility, setVisibility] = useState("global");
  const [audience, setAudience] = useState<AudienceEntry[]>([
    { target_type: "all", target_id: null, target_label: "Toda la empresa" },
  ]);
  const [deliveryChannels, setDeliveryChannels] = useState<string[]>(["feed"]);

  const reset = useCallback(() => {
    setStep(0);
    setTitle(""); setContent(""); setType("general"); setPriority("normal");
    setRelatedModule(""); setImageFile(null); setAttachmentFile(null);
    setStartsAt(new Date().toISOString().slice(0, 10)); setStartsTime("08:00");
    setExpiresAt(""); setExpiresTime("23:59");
    setRecurrence("none"); setRecurrenceEnd(""); setPublishAs("scheduled");
    setVisibility("global");
    setAudience([{ target_type: "all", target_id: null, target_label: "Toda la empresa" }]);
    setDeliveryChannels(["feed"]);
  }, []);

  const uploadFile = async (file: File, folder: string) => {
    const ext = file.name.split(".").pop();
    const path = `${folder}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("announcement-files").upload(path, file);
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from("announcement-files").getPublicUrl(path);
    return publicUrl;
  };

  const handleSubmit = async () => {
    if (!title.trim()) return;

    let imageUrl: string | null = null;
    let attachmentUrl: string | null = null;
    let attachmentName: string | null = null;

    if (imageFile) imageUrl = await uploadFile(imageFile, "images");
    if (attachmentFile) {
      attachmentUrl = await uploadFile(attachmentFile, "attachments");
      attachmentName = attachmentFile.name;
    }

    const startsIso = publishAs === "active"
      ? new Date().toISOString()
      : startsAt
        ? new Date(`${startsAt}T${startsTime}:00`).toISOString()
        : new Date().toISOString();
    const expiresIso = expiresAt
      ? new Date(`${expiresAt}T${expiresTime}:00`).toISOString()
      : null;

    // Determine status
    let status = publishAs;
    if (publishAs === "active") status = "active";
    else if (publishAs === "draft") status = "draft";
    else status = "scheduled";

    create.mutate(
      {
        title: title.trim(),
        message: content.trim() || undefined,
        content_html: content.trim() || undefined,
        announcement_type: type,
        priority,
        status,
        visibility,
        delivery_channels: deliveryChannels,
        related_module: relatedModule || null,
        recurrence_type: recurrence,
        recurrence_end_at: recurrenceEnd ? new Date(`${recurrenceEnd}T23:59:59`).toISOString() : null,
        starts_at: startsIso,
        expires_at: expiresIso,
        image_url: imageUrl,
        attachment_url: attachmentUrl,
        attachment_name: attachmentName,
        audience,
      },
      { onSuccess: () => { reset(); onOpenChange(false); } }
    );
  };

  const canNext = step === 0 ? title.trim().length > 0 : true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nuevo Anuncio</DialogTitle>
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
                    <div
                      className={`h-full rounded-full transition-all ${isDone ? "bg-gradient-to-r from-accent to-primary w-full" : "w-0"}`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <Progress value={((step + 1) / STEPS.length) * 100} className="h-1" indicatorClassName="bg-gradient-to-r from-accent to-primary" />

        {/* Step content */}
        <div className="mt-4 space-y-4">
          {step === 0 && (
            <>
              <div className="space-y-2">
                <Label>Título *</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título del anuncio" />
              </div>
              <div className="space-y-2">
                <Label>Contenido (Markdown)</Label>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Escribe el contenido del anuncio. Soporta **Markdown**..."
                  rows={6}
                  className="font-mono text-sm"
                />
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
                  <SelectTrigger><SelectValue placeholder="Ninguno" /></SelectTrigger>
                  <SelectContent>
                    {MODULES.map((m) => <SelectItem key={m.value || "none"} value={m.value || "none"}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Imagen (opcional)</Label>
                  <Input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} className="text-sm" />
                </div>
                <div className="space-y-2">
                  <Label>Archivo adjunto (opcional)</Label>
                  <Input type="file" onChange={(e) => setAttachmentFile(e.target.files?.[0] ?? null)} className="text-sm" />
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label>Publicar como</Label>
                <Select value={publishAs} onValueChange={setPublishAs}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Publicar ahora</SelectItem>
                    <SelectItem value="scheduled">Programado</SelectItem>
                    <SelectItem value="draft">Borrador</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {publishAs !== "active" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Fecha de publicación</Label>
                    <DateInput value={startsAt} onChange={setStartsAt} placeholder="Fecha inicio" />
                  </div>
                  <div className="space-y-2">
                    <Label>Hora de publicación</Label>
                    <TimeSelect value={startsTime} onChange={setStartsTime} />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Fecha de expiración (opcional)</Label>
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
            <Button onClick={() => setStep(step + 1)} disabled={!canNext} className="gap-1">
              Siguiente <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!title.trim() || create.isPending}>
              {create.isPending ? "Creando..." : "Crear Anuncio"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateAnnouncementModal;
