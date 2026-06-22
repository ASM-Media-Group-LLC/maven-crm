import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import type { EarningsRow } from "./types";

// Dashboard 2 fue diseñado para `of_gross_earnings` (que dejó de actualizarse el 9-may).
// Este hook trae la data VIVA de BLU (creator_daily_earnings) y la mapea al MISMO shape
// EarningsRow, así toda la lógica del dashboard funciona sin reescribirla.
//
// BLU expone: ingreso total + desglose (subs, tips, mensajes, PPV, referidos, streams),
// subs nuevas/recurrentes, chargebacks, contribución% y —desde fan-reports (Slice A)—
// active_fans/new_fans por día. Ranking de OF sí queda null (BLU no lo da).
// `creator_daily_earnings` no está en los tipos generados → `as any`.
// OJO: PostgREST corta en 1000 filas por request (max-rows del server). Si PAGE_SIZE>1000,
// data.length nunca llega a PAGE_SIZE → el loop cree que terminó en la 1ª página y solo trae
// las ~1000 filas más nuevas (≈ últimos días) → meses anteriores salen vacíos. PAGE_SIZE=1000
// = el cap, así cada página llena devuelve 1000 y la paginación recorre las 11k+ filas.
const PAGE_SIZE = 1000;

const fetchBluEarnings = async (): Promise<EarningsRow[]> => {
  let all: any[] = [];
  let from = 0;
  // Paginar (la tabla tiene 11k+ filas; PostgREST corta en 1000 por defecto).
  while (true) {
    const { data, error } = await (supabase as any)
      .from("creator_daily_earnings")
      .select(
        "id, date, total_gross, subscription_gross, new_sub_gross, recurring_sub_gross, message_gross, tips_gross, contribution_pct, active_fans, new_fans, creator_id, blu_creator_name",
      )
      .order("date", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const creatorIds = [...new Set(all.map((e) => e.creator_id).filter(Boolean) as string[])];
  let creatorsMap: Record<string, string> = {};
  if (creatorIds.length > 0) {
    const { data: creators } = await supabase
      .from("creators")
      .select("id, artistic_name")
      .in("id", creatorIds);
    if (creators) {
      creatorsMap = Object.fromEntries(creators.map((c) => [c.id, c.artistic_name ?? ""]));
    }
  }

  return all.map((e): EarningsRow => ({
    id: e.id,
    date: e.date,
    total_earnings_gross: e.total_gross ?? 0,
    subscription_gross: e.subscription_gross ?? 0,
    new_subscriptions_sub_gross: e.new_sub_gross ?? 0,
    recurring_sub_gross: e.recurring_sub_gross ?? 0,
    message_gross: e.message_gross ?? 0,
    tips_gross: e.tips_gross ?? 0,
    contribution: e.contribution_pct ?? null,
    // Fans desde fan-reports de BLU (Slice A): activeFans/newFans por creadora/día.
    active_fans: e.active_fans ?? null,
    new_fans: e.new_fans ?? null,
    following: null,
    of_ranking: null,
    fans_renew_on: null,
    renew_on_percentage: null,
    change_expired_fan_count: null,
    avg_spend_per_spender_gross: null,
    avg_spend_per_transaction_gross: null,
    avg_earnings_per_fan_gross: null,
    document_id: null,
    pending_creator: e.blu_creator_name ?? null,
    creator_id: e.creator_id ?? null,
    artistic_name: e.creator_id ? (creatorsMap[e.creator_id] ?? null) : (e.blu_creator_name ?? null),
    report_time: null,
    // `date` es date-only; anclamos a mediodía para evitar corrimiento de día por TZ.
    effective_date: e.date ? format(new Date(e.date + "T12:00:00"), "yyyy-MM-dd") : "",
  }));
};

export const useBluEarningsData = () => {
  return useQuery({
    queryKey: ["blu_earnings_dashboard2"],
    queryFn: fetchBluEarnings,
  });
};
