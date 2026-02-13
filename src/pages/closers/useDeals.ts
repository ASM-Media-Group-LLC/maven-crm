import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface Deal {
  id: string;
  prospect_handle: string;
  source: string;
  stage: string;
  assigned_to: string | null;
  created_by: string | null;
  company_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export const STAGES = [
  "Nuevo",
  "Contactado",
  "Llamada Agendada",
  "En Llamada",
  "No Show",
  "Cerrado",
  "Perdido",
] as const;

export const SOURCES = ["LeadGen", "Inbound", "Otro"] as const;

export const useDeals = () => {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: deals = [], isLoading } = useQuery({
    queryKey: ["deals"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("deals")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Deal[];
    },
  });

  const createDeal = useMutation({
    mutationFn: async (deal: {
      prospect_handle: string;
      source: string;
      stage: string;
      notes?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("No autenticado");

      const { error } = await supabase.from("deals").insert({
        prospect_handle: deal.prospect_handle,
        source: deal.source,
        stage: deal.stage,
        notes: deal.notes || null,
        created_by: user.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      toast({ title: "Deal creado", description: "El deal se creó exitosamente." });
    },
    onError: () => {
      toast({ title: "Error", description: "No se pudo crear el deal.", variant: "destructive" });
    },
  });

  const updateDealStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const { error } = await supabase
        .from("deals")
        .update({ stage })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
    },
  });

  const deleteDeal = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("deals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["deals"] });
      toast({ title: "Deal eliminado" });
    },
  });

  return { deals, isLoading, createDeal, updateDealStage, deleteDeal };
};
