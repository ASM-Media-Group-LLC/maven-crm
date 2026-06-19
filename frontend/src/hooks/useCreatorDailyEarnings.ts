import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Ingreso diario por creadora (gross) que llena el micro blu-bridge desde BLU
// (tabla creator_daily_earnings). Reutilizable: Promolog (cruce promo↔ingreso),
// perfil de creadora, dashboards de ventas.
export interface CreatorDailyEarning {
  date: string; // yyyy-mm-dd
  total_gross: number;
  subscription_gross: number;
  tips_gross: number;
  message_gross: number;
  post_gross: number;
  referral_gross: number;
  stream_gross: number;
}

/**
 * Trae el ingreso diario de UNA creadora en el rango [fromDate, toDate] (inclusive),
 * ordenado por fecha asc. La tabla tiene RLS de management (admin/manager/owner):
 * para roles sin acceso devuelve [] — el caller debe ocultar la sección si no hay data.
 * Solo hay filas en días con ingreso > 0 (el micro filtra los ceros).
 */
export const useCreatorDailyEarnings = (
  creatorId: string | null | undefined,
  fromDate: string | null,
  toDate: string | null,
  enabled = true,
) => {
  return useQuery({
    queryKey: ["creator_daily_earnings", creatorId, fromDate, toDate],
    enabled: enabled && !!creatorId && !!fromDate && !!toDate,
    queryFn: async (): Promise<CreatorDailyEarning[]> => {
      const { data, error } = await supabase
        .from("creator_daily_earnings" as any)
        .select(
          "date,total_gross,subscription_gross,tips_gross,message_gross,post_gross,referral_gross,stream_gross",
        )
        .eq("creator_id", creatorId as string)
        .gte("date", fromDate as string)
        .lte("date", toDate as string)
        .order("date", { ascending: true });
      if (error) throw error;
      return ((data as any[]) ?? []).map((r) => ({
        date: String(r.date).slice(0, 10),
        total_gross: Number(r.total_gross) || 0,
        subscription_gross: Number(r.subscription_gross) || 0,
        tips_gross: Number(r.tips_gross) || 0,
        message_gross: Number(r.message_gross) || 0,
        post_gross: Number(r.post_gross) || 0,
        referral_gross: Number(r.referral_gross) || 0,
        stream_gross: Number(r.stream_gross) || 0,
      }));
    },
  });
};
