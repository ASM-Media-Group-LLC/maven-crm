import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
import type { EarningsRow } from "./types";

const computeEffectiveDate = (dateStr: string): string => {
  const d = new Date(dateStr);
  const hours = d.getHours();
  const minutes = d.getMinutes();
  if (hours === 0 && minutes <= 55) {
    return format(subDays(d, 1), "yyyy-MM-dd");
  }
  return format(d, "yyyy-MM-dd");
};

const deduplicateByCreatorDay = (rows: EarningsRow[]): EarningsRow[] => {
  const grouped = new Map<string, EarningsRow>();
  for (const row of rows) {
    const creatorKey = row.creator_id || row.pending_creator || row.id;
    const key = `${creatorKey}__${row.effective_date}`;
    const existing = grouped.get(key);
    if (!existing || new Date(row.date) > new Date(existing.date)) {
      grouped.set(key, row);
    }
  }
  return Array.from(grouped.values());
};

const BATCH_SIZE = 1000;

const fetchEarnings = async (): Promise<EarningsRow[]> => {
  const allEarnings: any[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabase
      .from("of_gross_earnings")
      .select("id, date, total_earnings_gross, subscription_gross, new_subscriptions_sub_gross, recurring_sub_gross, message_gross, tips_gross, active_fans, new_fans, following, of_ranking, contribution, fans_renew_on, renew_on_percentage, change_expired_fan_count, avg_spend_per_spender_gross, avg_spend_per_transaction_gross, avg_earnings_per_fan_gross, document_id, pending_creator, creator_id")
      .order("date", { ascending: false })
      .range(offset, offset + BATCH_SIZE - 1);

    if (error) throw error;

    const batch = data ?? [];
    allEarnings.push(...batch);

    if (batch.length < BATCH_SIZE) {
      hasMore = false;
    } else {
      offset += BATCH_SIZE;
    }
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

  const mapped = (earnings ?? []).map((e) => ({
    ...e,
    artistic_name: e.creator_id ? creatorsMap[e.creator_id] ?? null : null,
    report_time: e.date ? new Date(e.date).toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", hour12: false }) : null,
    effective_date: computeEffectiveDate(e.date),
  }));

  return deduplicateByCreatorDay(mapped);
};

export const useEarningsData = () => {
  return useQuery({
    queryKey: ["of_gross_earnings_performance"],
    queryFn: fetchEarnings,
  });
};
