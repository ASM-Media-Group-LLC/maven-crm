import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { FileText } from "lucide-react";
import ContactHistoryPanel from "./ContactHistoryPanel";
import ActivityTimeline from "./ActivityTimeline";
import EvidenceViewer from "@/components/leadgen/EvidenceViewer";
import { WaChatButton, toE164 } from "@/components/WaChatButton";
import { TgChatButton } from "@/components/TgChatButton";
import { useLanguage } from "@/hooks/useLanguage";
import { stageLabel, platformLabel } from "../hooks/useCloserLeads";

interface Creator {
  id: string;
  instagram_handle: string;
  category: string | null;
  passed_date: string | null;
  source_account: string | null;
  phone: string | null;
  notes: string | null;
  onlyfans_url: string | null;
  estimated_monetization: number | null;
  agency_commission: number | null;
  stage: string;
  confirmed_date: string | null;
  completed_date: string | null;
  rejection_reason: string | null;
  monthly_monetization: number | null;
  main_platform: string | null;
  extras: number | null;
}

interface Props {
  creator: Creator | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const Field = ({ label, value }: { label: string; value: React.ReactNode }) => (
  <div>
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-sm font-medium">{value || <span className="text-muted-foreground">—</span>}</p>
  </div>
);

const ViewCreatorModal = ({ creator, open, onOpenChange }: Props) => {
  const { t } = useLanguage();
  // Los hooks van ANTES del `return null` de abajo: el modal se monta siempre
  // (ClosersContent lo deja puesto con creator=null) y si las useQuery quedaban
  // después del early return, al abrir una ficha React veía más hooks que en el
  // render anterior y tiraba la pantalla.
  const leadgenEntryId = ((creator as any)?.leadgen_entry_id ?? null) as string | null;
  // source_contact_id apunta al closers_contacts que generó este
  // closer_creator. Es donde vive la evidencia que el LG adjuntó cuando
  // pasó el número. Si la fila no tiene este campo (datos viejos),
  // el viewer simplemente muestra estado vacío.
  const sourceContactId = ((creator as any)?.source_contact_id ?? null) as string | null;

  const { data: leadOrigin } = useQuery({
    queryKey: ["leadgen-origin", leadgenEntryId],
    queryFn: async () => {
      if (!leadgenEntryId) return null;
      const { data, error } = await supabase
        .from("leadgen_entries")
        .select("*")
        .eq("id", leadgenEntryId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!leadgenEntryId && open,
  });

  const { data: agentProfile } = useQuery({
    queryKey: ["lead-agent-profile", leadOrigin?.lg_user_id],
    queryFn: async () => {
      if (!leadOrigin?.lg_user_id) return null;
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", leadOrigin.lg_user_id)
        .maybeSingle();
      return data;
    },
    enabled: !!leadOrigin?.lg_user_id && open,
  });

  if (!creator) return null;

  const revenue = (Number(creator.estimated_monetization || 0) * Number(creator.agency_commission || 0) / 100) + Number(creator.extras || 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {creator.instagram_handle}
            <Badge variant="secondary">{stageLabel(t, creator.stage)}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Instagram" value={creator.instagram_handle} />
          <Field label={t("common.category")} value={creator.category} />
          <Field label={t("closers.passedDate")} value={creator.passed_date} />
          <Field label={t("closers.sourceAccount")} value={creator.source_account} />
          <Field label="WhatsApp" value={
            <div className="flex items-center gap-1">
              <WaChatButton phone={toE164({ phone: creator.phone })} closerCreatorId={creator.id} />
              <TgChatButton phone={toE164({ phone: creator.phone })} name={creator.instagram_handle} />
            </div>
          } />
          <Field label="OnlyFans" value={creator.onlyfans_url} />
          <Field label={t("closers.mainPlatform")} value={creator.main_platform ? platformLabel(t, creator.main_platform) : null} />
          <Field label={t("closers.estimatedMonetization")} value={`$${Number(creator.estimated_monetization || 0).toLocaleString()}`} />
          <Field label={t("closers.agencyCommission")} value={`${Number(creator.agency_commission || 0)}%`} />
          <Field label="Extras" value={`$${Number(creator.extras || 0).toLocaleString()}`} />
          <Field label="Revenue" value={`$${revenue.toLocaleString()}`} />
          <Field label={t("closers.monthlyMonetization")} value={creator.monthly_monetization ? `$${Number(creator.monthly_monetization).toLocaleString()}` : null} />
          {creator.rejection_reason && <Field label={t("closers.rejectionReason")} value={creator.rejection_reason} />}
        </div>

        {creator.notes && (
          <div>
            <p className="text-xs text-muted-foreground">{t("closers.notes")}</p>
            <p className="text-sm">{creator.notes}</p>
          </div>
        )}

        {leadOrigin && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">{t("closers.view.leadOrigin")}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 rounded-lg border p-3">
                <Field label={t("closers.view.contactDate")} value={leadOrigin.entry_date} />
                <Field label={t("closers.agent")} value={agentProfile?.full_name || "—"} />
                <Field label={t("closers.platform")} value={leadOrigin.platform} />
                <Field label={t("closers.view.quality")} value={leadOrigin.quality} />
                <Field label={t("closers.agency")} value={leadOrigin.company} />
                {leadOrigin.source_link && (
                  <Field
                    label={t("closers.view.originalUrl")}
                    value={
                      <a href={leadOrigin.source_link} target="_blank" rel="noopener noreferrer" className="text-primary underline text-xs truncate block">
                        {leadOrigin.source_link}
                      </a>
                    }
                  />
                )}
              </div>
            </div>
          </>
        )}

        <Separator />

        {/* Evidencia del primer contacto (subida por el LG al crear el
            closers_contacts). Si este closer_creator no tiene
            source_contact_id linkeado, el viewer muestra estado vacío. */}
        <EvidenceViewer
          entityType="contact"
          entityId={sourceContactId}
          uploaderNameHint={agentProfile?.full_name ?? undefined}
        />

        <Separator />
        <div>
          <p className="text-sm font-semibold mb-3">{t("closers.view.timeline")}</p>
          <ActivityTimeline
            creatorId={creator.id}
            passedDate={creator.passed_date}
            confirmedDate={creator.confirmed_date}
            completedDate={creator.completed_date}
            stage={creator.stage}
          />
        </div>

        <Separator />
        <ContactHistoryPanel creatorId={creator.id} />
      </DialogContent>
    </Dialog>
  );
};

export default ViewCreatorModal;
