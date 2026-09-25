import { ArrowRight, Lightbulb } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUserRole } from "@/hooks/useUserRole";
import { displayPhone } from "@/lib/country-utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { enqueueAvatarFetch } from "@/lib/avatarFetch";
import type { ScouterLead } from "@/hooks/useScouterLeads";
import { useLanguage } from "@/hooks/useLanguage";
import { textoConPieza } from "./textoConPieza";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: ScouterLead;
  onConverted?: () => void;
}

// El equipo de scouter NO contacta — su trabajo es descubrir. Cuando
// pasa un lead al pipeline de closers, el flow es idéntico al de LG:
// INSERT en closers_contacts (sin closer asignado) → trigger sync
// propaga a closer_creators → el supervisor del equipo Closers lo
// asigna después en /closers.
//
// Diferencia: source='scouter' (vs 'leadgen') para mantener trackeable
// de dónde vino el contacto. Los leads originales siguen viviendo en
// scouter_leads (no se "pasan", se hace el handoff y queda marcado
// con converted_at + converted_to_contact_id).

const ConvertScouterLeadModal = ({ open, onOpenChange, lead, onConverted }: Props) => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleCancel = () => {
    toast({ title: t("scouter.convert.canceled") });
    onOpenChange(false);
  };

  const convert = useMutation({
    mutationFn: async () => {
      // SERVER-SIDE: el RPC lee el phone REAL del lead (el cliente lo ve enmascarado) y crea
      // el contacto + marca el lead convertido en una transacción.
      const { error } = await supabase.rpc("convert_scouter_lead", { p_lead_id: lead.id } as never);
      if (error) throw error;

      // Avatar fetch async — populamos models.avatar_url si todavía no estaba.
      void enqueueAvatarFetch(lead.instagram_handle);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scouter-leads"] });
      queryClient.invalidateQueries({ queryKey: ["scouter-stats"] });
      queryClient.invalidateQueries({ queryKey: ["closer-creators"] });
      queryClient.invalidateQueries({ queryKey: ["closer-creators-list"] });
      queryClient.invalidateQueries({ queryKey: ["closer-creators-counts"] });
      queryClient.invalidateQueries({ queryKey: ["closers-contacts"] });
      toast({
        title: t("scouter.convert.done"),
        description: t("scouter.convert.doneHint"),
      });
      onConverted?.();
      onOpenChange(false);
    },
    onError: (e) => {
      toast({
        title: t("scouter.convert.error"),
        description: (e as Error).message,
        variant: "destructive",
      });
    },
  });

  const { isAdmin } = useUserRole();
  const items = [
    { label: "Handle", value: `@${lead.instagram_handle}` },
    { label: t("common.name"), value: lead.name || "—" },
    { label: t("scouter.lead.platform"), value: lead.platform || "instagram" },
    { label: t("scouter.countryCity"), value: [lead.country, lead.city].filter(Boolean).join(" · ") || "—" },
    { label: t("common.phone"), value: displayPhone(lead.phone, isAdmin) || "—" },
    { label: "OnlyFans", value: lead.onlyfans_url ? t("scouter.convert.included") : "—" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5 text-primary" />
            <DialogTitle>{t("scouter.lead.moveToClosers")}</DialogTitle>
          </div>
          <DialogDescription>
            {textoConPieza(t("scouter.convert.description"), "{code}", <code>source='scouter'</code>)}
          </DialogDescription>
        </DialogHeader>

        <div className="border rounded-lg p-4 space-y-3">
          <p className="text-sm font-semibold">{t("scouter.convert.dataTransferred")}</p>
          <ul className="space-y-1.5">
            {items.map((item) => (
              <li key={item.label} className="flex items-start gap-2 text-sm">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                <span>
                  <span className="font-medium">{item.label}:</span>{" "}
                  <span className="text-muted-foreground">{item.value}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="flex items-start gap-2.5 rounded-lg bg-primary/10 p-3">
          <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            {t("scouter.convert.hint")}
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCancel} disabled={convert.isPending}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => convert.mutate()} disabled={convert.isPending}>
            {convert.isPending ? t("scouter.convert.moving") : t("common.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConvertScouterLeadModal;
