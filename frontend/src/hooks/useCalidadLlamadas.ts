import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ¿LAS LLAMADAS MEJORAN DE VERDAD? (Alvaro, 18/11/2026). Tablero solo del dueño:
// día por día y persona por persona. RPCs llamadas_calidad_por_dia y
// llamadas_calidad_por_persona (supabase/migrations/20261119010000_…). Sin
// permiso o si la consulta falla es un ERROR, nunca «todo bien».

/** Las métricas del tablero. En todas, MENOS es mejor. */
export type Metrica =
  | "pct_con_problema"
  | "pct_mala_conexion"
  | "cortes_por_100h"
  | "pct_congelado"
  | "pct_cam_limitada"
  | "pct_audio_malo"
  | "rtt_mediana_ms";

export const METRICAS: Metrica[] = [
  "pct_con_problema", "pct_mala_conexion", "cortes_por_100h", "pct_congelado", "pct_cam_limitada", "pct_audio_malo", "rtt_mediana_ms",
];

export interface DiaDeCalidad {
  dia: string;
  minutos: number;
  personas: number;
  cortes: number;
  horas_llamada: number;
  minutos_con_audio: number;
  pct_con_problema: number | null;
  pct_mala_conexion: number | null;
  cortes_por_100h: number | null;
  pct_congelado: number | null;
  pct_cam_limitada: number | null;
  pct_audio_malo: number | null;
  rtt_mediana_ms: number | null;
}

export type CausaAudio = "mic_mudo" | "voz_se_pierde" | "escucha_cortado";

export interface PersonaDeCalidad {
  user_id: string;
  nombre: string | null;
  equipo: string | null;
  minutos: number;
  cortes: number;
  minutos_con_audio: number;
  causa_audio: CausaAudio | null;
  pct_con_problema: number | null;
  pct_mala_conexion: number | null;
  cortes_por_100h: number | null;
  pct_congelado: number | null;
  pct_cam_limitada: number | null;
  pct_audio_malo: number | null;
  rtt_mediana_ms: number | null;
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function metricas(r: Record<string, unknown>): Record<Metrica, number | null> {
  return Object.fromEntries(METRICAS.map((m) => [m, num(r[m])])) as Record<Metrica, number | null>;
}

/** PostgREST puede mandar los numeric como texto: aquí todo queda como número. */
export function normalizarDia(r: Record<string, unknown>): DiaDeCalidad {
  return {
    dia: String(r.dia ?? ""),
    minutos: num(r.minutos) ?? 0,
    personas: num(r.personas) ?? 0,
    cortes: num(r.cortes) ?? 0,
    horas_llamada: num(r.horas_llamada) ?? 0,
    minutos_con_audio: num(r.minutos_con_audio) ?? 0,
    ...metricas(r),
  };
}

export function normalizarPersona(r: Record<string, unknown>): PersonaDeCalidad {
  const causa = r.causa_audio;
  return {
    user_id: String(r.user_id ?? ""),
    nombre: (r.nombre as string | null) ?? null,
    equipo: (r.equipo as string | null) ?? null,
    minutos: num(r.minutos) ?? 0,
    cortes: num(r.cortes) ?? 0,
    minutos_con_audio: num(r.minutos_con_audio) ?? 0,
    causa_audio: causa === "mic_mudo" || causa === "voz_se_pierde" || causa === "escucha_cortado" ? causa : null,
    ...metricas(r),
  };
}

/** Peor primero: más % de minutos con problema; después más cortes por 100 h. */
export function ordenarPeorPrimero(filas: PersonaDeCalidad[]): PersonaDeCalidad[] {
  return [...filas].sort((a, b) =>
    (b.pct_con_problema ?? -1) - (a.pct_con_problema ?? -1)
    || (b.cortes_por_100h ?? -1) - (a.cortes_por_100h ?? -1)
    || b.minutos - a.minutos);
}

export type Cambio = "mejor" | "peor" | "igual";

/** El último día con llamadas contra el promedio de los 7 días con llamadas
 *  anteriores. Menos es mejor; un cambio de menos del 10 % es «igual». */
export function tendencia(dias: DiaDeCalidad[], m: Metrica): { hoy: number | null; antes: number | null; cambio: Cambio | null } {
  const conDato = dias.filter((d) => d.minutos > 0 && d[m] !== null);
  const ultimo = conDato[conDato.length - 1];
  if (!ultimo) return { hoy: null, antes: null, cambio: null };
  const previos = conDato.slice(-8, -1).map((d) => d[m] as number);
  if (!previos.length) return { hoy: ultimo[m], antes: null, cambio: null };
  const antes = Math.round((previos.reduce((s, v) => s + v, 0) / previos.length) * 10) / 10;
  const hoy = ultimo[m] as number;
  const margen = Math.max(Math.abs(antes) * 0.1, m === "rtt_mediana_ms" ? 5 : 0.3);
  const cambio: Cambio = hoy < antes - margen ? "mejor" : hoy > antes + margen ? "peor" : "igual";
  return { hoy, antes, cambio };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { rpc: (f: string, a?: Record<string, unknown>) => Promise<{ data: any; error: { message: string } | null }> };

export function useCalidadPorDia(dias = 14) {
  return useQuery<DiaDeCalidad[]>({
    queryKey: ["llamadas-calidad-por-dia", dias],
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await sinTipar.rpc("llamadas_calidad_por_dia", { _dias: dias });
      if (error) throw new Error(error.message);
      // La función siempre devuelve un renglón por día: null es un fallo.
      if (!Array.isArray(data)) throw new Error("llamadas_calidad_por_dia no devolvió filas");
      return (data as Record<string, unknown>[]).map(normalizarDia);
    },
  });
}

export function useCalidadPorPersona(dias: 1 | 7) {
  return useQuery<PersonaDeCalidad[]>({
    queryKey: ["llamadas-calidad-por-persona", dias],
    refetchInterval: 5 * 60_000,
    staleTime: 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await sinTipar.rpc("llamadas_calidad_por_persona", { _dias: dias });
      if (error) throw new Error(error.message);
      if (!Array.isArray(data)) throw new Error("llamadas_calidad_por_persona no devolvió filas");
      return ordenarPeorPrimero((data as Record<string, unknown>[]).map(normalizarPersona));
    },
  });
}
