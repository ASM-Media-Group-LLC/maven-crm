import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUserRole } from "@/hooks/useUserRole";
import { useToast } from "@/hooks/use-toast";

export interface CloserCreator {
  id: string;
  instagram_handle: string;
  category: string | null;
  passed_date: string | null;
  source_account: string | null;
  phone: string | null;
  notes: string | null;
  onlyfans_url: string | null;
  estimated_monetization: number;
  agency_commission: number;
  stage: string;
  assigned_to: string | null;
  rejection_reason: string | null;
  confirmed_date: string | null;
  completed_date: string | null;
  last_contact_date: string | null;
  monthly_monetization: number | null;
  created_by: string | null;
  company_id: string | null;
  created_at: string;
  updated_at: string;
}

export const STAGES = [
  "Asignada",
  "Confirmada",
  "Completada",
  "No interesada",
] as const;

export const CHANNELS = ["Instagram", "WhatsApp", "Telegram"] as const;
export const RESULTS = ["Contestó", "No contestó", "Interesada", "No interesada", "Pendiente"] as const;

export type NewCreatorData = {
  instagram_handle: string;
  category?: string;
  passed_date?: string;
  source_account?: string;
  phone?: string;
  notes?: string;
  onlyfans_url?: string;
  estimated_monetization?: number;
  agency_commission?: number;
  assigned_to?: string;
};

export const useCloserCreators = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { isAdmin, isManager, role } = useUserRole();
  const { toast } = useToast();

  const { data: creators = [], isLoading } = useQuery({
    queryKey: ["closer-creators", user?.id, role],
    queryFn: async () => {
      let query = supabase
        .from("closer_creators")
        .select("*")
        .order("created_at", { ascending: false });

      // Closers only see their assigned creators (RLS handles it but we add client filter for clarity)
      if (!isAdmin && !isManager && user?.id) {
        query = query.eq("assigned_to", user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as CloserCreator[];
    },
    enabled: !!user?.id && !!role,
  });

  const createCreator = useMutation({
    mutationFn: async (creator: NewCreatorData) => {
      if (!user) throw new Error("No autenticado");
      const { error } = await supabase.from("closer_creators").insert({
        ...creator,
        created_by: user.id,
        estimated_monetization: creator.estimated_monetization ?? 0,
        agency_commission: creator.agency_commission ?? 0,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["closer-creators"] });
      toast({ title: "Creator agregada", description: "La creator se registró exitosamente." });
    },
    onError: (e: Error) => {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    },
  });

  // ── Patrón optimista (espejo de useCloserLeads) ─────────────────────────
  // La tabla refleja el cambio al instante (setQueriesData sobre el cache),
  // y si el UPDATE falla se restaura el snapshot y se avisa con toast — antes
  // el fallo era SILENCIOSO: el closer creía que guardó y no.
  const patchCreatorsCache = (id: string, updates: Partial<CloserCreator>) => {
    queryClient.setQueriesData<CloserCreator[]>(
      { queryKey: ["closer-creators"] },
      (old) => old?.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    );
  };

  const snapshotCreatorsCache = async () => {
    await queryClient.cancelQueries({ queryKey: ["closer-creators"] });
    return { previous: queryClient.getQueriesData<CloserCreator[]>({ queryKey: ["closer-creators"] }) };
  };

  const rollbackCreatorsCache = (context?: { previous: [readonly unknown[], CloserCreator[] | undefined][] }) => {
    context?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data));
  };

  const updateCreator = useMutation({
    mutationFn: async ({ id, ...fields }: { id: string } & Partial<CloserCreator>) => {
      const { error } = await supabase.from("closer_creators").update(fields).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, ...fields }) => {
      const context = await snapshotCreatorsCache();
      patchCreatorsCache(id, fields);
      return context;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["closer-creators"] });
      toast({ title: "Creator actualizada" });
    },
    onError: (e: Error, _vars, context) => {
      rollbackCreatorsCache(context);
      toast({ title: "Error", description: e.message || "No se pudo actualizar.", variant: "destructive" });
    },
  });

  const updateStage = useMutation({
    mutationFn: async ({ id, stage }: { id: string; stage: string }) => {
      const updates: Record<string, unknown> = { stage };
      // BUG-FIX 2026-05-16: setear passed_date al pasar a "Asignada"
      // — sin esto el reporte contaba 0 asignadas (idéntico al fix en
      // useCloserLeads).
      if (stage === "Asignada") updates.passed_date = new Date().toISOString().slice(0, 10);
      if (stage === "Confirmada") updates.confirmed_date = new Date().toISOString();
      if (stage === "Completada") updates.completed_date = new Date().toISOString();
      // No interesada también es transición — espejo del fix en
      // useCloserLeads. Migration 20260520010000 agrega la columna.
      if (stage === "No interesada") updates.no_interesada_date = new Date().toISOString();
      const { error } = await supabase.from("closer_creators").update(updates).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, stage }) => {
      const context = await snapshotCreatorsCache();
      patchCreatorsCache(id, { stage });
      return context;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["closer-creators"] });
    },
    onError: (e: Error, _vars, context) => {
      rollbackCreatorsCache(context);
      toast({ title: "Error", description: e.message || "No se pudo cambiar la etapa.", variant: "destructive" });
    },
  });

  const deleteCreator = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("closer_creators").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["closer-creators"] });
      toast({ title: "Creator eliminada" });
    },
  });

  const assignCreator = useMutation({
    mutationFn: async ({ id, assigned_to }: { id: string; assigned_to: string }) => {
      const { error } = await supabase.from("closer_creators").update({ assigned_to }).eq("id", id);
      if (error) throw error;
    },
    onMutate: async ({ id, assigned_to }) => {
      const context = await snapshotCreatorsCache();
      patchCreatorsCache(id, { assigned_to });
      return context;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["closer-creators"] });
      toast({ title: "Creator asignada" });
    },
    onError: (e: Error, _vars, context) => {
      rollbackCreatorsCache(context);
      toast({ title: "Error", description: e.message || "No se pudo asignar.", variant: "destructive" });
    },
  });

  return {
    creators,
    isLoading,
    createCreator,
    updateCreator,
    updateStage,
    deleteCreator,
    assignCreator,
    isAdmin,
    isManager,
  };
};
