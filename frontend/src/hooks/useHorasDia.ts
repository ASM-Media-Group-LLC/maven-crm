import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// HISTORIAL por HORA del día (Alvaro, 04/11): para la pestaña Historial — la
// gráfica hora por hora y las 3 cajas por turno (AM 8-16 / PM 16-24 / Madrugada
// 0-8, hora Colombia). La arma el RPC argos_horas_dia.

export interface HoraDia {
  hourNum: number;           // 0–23 (hora Colombia)
  pantalla: number | null;
  camara: number | null;
  atencion: number | null;
  personas: number;
}

type RpcDb = { rpc: (f: string, a: unknown) => Promise<{ data: unknown[] | null; error: { message: string } | null }> };

export function useHorasDia(dia: string, habilitado: boolean) {
  const q = useQuery({
    enabled: habilitado,
    queryKey: ["argos-horas-dia", dia],
    staleTime: 60_000,
    refetchInterval: 2 * 60_000,
    queryFn: async (): Promise<HoraDia[]> => {
      const db = supabase as unknown as RpcDb;
      const { data, error } = await db.rpc("argos_horas_dia", { _dia: dia });
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => {
        const row = r as { hora: number; pantalla: number | null; camara: number | null; atencion: number | null; personas: number | string };
        return { hourNum: Number(row.hora), pantalla: row.pantalla, camara: row.camara, atencion: row.atencion, personas: Number(row.personas) };
      });
    },
  });

  return { horas: q.data ?? [], cargando: q.isLoading, error: (q.error as Error | null) ?? null, refrescar: () => q.refetch() };
}
