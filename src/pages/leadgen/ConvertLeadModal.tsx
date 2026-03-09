import { useState } from "react";
import { ArrowRight, Lightbulb } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { LeadGenEntry } from "./useLeadGen";

const getTicketId = (entry: LeadGenEntry) =>
  entry.ticket_number || `#LG${entry.id.slice(-7).toUpperCase()}`;

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

  const ticketId = getTicketId(lead);

  const convert = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      const { error: insertError } = await supabase.from("closers_contacts").insert({
        name: lead.model_handle,
        handle: lead.model_handle,
        platform: lead.platform,
        country_code: lead.country_code,
        phone: lead.phone_raw,
        company: lead.company,
        ticket_number: ticketId,
        created_by: user.id,
      });
      if (insertError) throw insertError;

      const { error: updateError } = await supabase
        .from("leadgen_entries")
        .update({ status: "contactado" } as any)
        .eq("id", lead.id);
      if (updateError) throw updateError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leadgen-entries"] });
      queryClient.invalidateQueries({ queryKey: ["closers-contacts"] });
      toast({ title: "Lead convertido", description: "El contacto fue creado exitosamente." });
      onConverted();
    },
    onError: () => {
      toast({ title: "Error al convertir", variant: "destructive" });
    },
  });

  const items = [
    { label: "Handle", value: `@${lead.model_handle}` },
    { label: "Plataforma", value: lead.platform },
    { label: "País", value: lead.country_code || "—" },
    { label: "Compañía", value: lead.company || "—" },
    { label: "Ticket", value: ticketId },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5 text-primary" />
            <DialogTitle>Convertir Lead a Contacto</DialogTitle>
          </div>
          <DialogDescription>
            Este lead será transferido al módulo de Closers como un contacto nuevo.
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
            El lead quedará marcado como "contactado" y el contacto será asignado al módulo de Closers.
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

export default ConvertLeadModal;
