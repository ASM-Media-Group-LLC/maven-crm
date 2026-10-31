import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Dos lecturas de apoyo para el panel de RRHH del monitor:
//   · useMonitorRondas → el rondín: cuándo pasó el robot por última vez y cuánta
//     gente está en sala ahora (del latido que deja cada ronda en monitor_rondas).
//   · useMonitorRanking → quién acumula más FALTAS confirmadas (estado='falta')
//     en los últimos N días, para el ranking por persona.
// Las dos las ven supervisor+ (lo fuerza la RLS).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

interface Ronda { user_id: string; last_at: string; trabajando: boolean | null; presente: boolean | null }

const EN_SALA_MS = 5 * 60 * 1000; // un latido de los últimos 5 min = "en sala ahora"

export function useMonitorRondas() {
  const query = useQuery({
    queryKey: ["monitor-rondas"],
    staleTime: 10_000,
    refetchInterval: 20_000, // el rondín se refresca solo cada 20 s
    queryFn: async (): Promise<Ronda[]> => {
      const { data, error } = await sinTipar
        .from("monitor_rondas")
        .select("user_id, last_at, trabajando, presente")
        .order("last_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as Ronda[];
    },
  });
  const rondas = query.data ?? [];
  const corte = Date.now() - EN_SALA_MS;
  const enSala = rondas.filter((r) => new Date(r.last_at).getTime() > corte);
  return {
    ultimaRonda: rondas[0]?.last_at ? new Date(rondas[0].last_at) : null,
    enSala: enSala.length,
    trabajando: enSala.filter((r) => r.trabajando === true).length,
    cargando: query.isLoading,
    error: (query.error as Error | null) ?? null,
  };
}

export interface FilaRanking { user_id: string; nombre: string | null; total: number }

export function useMonitorRanking(dias = 7) {
  const query = useQuery({
    queryKey: ["monitor-ranking", dias],
    staleTime: 30_000,
    queryFn: async (): Promise<FilaRanking[]> => {
      const desde = new Date(Date.now() - dias * 86_400_000).toISOString();
      const { data, error } = await sinTipar
        .from("monitor_eventos")
        .select("user_id")
        .eq("estado", "falta")
        .gte("created_at", desde)
        .limit(2000);
      if (error) throw error;
      const filas = (data ?? []) as Array<{ user_id: string }>;
      const porUser = new Map<string, number>();
      for (const f of filas) porUser.set(f.user_id, (porUser.get(f.user_id) ?? 0) + 1);
      const ids = [...porUser.keys()];
      const nombres: Record<string, string | null> = {};
      if (ids.length) {
        const { data: p } = await supabase.from("profiles").select("id, full_name").in("id", ids);
        for (const x of (p ?? []) as Array<{ id: string; full_name: string | null }>) nombres[x.id] = x.full_name;
      }
      return ids
        .map((id) => ({ user_id: id, nombre: nombres[id] ?? null, total: porUser.get(id)! }))
        .sort((a, b) => b.total - a.total);
    },
  });
  return { ranking: query.data ?? [], cargando: query.isLoading, error: (query.error as Error | null) ?? null };
}
