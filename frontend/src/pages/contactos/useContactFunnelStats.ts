import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Backbone del dashboard de Contactos. Una sola llamada al RPC get_contact_funnel_stats
// (SECURITY DEFINER, agregados server-side → sin cap de 1000) que devuelve TODO el embudo:
// pipeline vivo (sin el import muerto de Kash), reparto por lifecycle, conversión, churn.
// p_from/p_to acotan closers_contacts.created_at (el calendario global del header); churn y
// activas_hoy son estado ACTUAL (no se filtran por fecha). Misma clasificación lifecycle que
// get_contact_statuses (los colores de fila) → una sola fuente de la verdad.
export interface ContactFunnelStats {
  total: number;          // todo closers_contacts en rango
  importMuerto: number;   // source='import_kash_sheet' (no trabajable)
  pipelineVivo: number;   // total - importMuerto
  sinTocar: number;       // lifecycle 'none' dentro del pipeline vivo
  enProceso: number;      // lifecycle 'in_progress'
  creadoras: number;      // lifecycle 'creator_active' (llegó a creadora)
  exCreadoras: number;    // lifecycle 'ex_creator'
  activasHoy: number;     // creators.status='active' (roster actual)
  churnLeaving: number;   // creators.status='leaving'
  churnTerminated: number;// creators.status='terminated'
  bySource: Array<{ source: string; total: number; in_progress: number; creator_active: number; ex_creator: number }>;
}

const EMPTY: ContactFunnelStats = {
  total: 0, importMuerto: 0, pipelineVivo: 0, sinTocar: 0, enProceso: 0,
  creadoras: 0, exCreadoras: 0, activasHoy: 0, churnLeaving: 0, churnTerminated: 0, bySource: [],
};

export function useContactFunnelStats(dateFrom?: string, dateTo?: string) {
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["contact-funnel-stats", dateFrom || null, dateTo || null],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ContactFunnelStats> => {
      const { data: rpc, error } = await (supabase as any).rpc("get_contact_funnel_stats", {
        p_from: dateFrom || null,
        p_to: dateTo || null,
      });
      if (error) {
        if (error.code === "42501") return EMPTY; // sin permiso → vacío
        throw error;
      }
      const r = (rpc ?? {}) as any;
      const lc = (r.lifecycle ?? {}) as Record<string, number>;
      return {
        total: r.total ?? 0,
        importMuerto: r.import_muerto ?? 0,
        pipelineVivo: r.pipeline_vivo ?? 0,
        sinTocar: lc.none ?? 0,
        enProceso: lc.in_progress ?? 0,
        creadoras: lc.creator_active ?? 0,
        exCreadoras: lc.ex_creator ?? 0,
        activasHoy: r.activas_hoy ?? 0,
        churnLeaving: r.churn?.leaving ?? 0,
        churnTerminated: r.churn?.terminated ?? 0,
        bySource: (r.by_source ?? []) as ContactFunnelStats["bySource"],
      };
    },
  });
  return { stats: data ?? EMPTY, isLoading, isError, refetch };
}
