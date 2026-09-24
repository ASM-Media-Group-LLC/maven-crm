import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import type { EarningsRow } from "./types";

const FIELDS = "id, date, total_earnings_gross, subscription_gross, new_subscriptions_sub_gross, recurring_sub_gross, message_gross, tips_gross, active_fans, new_fans, following, of_ranking, contribution, fans_renew_on, renew_on_percentage, change_expired_fan_count, avg_spend_per_spender_gross, avg_spend_per_transaction_gross, avg_earnings_per_fan_gross, document_id, pending_creator, creator_id";
const PAGE_SIZE = 5000;

const fetchEarnings = async (): Promise<EarningsRow[]> => {
  // Paginate to fetch ALL rows (table has 12k+ rows)
  let allEarnings: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("of_gross_earnings")
      .select(FIELDS)
      .order("date", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allEarnings = allEarnings.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const earnings = allEarnings;

  const creatorIds = [
    ...new Set(
      (earnings ?? []).map((e) => e.creator_id).filter(Boolean) as string[]
    ),
  ];

  let creatorsMap: Record<string, string> = {};
  if (creatorIds.length > 0) {
    const { data: creators } = await supabase
      .from("creators")
      .select("id, artistic_name")
      .in("id", creatorIds);
    if (creators) {
      creatorsMap = Object.fromEntries(
        creators.map((c) => [c.id, c.artistic_name ?? ""])
      );
    }
  }

  return (earnings ?? []).map((e) => ({
    ...e,
    artistic_name: e.creator_id ? creatorsMap[e.creator_id] ?? null : null,
    // Idioma fijo a propósito: es un dato de la fila (HH:mm en 24 h, igual en cualquier idioma) armado en el queryFn y cacheado.
    report_time: e.date ? new Date(e.date).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false }) : null,
    effective_date: format(new Date(e.date), "yyyy-MM-dd"),
  }));
};

export const useEarningsData = () => {
  return useQuery({
    queryKey: ["of_gross_earnings_performance", "simplified-v2"],
    queryFn: fetchEarnings,
  });
};
