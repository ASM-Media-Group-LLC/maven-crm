import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDiasDeChatter, useMasivos, type DiaDeChatter } from "@/pages/chatters/useChatterRendimiento";

// Datos del dashboard del chatter. Todo lo que se lee acá ya lo permite RLS al
// propio chatter (chatter_daily_score, chatter_model_daily, chatter_mass_messages
// filtran por maven_user_id = auth.uid()); no hay RPC nueva ni privilegio extra.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface VentaModelo {
  blu_model_id: number;
  model_name: string | null;
  sales: number;
  fans: number;
  dias: number;
}

export function useVentasPorModelo(identityId: string | null, desde: string, hasta: string) {
  return useQuery({
    enabled: !!identityId,
    queryKey: ["chatter-dashboard", "modelos", identityId, desde, hasta],
    queryFn: async (): Promise<VentaModelo[]> => {
      const { data, error } = await db
        .from("chatter_model_daily")
        .select("blu_model_id, model_name, sales, fans_chatted, dia")
        .eq("identity_id", identityId!)
        .gte("dia", desde).lte("dia", hasta)
        .limit(1000);
      if (error) throw new Error(error.message);
      const acc = new Map<number, VentaModelo>();
      for (const r of (data ?? []) as Array<{ blu_model_id: number; model_name: string | null; sales: number | null; fans_chatted: number | null }>) {
        const v = acc.get(r.blu_model_id) ?? { blu_model_id: r.blu_model_id, model_name: r.model_name, sales: 0, fans: 0, dias: 0 };
        v.sales += Number(r.sales ?? 0); v.fans += r.fans_chatted ?? 0; v.dias += 1;
        if (!v.model_name && r.model_name) v.model_name = r.model_name;
        acc.set(r.blu_model_id, v);
      }
      return Array.from(acc.values()).sort((a, b) => b.sales - a.sales);
    },
  });
}

export interface ResumenPeriodo {
  diasConNota: number;
  diasDelPeriodo: number;
  notaPromedio: number | null;
  ventas: number;
  esperado: number;
  horas: number;
  diasConVentas: number;
  mejorDia: DiaDeChatter | null;
  masivos: number;
  masivosGenerado: number;
  masivosConversion: number | null; // compraron / vieron
}

export function useResumenChatter(identityId: string | null, desde: string, hasta: string, diasDelPeriodo: number) {
  const dias = useDiasDeChatter(identityId, desde, hasta);
  const masivos = useMasivos(identityId, desde, hasta);
  const resumen = useMemo<ResumenPeriodo>(() => {
    const filas = dias.data ?? [];
    const conNota = filas.filter((d) => d.nota != null);
    const ventas = filas.reduce((s, d) => s + Number(d.ventas ?? 0), 0);
    const esperado = filas.reduce((s, d) => s + Number(d.ventas_esperadas ?? 0), 0);
    const horas = filas.reduce((s, d) => s + Number(d.horas ?? 0), 0);
    const mejorDia = filas.reduce<DiaDeChatter | null>((m, d) => (d.ventas != null && (m == null || Number(d.ventas) > Number(m.ventas ?? 0)) ? d : m), null);
    const ms = masivos.data ?? [];
    const vistos = ms.reduce((s, m) => s + m.viewed, 0);
    const compraron = ms.reduce((s, m) => s + m.purchased, 0);
    return {
      diasConNota: conNota.length,
      diasDelPeriodo,
      notaPromedio: conNota.length ? conNota.reduce((s, d) => s + Number(d.nota), 0) / conNota.length : null,
      ventas, esperado, horas,
      diasConVentas: filas.filter((d) => Number(d.ventas ?? 0) > 0).length,
      mejorDia,
      masivos: ms.length,
      masivosGenerado: ms.reduce((s, m) => s + Number(m.earnings ?? 0), 0),
      masivosConversion: vistos > 0 ? (100 * compraron) / vistos : null,
    };
  }, [dias.data, masivos.data, diasDelPeriodo]);
  return { dias: dias.data ?? [], resumen, cargando: dias.isLoading || masivos.isLoading };
}
