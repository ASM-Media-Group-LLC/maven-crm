import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Filas por-creadora-por-DÍA de creator_daily_earnings para un rango. Solo lo usa el
// tab "Content ROI" (promo × ingreso), que necesita granularidad diaria para bucketear
// cada día como con/sin promo. Se jala LAZY (solo cuando ese tab está abierto) y acotado
// al período seleccionado → unas ~1700 filas/mes, no las 13k del histórico. El resto del
// dashboard usa el resumen agregado (useDashboard2Summary).
export interface Dash2DailyRow {
  creator_id: string;
  date: string;
  total_gross: number;
  artistic_name: string | null;
}

const PAGE_SIZE = 1000; // tope de PostgREST; paginamos por si el rango supera 1000 filas.

const fetchDaily = async (from: string, to: string): Promise<Dash2DailyRow[]> => {
  let all: any[] = [];
  let f = 0;
  while (true) {
    const { data, error } = await (supabase as any)
      .from("creator_daily_earnings")
      .select("creator_id, date, total_gross, blu_creator_name, creators(artistic_name)")
      .gte("date", from)
      .lte("date", to)
      .order("date", { ascending: false })
      .range(f, f + PAGE_SIZE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE_SIZE) break;
    f += PAGE_SIZE;
  }
  return all
    .filter((r) => r.creator_id)
    .map((r): Dash2DailyRow => ({
      creator_id: r.creator_id,
      date: r.date,
      total_gross: typeof r.total_gross === "number" ? r.total_gross : parseFloat(String(r.total_gross ?? "")) || 0,
      artistic_name: r.creators?.artistic_name ?? r.blu_creator_name ?? null,
    }));
};

export const useDashboard2Daily = (from?: string, to?: string, enabled = true) =>
  useQuery({
    queryKey: ["dashboard2_daily", from, to],
    enabled: enabled && !!from && !!to,
    staleTime: 5 * 60 * 1000,
    queryFn: () => fetchDaily(from!, to!),
  });
