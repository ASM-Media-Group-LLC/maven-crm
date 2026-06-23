import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Ballenas: top spenders por creadora (snapshot de fan-reports, ~últimos 90 días).
// `creator_top_fans` no está en los tipos generados → `as any`. RLS gate management.
export interface TopFan {
  id: string;
  blu_model_id: number;
  blu_name: string;
  creator_id: string | null;
  artistic_name: string | null;
  fan_user_id: number;
  rank: number | null;
  fan_name: string | null;
  fan_username: string | null;
  spent_gross: number;
  transactions: number;
  messages_gross: number;
  tips_gross: number;
  is_active: boolean | null;
  subscribed_at: string | null;
  expires_at: string | null;
  subscription_length_days: number | null;
  snapshot_from: string | null;
  snapshot_to: string | null;
}

const PAGE_SIZE = 1000;

const fetchTopFans = async (): Promise<TopFan[]> => {
  let all: any[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await (supabase as any)
      .from("creator_top_fans")
      .select(
        "id, blu_model_id, blu_name, creator_id, fan_user_id, rank, fan_name, fan_username, spent_gross, transactions, messages_gross, tips_gross, is_active, subscribed_at, expires_at, subscription_length_days, snapshot_from, snapshot_to",
      )
      .order("spent_gross", { ascending: false })
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

  return all.map((r): TopFan => ({
    ...r,
    artistic_name: r.creator_id ? (nameMap[r.creator_id] ?? null) : null,
  }));
};

// `enabled` para no jalar la tabla salvo que el usuario abra el tab de Ballenas.
export const useTopFans = (enabled = true) =>
  useQuery({ queryKey: ["blu_top_fans"], queryFn: fetchTopFans, enabled });
