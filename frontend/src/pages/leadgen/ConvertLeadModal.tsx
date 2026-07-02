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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: LeadGenEntry;
  onConverted: () => void;
}

const ConvertLeadModal = ({ open, onOpenChange, lead, onConverted }: Props) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleCancel = () => {
    toast({ title: "Conversión cancelada" });
    onOpenChange(false);
  };

  const convert = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

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
      toast({ title: "Lead convertido", description: "El contacto fue creado y agregado al pipeline de Closers." });
      onConverted();
    },
    onError: () => {
      toast({ title: "Error al convertir", variant: "destructive" });
    },
  });

  // Regla nueva: ningún contacto entra al sistema sin handle de IG.
  // Si el lead está sin handle, bloqueamos la conversión.
  const missingHandle = !lead.model_handle || !lead.model_handle.trim();

  const { isAdmin } = useUserRole();
  const items = [
    { label: "Handle", value: lead.model_handle ? `@${lead.model_handle}` : "—" },
    { label: "Plataforma", value: lead.platform },
    { label: "Categoría", value: lead.quality || "—" },
    { label: "Cuenta origen", value: lead.company || "—" },
    { label: "Teléfono", value: displayPhone(lead.phone_raw, isAdmin) || "—" },
    { label: "Enlace", value: lead.source_link ? "✓ Incluido" : "—" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5 text-primary" />
            <DialogTitle>Convertir Lead a Pipeline Closers</DialogTitle>
          </div>
          <DialogDescription>
            Este lead será transferido al pipeline de Closers como una creator nueva en etapa "Asignada".
          </DialogDescription>
        </DialogHeader>

        <div className="border rounded-lg p-4 space-y-3">
          <p className="text-sm font-semibold">Datos que se transferirán</p>
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
              <span className="font-semibold">Falta el handle de Instagram.</span> Ningún
              contacto puede entrar al pipeline sin handle. Editá el lead para agregarlo y volvé a intentar.
            </p>
          </div>
        ) : (
          <div className="flex items-start gap-2.5 rounded-lg bg-primary/10 p-3">
            <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground">
              El lead quedará marcado como "contactado" y la creator aparecerá en el módulo de Closers con referencia al lead original.
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCancel} disabled={convert.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => convert.mutate()}
            disabled={convert.isPending || missingHandle}
          >
            {convert.isPending ? "Convirtiendo..." : "Confirmar Conversión"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConvertLeadModal;
