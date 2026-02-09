import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { EarningsRow } from "./types";

const fetchEarnings = async (): Promise<EarningsRow[]> => {
  const { data: earnings, error } = await supabase
    .from("of_gross_earnings")
    .select("id, date, total_earnings_gross, document_id, pending_creator, creator_id")
    .order("date", { ascending: false })
    .limit(1000);

  if (error) throw error;

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
  }));
};

export const useEarningsData = () => {
  return useQuery({
    queryKey: ["of_gross_earnings_performance"],
    queryFn: fetchEarnings,
  });
};
