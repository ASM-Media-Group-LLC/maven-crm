import { useState, useEffect } from "react";
import { ArrowRight } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useUpdateLeadQuality } from "./useLeadGen";
import { useToast } from "@/hooks/use-toast";
import type { LeadGenEntry } from "./useLeadGen";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";

const calidadColors: Record<string, string> = {
  "a+": "bg-primary text-primary-foreground",
  a: "bg-green-500 text-white",
  "b+": "bg-yellow-500 text-white",
  b: "bg-muted text-muted-foreground",
  c: "bg-destructive text-destructive-foreground",
};

// `value` es el dato; en pantalla va t(labelKey).
const calidadOptions: Array<{ value: string; labelKey: TranslationKey }> = [
  { value: "a+", labelKey: "leadgen.assign.optTop" },
  { value: "a", labelKey: "leadgen.assign.optHigh" },
  { value: "b+", labelKey: "leadgen.assign.optGood" },
  { value: "b", labelKey: "leadgen.assign.optStandard" },
  { value: "c", labelKey: "leadgen.assign.optLow" },
];

const puntuacionOptions: Array<{ value: string; labelKey: TranslationKey }> = [
  { value: "alto", labelKey: "leadgen.assign.scoreHigh" },
  { value: "medio", labelKey: "leadgen.assign.scoreMid" },
  { value: "bajo", labelKey: "leadgen.assign.scoreLow" },
];

const getTicketId = (entry: LeadGenEntry) =>
  entry.ticket_number || `#LG${entry.id.slice(-7).toUpperCase()}`;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: LeadGenEntry | null;
}

const AssignCalidadModal = ({ open, onOpenChange, lead }: Props) => {
  const { t } = useLanguage();
  const [calidad, setCalidad] = useState("");
  const [puntuacion, setPuntuacion] = useState("");
  const [comentario, setComentario] = useState("");
  const { mutate: updateQuality, isPending } = useUpdateLeadQuality();
  const { toast } = useToast();

  useEffect(() => {
    if (lead && open) {
      setCalidad(lead.quality.toLowerCase());
      setPuntuacion("");
      setComentario("");
    }
  }, [lead, open]);

  if (!lead) return null;

  const currentCat = lead.quality.toLowerCase();
  const isValid = calidad && (!comentario || comentario.length >= 3);

  const handleSave = () => {
    if (!isValid) return;
    updateQuality(
      { id: lead.id, quality: calidad },
      {
        onSuccess: () => {
          toast({ title: t("leadgen.assign.updated"), description: t("leadgen.assign.updatedDesc", { quality: calidad.toUpperCase() }) });
          onOpenChange(false);
        },
        onError: () => {
          toast({ title: t("common.error"), description: t("leadgen.assign.updateError"), variant: "destructive" });
        },
      }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader className="pr-8">
          <DialogTitle>{t("leadgen.assign.title", { ticket: getTicketId(lead) })}</DialogTitle>
          <DialogDescription>{t("leadgen.assign.description")}</DialogDescription>
        </DialogHeader>

        <Card className="p-4">
          <div className="flex items-center justify-center gap-4">
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">{t("leadgen.assign.current")}</span>
              <div className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold ${calidadColors[currentCat] ?? "bg-muted text-muted-foreground"}`}>
                {lead.quality.toUpperCase()}
              </div>
            </div>
            <ArrowRight className="h-5 w-5 text-muted-foreground mt-4" />
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-xs font-semibold text-muted-foreground">{t("leadgen.assign.new")}</span>
              <div className={`flex h-12 w-12 items-center justify-center rounded-full text-sm font-bold ${calidadColors[calidad] ?? "bg-muted text-muted-foreground"}`}>
                {calidad ? calidad.toUpperCase() : "—"}
              </div>
            </div>
          </div>
        </Card>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("leadgen.assign.modelQuality")}</Label>
            <Select value={calidad} onValueChange={setCalidad}>
              <SelectTrigger><SelectValue placeholder={t("leadgen.assign.selectQuality")} /></SelectTrigger>
              <SelectContent>
                {calidadOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{t(o.labelKey)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("leadgen.assign.workScore")}</Label>
            <Select value={puntuacion} onValueChange={setPuntuacion}>
              <SelectTrigger><SelectValue placeholder={t("leadgen.assign.selectScore")} /></SelectTrigger>
              <SelectContent>
                {puntuacionOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{t(o.labelKey)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{t("leadgen.assign.comment")}</Label>
            <Textarea
              placeholder={t("leadgen.assign.commentPlaceholder")}
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              {t("leadgen.assign.commentHint")}
            </p>
          </div>

          <Button className="w-full" disabled={!isValid || isPending} onClick={handleSave}>
            {isPending ? t("leadgen.saving") : t("leadgen.assign.save")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default AssignCalidadModal;
