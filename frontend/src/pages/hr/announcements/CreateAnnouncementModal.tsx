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
import { useLanguage } from "@/hooks/useLanguage";
import {
  MODULOS_ANUNCIO, PASOS_ANUNCIO, PRIORIDADES_ANUNCIO, REPETICIONES_ANUNCIO, TIPOS_ANUNCIO, TODA_LA_EMPRESA_GUARDADO,
} from "./opcionesAnuncio";

const STEPS = PASOS_ANUNCIO.map((clave, i) => ({ clave, icon: [FileText, Clock, Users][i] }));

type AudienceEntry = Omit<AudienceTarget, "id" | "announcement_id">;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

const CreateAnnouncementModal = ({ open, onOpenChange }: Props) => {
  const { t } = useLanguage();
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
    { target_type: "all", target_id: null, target_label: TODA_LA_EMPRESA_GUARDADO },
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
    setAudience([{ target_type: "all", target_id: null, target_label: TODA_LA_EMPRESA_GUARDADO }]);
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
          <DialogTitle>{t("hrg.ann.newTitle")}</DialogTitle>
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
                  {t(s.clave)}
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
                <Label>{t("common.title")} *</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t("hrg.ann.titlePlaceholder")} />
              </div>
              <div className="space-y-2">
                <Label>{t("hrg.ann.contentMarkdown")}</Label>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder={t("hrg.ann.contentPlaceholder")}
                  rows={6}
                  className="font-mono text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("common.type")}</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_ANUNCIO.map((o) => <SelectItem key={o.value} value={o.value}>{t(o.clave)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>{t("hrg.ann.priority")}</Label>
                  <Select value={priority} onValueChange={setPriority}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PRIORIDADES_ANUNCIO.map((p) => <SelectItem key={p.value} value={p.value}>{t(p.clave)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t("hrg.ann.relatedModule")}</Label>
                <Select value={relatedModule} onValueChange={setRelatedModule}>
                  <SelectTrigger><SelectValue placeholder={t("common.none")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("common.none")}</SelectItem>
                    {MODULOS_ANUNCIO.map((m) => <SelectItem key={m.value} value={m.value}>{t(m.clave)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("hrg.ann.imageOptional")}</Label>
                  <Input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} className="text-sm" />
                </div>
                <div className="space-y-2">
                  <Label>{t("hrg.ann.attachmentOptional")}</Label>
                  <Input type="file" onChange={(e) => setAttachmentFile(e.target.files?.[0] ?? null)} className="text-sm" />
                </div>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label>{t("hrg.ann.publishAs")}</Label>
                <Select value={publishAs} onValueChange={setPublishAs}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t("hrg.ann.publishNow")}</SelectItem>
                    <SelectItem value="scheduled">{t("hrg.ann.status.scheduled")}</SelectItem>
                    <SelectItem value="draft">{t("hrg.ann.status.draft")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {publishAs !== "active" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>{t("hrg.ann.publishDate")}</Label>
                    <DateInput value={startsAt} onChange={setStartsAt} placeholder={t("hrg.ann.startDatePlaceholder")} />
                  </div>
                  <div className="space-y-2">
                    <Label>{t("hrg.ann.publishTime")}</Label>
                    <TimeSelect value={startsTime} onChange={setStartsTime} />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("hrg.ann.expiryDateOptional")}</Label>
                  <DateInput value={expiresAt} onChange={setExpiresAt} placeholder={t("hrg.ann.noExpiry")} />
                </div>
                <div className="space-y-2">
                  <Label>{t("hrg.ann.recurrence")}</Label>
                  <Select value={recurrence} onValueChange={setRecurrence}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {REPETICIONES_ANUNCIO.map((r) => <SelectItem key={r.value} value={r.value}>{t(r.clave)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {(expiresAt || recurrence !== "none") && (
                <div className="grid grid-cols-2 gap-4">
                  {expiresAt && (
                    <div className="space-y-2">
                      <Label>{t("hrg.ann.expiryTime")}</Label>
                      <TimeSelect value={expiresTime} onChange={setExpiresTime} />
                    </div>
                  )}
                  {recurrence !== "none" && (
                    <div className={`space-y-2 ${!expiresAt ? "col-start-2" : ""}`}>
                      <Label>{t("hrg.ann.recurrenceEnd")}</Label>
                      <DateInput value={recurrenceEnd} onChange={setRecurrenceEnd} placeholder={t("hrg.ann.noEnd")} />
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
              <ChevronLeft className="h-4 w-4" /> {t("common.previous")}
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => setStep(step + 1)} disabled={!canNext} className="gap-1">
              {t("common.next")} <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} disabled={!title.trim() || create.isPending}>
              {create.isPending ? t("hrg.creating") : t("hrg.ann.create")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CreateAnnouncementModal;
