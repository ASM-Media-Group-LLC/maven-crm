import { ArrowRight, Lightbulb } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { ScouterLead } from "@/hooks/useScouterLeads";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lead: ScouterLead;
  onConverted?: () => void;
}

const ConvertScouterLeadModal = ({ open, onOpenChange, lead, onConverted }: Props) => {
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

      const ticketId = `#SC${lead.id.slice(-7).toUpperCase()}`;
      const { data: contact, error: insertError } = await supabase
        .from("closers_contacts")
        .insert({
          name: lead.name || lead.instagram_handle,
          handle: lead.instagram_handle,
          platform: lead.platform || "instagram",
          city: lead.city,
          phone: lead.phone,
          onlyfans_url: lead.onlyfans_url,
          profile_picture_url: lead.photo_data_url,
          source: "scouter",
          ticket_number: ticketId,
          created_by: user.id,
        })
        .select("id")
        .single();
      if (insertError) throw insertError;

      const { error: updateError } = await supabase
        .from("scouter_leads")
        .update({
          converted_at: new Date().toISOString(),
          converted_to_contact_id: contact!.id,
          status: "contacting",
        } as never)
        .eq("id", lead.id);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["scouter-leads"] });
      queryClient.invalidateQueries({ queryKey: ["scouter-stats"] });
      queryClient.invalidateQueries({ queryKey: ["closer-creators"] });
      queryClient.invalidateQueries({ queryKey: ["closer-creators-list"] });
      queryClient.invalidateQueries({ queryKey: ["closer-creators-counts"] });
      queryClient.invalidateQueries({ queryKey: ["closers-contacts"] });
      toast({ title: "Lead convertido", description: "El contacto fue creado y agregado al pipeline de Closers." });
      onConverted?.();
      onOpenChange(false);
    },
    onError: (e) => {
      toast({
        title: "Error al convertir",
        description: (e as Error).message,
        variant: "destructive",
      });
    },
  });

  const items = [
    { label: "Handle", value: `@${lead.instagram_handle}` },
    { label: "Nombre", value: lead.name || "—" },
    { label: "Plataforma", value: lead.platform || "instagram" },
    { label: "País / Ciudad", value: [lead.country, lead.city].filter(Boolean).join(" · ") || "—" },
    { label: "Teléfono", value: lead.phone || "—" },
    { label: "OnlyFans", value: lead.onlyfans_url ? "✓ Incluido" : "—" },
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
            Este lead será transferido al equipo de cerradores como un contacto nuevo. Scouter encontró el perfil — los closers se encargan del contacto y conversión.
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
            El lead queda marcado como convertido en Scouter. Si tiene teléfono, también aparece en la pipeline de creators del closer.
          </p>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCancel} disabled={convert.isPending}>
            Cancelar
          </Button>
          <Button onClick={() => convert.mutate()} disabled={convert.isPending}>
            {convert.isPending ? "Convirtiendo..." : "Confirmar Conversión"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ConvertScouterLeadModal;
