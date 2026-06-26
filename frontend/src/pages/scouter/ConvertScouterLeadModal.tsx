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
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const handleCancel = () => {
    toast({ title: "Conversión cancelada" });
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
        title: "Pasado al pipeline de Closers",
        description: "El supervisor del equipo lo va a asignar a un closer.",
      });
      onConverted?.();
      onOpenChange(false);
    },
    onError: (e) => {
      toast({
        title: "Error al pasar a Closers",
        description: (e as Error).message,
        variant: "destructive",
      });
    },
  });

  const { isAdmin } = useUserRole();
  const items = [
    { label: "Handle", value: `@${lead.instagram_handle}` },
    { label: "Nombre", value: lead.name || "—" },
    { label: "Plataforma", value: lead.platform || "instagram" },
    { label: "País / Ciudad", value: [lead.country, lead.city].filter(Boolean).join(" · ") || "—" },
    { label: "Teléfono", value: displayPhone(lead.phone, isAdmin) || "—" },
    { label: "OnlyFans", value: lead.onlyfans_url ? "✓ Incluido" : "—" },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5 text-primary" />
            <DialogTitle>Pasar a Pipeline Closers</DialogTitle>
          </div>
          <DialogDescription>
            El scouter descubre — los closers contactan. Este lead se pasa al pool del equipo Closers (separado de los leads del equipo LG por la columna <code>source='scouter'</code>). El supervisor lo asigna a un closer específico desde /closers.
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

        <div className="flex items-start gap-2.5 rounded-lg bg-primary/10 p-3">
          <Lightbulb className="h-4 w-4 text-primary shrink-0 mt-0.5" />
          <p className="text-xs text-muted-foreground">
            El lead queda marcado como "convertido" en Scouter. Aparece en /closers como contacto sin asignar — el supervisor lo asignará a un closer concreto desde ahí.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCancel} disabled={convert.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => convert.mutate()} disabled={convert.isPending}>
            {convert.isPending ? "Pasando…" : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConvertScouterLeadModal;
