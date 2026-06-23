import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Rendimiento por chatter (BLU employee-reports, snapshot del mes en curso).
// `chatter_performance` no está en los tipos generados → `as any`. RLS gate management.
export interface ChatterRow {
  id: string;
  blu_employee_id: number;
  name: string | null;
  email: string | null;
  group_name: string | null;
  is_chatter: boolean | null;
  total_sales: number;
  sold_messages: number;
  direct_messages: number;
  fans_chatted: number;
  fans_spent_money: number;
  fans_who_didnt_spend: number;
  fan_conversion_rate: number | null;
  avg_earnings_per_paying_fan: number | null;
  unlock_rate: number | null;
  avg_response_seconds: number | null;
  scheduled_hours: number | null;
  clocked_hours: number | null;
  characters_sent: number | null;
  creators_count: number | null;
  delta_total_sales: number | null;
  snapshot_from: string | null;
  snapshot_to: string | null;
}

const fetchChatters = async (): Promise<ChatterRow[]> => {
  // ~45 chatters → sin paginar (bajo el cap de 1000).
  const { data, error } = await (supabase as any)
    .from("chatter_performance")
    .select(
      "id, blu_employee_id, name, email, group_name, is_chatter, total_sales, sold_messages, direct_messages, fans_chatted, fans_spent_money, fans_who_didnt_spend, fan_conversion_rate, avg_earnings_per_paying_fan, unlock_rate, avg_response_seconds, scheduled_hours, clocked_hours, characters_sent, creators_count, delta_total_sales, snapshot_from, snapshot_to",
    )
    .order("total_sales", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ChatterRow[];
};

export const useChatters = (enabled = true) =>
  useQuery({ queryKey: ["blu_chatters"], queryFn: fetchChatters, enabled });
