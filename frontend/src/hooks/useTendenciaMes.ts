import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Resumen por DÍA de un mes (para el calendario del Panel de Argos): qué días
// tienen datos y cómo estuvo el equipo (pantalla% + cuánta gente), para pintar
// cada día del calendario. Usa el mismo RPC argos_tendencia.

export interface DiaMes {
  pantalla: number | null;
  personas: number;
}

type RpcDb = { rpc: (f: string, a: unknown) => Promise<{ data: unknown[] | null; error: { message: string } | null }> };

export function useTendenciaMes(anio: number, mes: number, hoy: string) {
  const desde = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const finDia = new Date(anio, mes, 0).getDate();
  let hasta = `${anio}-${String(mes).padStart(2, "0")}-${String(finDia).padStart(2, "0")}`;
  if (hasta > hoy) hasta = hoy; // no pedir días futuros

  const q = useQuery({
    queryKey: ["argos-tendencia-mes", anio, mes],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Map<string, DiaMes>> => {
      const db = supabase as unknown as RpcDb;
      const { data, error } = await db.rpc("argos_tendencia", { _desde: desde, _hasta: hasta });
      if (error) throw new Error(error.message);
      const mapa = new Map<string, DiaMes>();
      for (const r of data ?? []) {
        const row = r as { dia: string; pantalla: number | null; personas: number | string };
        mapa.set(row.dia.slice(0, 10), { pantalla: row.pantalla, personas: Number(row.personas) });
      }
      return mapa;
    },
  });

  return { porDia: q.data ?? new Map<string, DiaMes>() };
}
