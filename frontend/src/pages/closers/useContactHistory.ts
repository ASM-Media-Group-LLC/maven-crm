import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export interface ContactRecord {
  id: string;
  creator_id: string;
  contact_date: string;
  channel: string;
  result: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
}

export const useContactHistory = (creatorId: string | null) => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { toast } = useToast();

  const { data: history = [], isLoading } = useQuery({
    queryKey: ["closer-contact-history", creatorId],
    queryFn: async () => {
      if (!creatorId) return [];
      const { data, error } = await supabase
        .from("closer_contact_history")
        .select("*")
        .eq("creator_id", creatorId)
        .order("contact_date", { ascending: true });
      if (error) throw error;
      return data as ContactRecord[];
    },
    enabled: !!creatorId,
  });

  const addContact = useMutation({
    mutationFn: async (record: { creator_id: string; channel: string; result?: string; notes?: string; contact_date?: string; promoteContactId?: string }) => {
      if (!user) throw new Error("No autenticado");
      const { promoteContactId, ...rest } = record;
      let targetId = record.creator_id;
      // Filas de los tabs Agencias/Ex-creadores: son CONTACTOS del directorio, no
      // leads. closer_contact_history.creator_id tiene FK a closer_creators, así
      // que registrar un seguimiento sobre un closers_contacts.id explota
      // (violación de FK — el error que reportó Miguel). Antes de anotar, promovemos
      // el contacto a lead con el MISMO RPC que "Tomar": crea/asigna el lead
      // (heredando tipo agencia/ex_creadora), lo deja tuyo, y devuelve su id.
      if (promoteContactId) {
        const { data: newLeadId, error: promoErr } = await (supabase as any).rpc("assign_closer_to_contact", {
          p_contact_id: promoteContactId,
          p_closer_id: user.id,
        });
        if (promoErr) throw promoErr;
        if (!newLeadId) throw new Error("No se pudo tomar la agencia para registrar el seguimiento.");
        targetId = newLeadId as string;
      }
      const { error } = await supabase.from("closer_contact_history").insert({
        ...rest,
        creator_id: targetId,
        created_by: user.id,
        contact_date: record.contact_date || new Date().toISOString(),
      });
      if (error) {
        if (error.message.includes("Maximum of 6")) {
          throw new Error("Máximo 6 contactos por creator");
        }
        throw error;
      }
      // Devolvemos el id del LEAD (ya promovido si era un contacto del directorio):
      // el formulario lo usa para adjuntar las capturas al lead correcto.
      return targetId;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["closer-contact-history", creatorId] });
      // Refrescar el listado del pipeline, los contadores y las alertas: al
      // registrar un contacto cambia el contact_count / last_contact_date, y
      // con eso el badge "Vencido". La key anterior (["closer-creators"]) no
      // matcheaba NINGUNA query → la fila quedaba stale y el vencido no se iba.
      queryClient.invalidateQueries({ queryKey: ["closer-creators-list"] });
      queryClient.invalidateQueries({ queryKey: ["closer-creators-counts"] });
      queryClient.invalidateQueries({ queryKey: ["closer-alert-counts"] });
      // Si el seguimiento promovió un contacto del directorio a lead, hay que
      // refrescar también la vista de contactos para que salga de la base.
      queryClient.invalidateQueries({ queryKey: ["closers-contacts"] });
      toast({ title: "Contacto registrado" });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  return { history, isLoading, addContact, count: history.length, maxReached: history.length >= 6 };
};
