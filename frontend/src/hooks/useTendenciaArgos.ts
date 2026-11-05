import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// TENDENCIA de Argos (Alvaro, 04/11): para las gráficas del dashboard — cómo
// viene el equipo día a día (pantalla%, cámara%, atención%), últimos N días.
// La arma el RPC argos_tendencia (promedia por persona y luego por día). La
// cámara viene null en los días previos al arreglo de cara_visible (no se medía).

export interface DiaTendencia {
  dia: string;              // YYYY-MM-DD
  pantalla: number | null;
  camara: number | null;
  atencion: number | null;
  personas: number;
}

type RpcDb = { rpc: (f: string, a: unknown) => Promise<{ data: unknown[] | null; error: { message: string } | null }> };

export function useTendenciaArgos(dias: number) {
  const q = useQuery({
    queryKey: ["argos-tendencia", dias],
    staleTime: 5 * 60_000,
    refetchInterval: 5 * 60_000,
    queryFn: async (): Promise<DiaTendencia[]> => {
      const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
      const [y, m, d] = hoy.split("-").map(Number);
      const desdeDt = new Date(Date.UTC(y, m - 1, d));
      desdeDt.setUTCDate(desdeDt.getUTCDate() - (dias - 1));
      const desde = desdeDt.toISOString().slice(0, 10);

      const db = supabase as unknown as RpcDb;
      const { data, error } = await db.rpc("argos_tendencia", { _desde: desde, _hasta: hoy });
      if (error) throw new Error(error.message);
      return (data ?? []).map((r) => {
        const row = r as { dia: string; pantalla: number | null; camara: number | null; atencion: number | null; personas: number | string };
        return {
          dia: row.dia?.slice(0, 10),
          pantalla: row.pantalla,
          camara: row.camara,
          atencion: row.atencion,
          personas: Number(row.personas),
        };
      });
    },
  });

  return { dias: q.data ?? [], cargando: q.isLoading, error: (q.error as Error | null) ?? null };
}
