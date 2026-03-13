import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { CloserCreator } from "../useCloserCreators";
import ContactHistoryPanel from "./ContactHistoryPanel";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { FileText } from "lucide-react";

interface Props {
  creator: CloserCreator | null;
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
  if (!creator) return null;

  const leadgenEntryId = (creator as any).leadgen_entry_id as string | null;

  // Fetch original lead data if linked
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

  // Fetch agent name for the lead
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

  const revenue = Number(creator.estimated_monetization || 0) * Number(creator.agency_commission || 0) / 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {creator.instagram_handle}
            <Badge variant="secondary">{creator.stage}</Badge>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Instagram" value={creator.instagram_handle} />
          <Field label="Categoría" value={creator.category} />
          <Field label="Fecha de paso" value={creator.passed_date} />
          <Field label="Cuenta origen" value={creator.source_account} />
          <Field label="Teléfono" value={creator.phone} />
          <Field label="OnlyFans" value={creator.onlyfans_url} />
          <Field label="Monetización estimada" value={`$${Number(creator.estimated_monetization || 0).toLocaleString()}`} />
          <Field label="Comisión agencia" value={`${creator.agency_commission}%`} />
          <Field label="Revenue estimado" value={`$${revenue.toLocaleString()}`} />
          <Field label="Monetización mensual" value={creator.monthly_monetization ? `$${Number(creator.monthly_monetization).toLocaleString()}` : null} />
          {creator.rejection_reason && <Field label="Motivo rechazo" value={creator.rejection_reason} />}
        </div>

        {creator.notes && (
          <div>
            <p className="text-xs text-muted-foreground">Notas</p>
            <p className="text-sm">{creator.notes}</p>
          </div>
        )}

        {/* Lead origin traceability */}
        {leadOrigin && (
          <>
            <Separator />
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">Origen del Lead</p>
              </div>
              <div className="grid grid-cols-2 gap-4 rounded-lg border p-3">
                <Field label="Fecha de contacto" value={leadOrigin.entry_date} />
                <Field label="Agente" value={agentProfile?.full_name || "—"} />
                <Field label="Plataforma" value={leadOrigin.platform} />
                <Field label="Calidad" value={leadOrigin.quality} />
                <Field label="Agencia" value={leadOrigin.company} />
                {leadOrigin.source_link && (
                  <Field
                    label="URL original"
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
        <ContactHistoryPanel creatorId={creator.id} />
      </DialogContent>
    </Dialog>
  );
};

export default ViewCreatorModal;
