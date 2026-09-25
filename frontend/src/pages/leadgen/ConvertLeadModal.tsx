import { ArrowRight, Lightbulb, AlertTriangle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useUserRole } from "@/hooks/useUserRole";
import { displayPhone } from "@/lib/country-utils";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { LeadGenEntry } from "./useLeadGen";
import { useLanguage } from "@/hooks/useLanguage";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: LeadGenEntry;
  onConverted: () => void;
}

const ConvertLeadModal = ({ open, onOpenChange, lead, onConverted }: Props) => {
  const { t } = useLanguage();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleCancel = () => {
    toast({ title: t("leadgen.convert.canceled") });
    onOpenChange(false);
  };

  const convert = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error(t("leadgen.notSignedIn"));

      // Insert into closers_contacts — the trigger sync_closers_contact_to_creators
      // will automatically create the closer_creators row if phone is present
      const ticketId = lead.ticket_number || `#LG${lead.id.slice(-7).toUpperCase()}`;
      // Heredamos la company_id del lead (FK ya poblada en backfill).
      // Si por alguna razón el lead viene sin FK pero con texto, hacemos
      // un name-match fallback contra scouter_companies.
      let companyId: string | null = (lead as any).company_id ?? null;
      if (!companyId && lead.company) {
        const { data: scRow } = await supabase
          .from("scouter_companies")
          .select("id")
          .ilike("name", lead.company)
          .maybeSingle();
        companyId = (scRow as any)?.id ?? null;
      }
      await supabase.from("closers_contacts").insert({
        name: lead.model_handle,
        handle: lead.model_handle,
        platform: lead.platform,
        country_code: lead.country_code,
        phone: lead.phone_raw,
        company: lead.company,
        company_id: companyId,
        ticket_number: ticketId,
        created_by: user.id,
      } as any);

      // Mark lead as "contactado"
      const { error: updateError } = await supabase
        .from("leadgen_entries")
        .update({ status: "contactado" } as any)
        .eq("id", lead.id);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leadgen-entries"] });
      queryClient.invalidateQueries({ queryKey: ["leadgen-entries-range"] });
      queryClient.invalidateQueries({ queryKey: ["closer-creators"] });
      queryClient.invalidateQueries({ queryKey: ["closer-creators-list"] });
      queryClient.invalidateQueries({ queryKey: ["closer-creators-counts"] });
      queryClient.invalidateQueries({ queryKey: ["closers-contacts"] });
      toast({ title: t("leadgen.convert.done"), description: t("leadgen.convert.doneDesc") });
      onConverted();
    },
    onError: () => {
      toast({ title: t("leadgen.convert.error"), variant: "destructive" });
    },
  });

  // Regla nueva: ningún contacto entra al sistema sin handle de IG.
  // Si el lead está sin handle, bloqueamos la conversión.
  const missingHandle = !lead.model_handle || !lead.model_handle.trim();

  const { isAdmin } = useUserRole();
  const items = [
    { label: "Handle", value: lead.model_handle ? `@${lead.model_handle}` : "—" },
    { label: t("leadgen.convert.platform"), value: lead.platform },
    { label: t("common.category"), value: lead.quality || "—" },
    { label: t("leadgen.convert.sourceAccount"), value: lead.company || "—" },
    { label: t("common.phone"), value: displayPhone(lead.phone_raw, isAdmin) || "—" },
    { label: t("leadgen.convert.link"), value: lead.source_link ? t("leadgen.convert.included") : "—" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5 text-primary" />
            <DialogTitle>{t("leadgen.convert.title")}</DialogTitle>
          </div>
          <DialogDescription>
            {t("leadgen.convert.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="border rounded-lg p-4 space-y-3">
          <p className="text-sm font-semibold">{t("leadgen.convert.dataToTransfer")}</p>
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

        {missingHandle ? (
          <div className="flex items-start gap-2.5 rounded-lg bg-warning/10 p-3">
            <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
            <p className="text-xs text-warning">
              <span className="font-semibold">{t("leadgen.convert.missingHandleTitle")}</span>{" "}
              {t("leadgen.convert.missingHandleBody")}
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2.5 rounded-lg bg-primary/10 p-3">
            <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              {t("leadgen.convert.hint")}
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCancel} disabled={convert.isPending}>
            {t("common.cancel")}
          </Button>
          <Button
            onClick={() => convert.mutate()}
            disabled={convert.isPending || missingHandle}
          >
            {convert.isPending ? t("leadgen.convert.converting") : t("leadgen.convert.confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConvertLeadModal;
