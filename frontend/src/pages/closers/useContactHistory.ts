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
    mutationFn: async (record: { creator_id: string; channel: string; result?: string; notes?: string; contact_date?: string }) => {
      if (!user) throw new Error("No autenticado");
      const { error } = await supabase.from("closer_contact_history").insert({
        ...record,
        created_by: user.id,
        contact_date: record.contact_date || new Date().toISOString(),
      });
      if (error) {
        if (error.message.includes("Maximum of 6")) {
          throw new Error("Máximo 6 contactos por creator");
        }
        throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["closer-contact-history", creatorId] });
      queryClient.invalidateQueries({ queryKey: ["closer-creators"] });
      toast({ title: "Contacto registrado" });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  return { history, isLoading, addContact, count: history.length, maxReached: history.length >= 6 };
};
