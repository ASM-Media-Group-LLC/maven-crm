import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Datos del tablero del closer. Todo es SUYO:
//  · el pipeline sale del RPC `closer_mis_leads` (filtra por assigned_to =
//    auth.uid() y trae el conteo de contactos por lead, que es lo que necesita
//    la cadencia de seguimiento);
//  · las horas salen del hook compartido `useMisHoras`;
//  · las calls de QA salen de `qa_calls`, que RLS ya filtra por closer_id.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface LeadDelCloser {
  id: string;
  instagram_handle: string;
  stage: string;
  category: string | null;
  deal_type: string;
  passed_date: string | null;
  last_contact_date: string | null;
  monthly_monetization: number | null;
  /** Fechas de cierre: con ellas el tablero puede decir cuánta plata trajo EN
   *  EL RANGO, no solo el acumulado. */
  confirmed_date: string | null;
  completed_date: string | null;
  contactos: number;
}

const SIN_LEADS: LeadDelCloser[] = [];

/** Mi pipeline completo (hasta 400 leads) con el conteo de contactos. */
export function useMisLeads() {
  const q = useQuery({
    queryKey: ["closer-mis-leads"],
    staleTime: 2 * 60_000,
    queryFn: async (): Promise<LeadDelCloser[]> => {
      const { data, error } = await db.rpc("closer_mis_leads", { _limite: 400 });
      if (error) throw new Error(error.message);
      return ((data ?? []) as LeadDelCloser[]).map((l) => ({
        ...l,
        monthly_monetization: l.monthly_monetization == null ? null : Number(l.monthly_monetization),
      }));
    },
  });
  return { leads: q.data ?? SIN_LEADS, cargando: q.isLoading };
}

/** Mis calls de QA en el rango (RLS ya filtra por closer_id). */
export function useMiQa(desde: string, hasta: string) {
  const { user } = useAuth();
  const q = useQuery({
    enabled: !!user?.id,
    queryKey: ["closer-qa", user?.id, desde, hasta],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<{ calls: number; score: number | null }> => {
      const { data, error } = await db
        .from("qa_calls")
        .select("claude_score, created_at")
        .eq("closer_id", user!.id)
        .gte("created_at", `${desde}T00:00:00`)
        .lte("created_at", `${hasta}T23:59:59`);
      if (error) throw new Error(error.message);
      const filas = (data ?? []) as Array<{ claude_score: number | null }>;
      const conScore = filas.filter((f) => f.claude_score != null);
      return {
        calls: filas.length,
        score: conScore.length ? conScore.reduce((s, f) => s + Number(f.claude_score), 0) / conScore.length : null,
      };
    },
  });
  return q.data ?? { calls: 0, score: null };
}
