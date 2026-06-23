import { useQuery } from "@tanstack/react-query";
import { format, subDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

// Retención por cohorte (fanRetention de BLU). after_days[d] = % de los fans nuevos de esa
// cohorte que siguen suscriptos al día d (0..11). `creator_fan_retention` no está en los tipos.
export interface FanRetentionRow {
  id: string;
  blu_model_id: number;
  blu_name: string;
  creator_id: string | null;
  artistic_name: string | null;
  cohort_date: string;
  new_fans: number;
  observed_days: number;
  after_days: (number | null)[] | null;
}

const PAGE_SIZE = 1000;

const fetchFanRetention = async (): Promise<FanRetentionRow[]> => {
  // Últimos 60 días de cohortes (suficiente para la retención actual; afterDays cubre 12 días).
  const since = format(subDays(new Date(), 60), "yyyy-MM-dd");
  let all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await (supabase as any)
      .from("creator_fan_retention")
      .select("id, blu_model_id, blu_name, creator_id, cohort_date, new_fans, observed_days, after_days")
      .gte("cohort_date", since)
      .order("cohort_date", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  const ids = [...new Set(all.map((r) => r.creator_id).filter(Boolean) as string[])];
  let nameMap: Record<string, string> = {};
  if (ids.length > 0) {
    const { data: creators } = await supabase.from("creators").select("id, artistic_name").in("id", ids);
    if (creators) nameMap = Object.fromEntries(creators.map((c) => [c.id, c.artistic_name ?? ""]));
  }

  return all.map((r): FanRetentionRow => ({
    ...r,
    artistic_name: r.creator_id ? (nameMap[r.creator_id] ?? null) : null,
  }));
};

export const useFanRetention = (enabled = true) =>
  useQuery({ queryKey: ["blu_fan_retention"], queryFn: fetchFanRetention, enabled });
