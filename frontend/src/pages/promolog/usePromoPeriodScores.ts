// Score de promo v2 (0-100) por creadora — consume el RPC promo_creator_period_scores,
// la MISMA fuente que los reportes de WhatsApp (promolog-highlights). Ver la migración
// 20260813170000 para el modelo: Frecuencia 40 (promo-días/días LEÍDOS en las redes
// objetivo) + Calidad 30 (CTA estructurado) + Consistencia 20 (racha sin promo) +
// Diversificación 10. Los días no leídos NO castigan; cobertura <60% → is_partial.
// lift_pct = impacto en ingreso (señal separada, no entra al score).
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface PromoPeriodScore {
  creator_id: string;
  name: string;
  instagram_handle: string | null;
  manager_name: string | null;
  target_networks: string[];
  window_days: number;
  covered_days: number;
  coverage_pct: number | null;
  promo_days: number;
  freq_pts: number;
  quality_pts: number;
  consistency_pts: number;
  score: number;
  is_partial: boolean;
  promo_networks: string | null;
  manual_share: number | null;
  lift_pct: number | null;
  lift_n_promo: number;
  lift_n_quiet: number;
}

// Día BOGOTÁ (UTC-5 fijo): con toISOString() a secas, desde las 19:00 Col la ventana
// se corría un día y el leaderboard dejaba de coincidir con el reporte de las 7pm.
const BOG_OFFSET_MS = 5 * 3600 * 1000;
const dayKey = (d: Date) => new Date(d.getTime() - BOG_OFFSET_MS).toISOString().slice(0, 10);

/** Scores de la ventana móvil de `windowDays` días (default 7) terminando hoy. */
export function usePromoPeriodScores(windowDays = 7) {
  return useQuery({
    queryKey: ["promo-period-scores", windowDays],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PromoPeriodScore[]> => {
      const to = new Date();
      const from = new Date(to.getTime() - (windowDays - 1) * 86400 * 1000);
      const { data, error } = await (supabase as any).rpc("promo_creator_period_scores", {
        p_from: dayKey(from),
        p_to: dayKey(to),
      });
      if (error) throw error;
      return ((data ?? []) as any[]).map((r) => ({
        ...r,
        coverage_pct: r.coverage_pct != null ? Number(r.coverage_pct) : null,
        freq_pts: Number(r.freq_pts ?? 0),
        quality_pts: Number(r.quality_pts ?? 0),
        consistency_pts: Number(r.consistency_pts ?? 0),
        manual_share: r.manual_share != null ? Number(r.manual_share) : null,
        lift_pct: r.lift_pct != null ? Number(r.lift_pct) : null,
      })) as PromoPeriodScore[];
    },
  });
}
