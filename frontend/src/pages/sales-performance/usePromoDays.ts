import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Días en que cada creadora PROMOCIONÓ (de promolog_entries), para cruzar con el ingreso BLU
// y calcular el "promo lift" (Content ROI). Devuelve Map<creator_id, Set<"yyyy-MM-dd">>.
const PROMOTED_TRUE = new Set(["yes", "sí", "si", "true", "1"]);
const PAGE_SIZE = 1000;

const fetchPromoDays = async (from: string, to: string): Promise<Map<string, Set<string>>> => {
  let all: any[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await (supabase as any)
      .from("promolog_entries")
      .select("creator_id, date, promoted")
      .gte("date", from)
      .lte("date", `${to}T23:59:59`)
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }
  const map = new Map<string, Set<string>>();
  for (const r of all) {
    if (!r.creator_id) continue;
    if (!PROMOTED_TRUE.has(String(r.promoted ?? "").toLowerCase().trim())) continue;
    const d = String(r.date).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    if (!map.has(r.creator_id)) map.set(r.creator_id, new Set());
    map.get(r.creator_id)!.add(d);
  }
  return map;
};

export const usePromoDays = (from: string, to: string, enabled = true) =>
  useQuery({ queryKey: ["promo_days", from, to], queryFn: () => fetchPromoDays(from, to), enabled: enabled && !!from && !!to });
