import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TranslationKey } from "@/lib/i18n";

// Datos del dashboard de rendimiento de chatters.
//
// Todo lo pesado se resuelve en Postgres (chatter_dashboard_periodo) y no acá:
// con 42 chatters por 30 días, traer las filas crudas al navegador chocaría con
// el corte de 1000 filas de PostgREST y el promedio del periodo saldría de una
// muestra sin que nada avise. Ese error ya pasó antes en este proyecto.

export interface ChatterPeriodo {
  identity_id: string;
  display_name: string;
  maven_user_id: string | null;
  activo: boolean;
  /** Días del periodo que realmente tienen nota. Un promedio de 2 días no es
   *  el promedio del mes, y la pantalla tiene que poder decirlo. */
  dias_con_nota: number;
  dias_del_periodo: number;
  /** Nota FINAL del período: la base ya ajustada por el feedback del TL. */
  nota_promedio: number | null;
  ventas_total: number | null;
  ventas_esperadas_total: number | null;
  horas_total: number | null;
  dias_con_ventas: number;
  modelos_distintas: number;
  masivos: number;
  masivos_enviados: number;
  masivos_vistos: number;
  masivos_comprados: number;
  masivos_generado: number;
  /** Nota SIN el feedback del TL (para poder mostrar el antes/después). */
  nota_base_promedio: number | null;
  /** Neto de puntos que el TL sumó o restó en el período. */
  feedback_puntos: number;
  /** Cuántos registros de feedback componen ese neto. */
  feedback_n: number;
}

export interface CoberturaDia {
  dia: string;
  modelos_traidos: number;
  chatters_con_actividad: number;
}

export interface DiaDeChatter {
  dia: string;
  nota: number | null;
  nota_ventas: number | null;
  nota_tiempo: number | null;
  nota_meet: number | null;
  ventas: number | null;
  ventas_esperadas: number | null;
  horas: number | null;
  detalle: {
    ratio_ventas?: number | null;
    faltantes?: string[];
    actividad_pct?: number | null;
    estuvo_en_cowork?: boolean;
    pausa_segundos?: number | null;
  } | null;
}

export interface ModeloDelDia {
  blu_model_id: number;
  model_name: string | null;
  sales: number;
  fans_chatted: number;
}

export interface MasivoFila {
  blu_id: string;
  dia: string;
  model_name: string | null;
  kind: string | null;
  copy: string | null;
  price: number;
  sent: number;
  viewed: number;
  purchased: number;
  earnings: number;
}

/** Fecha en formato YYYY-MM-DD, sin pasar por UTC. */
export function isoDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Rango [desde, hasta] terminando AYER: el día en curso está incompleto y
 *  meterlo en un promedio lo ensucia con horas que todavía no pasaron. */
export function rangoDeDias(dias: number): { desde: string; hasta: string } {
  const hasta = new Date();
  hasta.setDate(hasta.getDate() - 1);
  const desde = new Date(hasta);
  desde.setDate(desde.getDate() - (dias - 1));
  return { desde: isoDia(desde), hasta: isoDia(hasta) };
}

export function useChatterPeriodo(desde: string, hasta: string) {
  return useQuery({
    queryKey: ["chatter-rendimiento", "periodo", desde, hasta],
    queryFn: async (): Promise<ChatterPeriodo[]> => {
      const { data, error } = await supabase.rpc("chatter_dashboard_periodo", {
        _desde: desde, _hasta: hasta,
      });
      if (error) throw error;
      return (data ?? []) as ChatterPeriodo[];
    },
  });
}

export function useCobertura(desde: string, hasta: string) {
  return useQuery({
    queryKey: ["chatter-rendimiento", "cobertura", desde, hasta],
    queryFn: async (): Promise<CoberturaDia[]> => {
      const { data, error } = await supabase.rpc("chatter_dashboard_cobertura", {
        _desde: desde, _hasta: hasta,
      });
      if (error) throw error;
      return (data ?? []) as CoberturaDia[];
    },
  });
}

export function useDiasDeChatter(identityId: string | null, desde: string, hasta: string) {
  return useQuery({
    enabled: !!identityId,
    queryKey: ["chatter-rendimiento", "dias", identityId, desde, hasta],
    queryFn: async (): Promise<DiaDeChatter[]> => {
      const { data, error } = await supabase
        .from("chatter_daily_score")
        .select("dia, nota, nota_ventas, nota_tiempo, nota_meet, ventas, ventas_esperadas, horas, detalle")
        .eq("identity_id", identityId!)
        .gte("dia", desde).lte("dia", hasta)
        .order("dia", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as DiaDeChatter[];
    },
  });
}

export function useModelosDelDia(identityId: string | null, dia: string | null) {
  return useQuery({
    enabled: !!identityId && !!dia,
    queryKey: ["chatter-rendimiento", "modelos", identityId, dia],
    queryFn: async (): Promise<ModeloDelDia[]> => {
      const { data, error } = await supabase
        .from("chatter_model_daily")
        .select("blu_model_id, model_name, sales, fans_chatted")
        .eq("identity_id", identityId!).eq("dia", dia!)
        .order("sales", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ModeloDelDia[];
    },
  });
}

export function useMasivos(identityId: string | null, desde: string, hasta: string) {
  return useQuery({
    enabled: !!identityId,
    queryKey: ["chatter-rendimiento", "masivos", identityId, desde, hasta],
    queryFn: async (): Promise<MasivoFila[]> => {
      const { data, error } = await supabase
        .from("chatter_mass_messages")
        .select("blu_id, dia, model_name, kind, copy, price, sent, viewed, purchased, earnings")
        .eq("identity_id", identityId!)
        .gte("dia", desde).lte("dia", hasta)
        .order("dia", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as MasivoFila[];
    },
  });
}

/** Color de la nota. Sin nota NO es rojo: es ausencia de dato. */
export function tonoDeNota(nota: number | null | undefined): string {
  if (nota == null) return "bg-muted text-muted-foreground border-border";
  if (nota >= 8) return "bg-success/15 text-success border-success/30";
  if (nota >= 6) return "bg-warning/15 text-warning border-warning/30";
  return "bg-destructive/15 text-destructive border-destructive/30";
}

export const money = (n: number | null | undefined) =>
  n == null ? "—" : `$${Math.round(n).toLocaleString("en-US")}`;

/** Lo que le faltó a un día para tener nota. La LLAVE viene de la base
 *  (`detalle.faltantes`); el valor es la clave de i18n de lo que se muestra. */
export const NOMBRE_FALTANTE: Record<string, TranslationKey> = {
  ventas: "chatters.missing.ventas",
  horas: "chatters.missing.horas",
  cowork: "chatters.missing.cowork",
};
