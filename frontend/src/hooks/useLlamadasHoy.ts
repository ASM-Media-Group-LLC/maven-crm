import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { EstadoNC } from "@/lib/estadoNC";

// ARGOS › LLAMADAS (Alvaro, 13/11/2026): a quién se le corta la llamada hoy y
// por qué. RPC argos_llamadas_hoy (supabase/migrations/20261114020000_…): una
// fila por persona con cortes en el día de Bogotá, con las MISMAS reglas de quién
// ve a quién que el resto de Argos (ve_argos + argos_vigilables). Sin permiso, o
// si la consulta falla, es un ERROR, nunca «nadie tiene cortes».

export interface FilaLlamadas {
  user_id: string;
  nombre: string | null;
  equipo: string | null;
  cortes: number;
  graves: number;
  ultimo_corte: string | null;
  /** Cortes por hora del día de Bogotá (24 posiciones, 0 = medianoche). */
  horas: number[];
  causa: string | null;
  causa_texto: string | null;
  causa_estimada: string | null;
  consejo: string | null;
  /** availableOutgoingBitrate de WebRTC: una ESTIMACIÓN, no la velocidad del internet. */
  subida_estimada_kbps: number | null;
  rtt_ms: number | null;
  perdida_pct: number | null;
  nav: string | null;
  nucleos: number | null;
  prueba_subida_mbps: number | null;
  prueba_bajada_mbps: number | null;
  prueba_ms: number | null;
  /** La subida no terminó a tiempo: la real es MENOR que prueba_subida_mbps. */
  prueba_subida_tope: boolean;
  prueba_at: string | null;
  nc: EstadoNC | string | null;
  nc_at: string | null;
}

/** Más cortes primero; a igual cantidad, más graves; después, el más reciente. */
export function ordenarLlamadas(filas: FilaLlamadas[]): FilaLlamadas[] {
  return [...filas].sort((a, b) =>
    b.cortes - a.cortes
    || b.graves - a.graves
    || (b.ultimo_corte ?? "").localeCompare(a.ultimo_corte ?? ""));
}

/** Cortes del equipo entero por hora (suma de cada persona). */
export function cortesPorHora(filas: Pick<FilaLlamadas, "horas">[]): number[] {
  const total = Array.from({ length: 24 }, () => 0);
  for (const f of filas) {
    for (let h = 0; h < 24; h++) total[h] += Number(f.horas?.[h] ?? 0) || 0;
  }
  return total;
}

/** Qué horas mostrar en la tirita: desde la jornada (o el primer corte, si fue
 *  antes) hasta la hora actual (o el último corte). Nada de madrugadas vacías. */
export function horasAVer(total: number[], horaActual: number, desdeJornada = 7): number[] {
  const conCortes = total.map((n, h) => (n > 0 ? h : -1)).filter((h) => h >= 0);
  const desde = Math.min(desdeJornada, conCortes[0] ?? desdeJornada);
  const hasta = Math.max(Math.min(23, Math.max(0, horaActual)), conCortes[conCortes.length - 1] ?? 0, desde);
  return Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
}

/** La estimación de WebRTC solo se muestra si tiene sentido: sin video
 *  mandándose informa números absurdos (1.000.000 kbps). */
export function estimacionConSentido(kbps: number | null): number | null {
  return kbps !== null && kbps > 0 && kbps < 50_000 ? kbps : null;
}

/** Subida medida por debajo de esto (Mbps): no le alcanza para cámara + pantalla. */
export const SUBIDA_FLOJA_MBPS = 1.5;
/** Bajada medida por debajo de esto (Mbps): ver varias pantallas a la vez se traba. */
export const BAJADA_FLOJA_MBPS = 5;

export type Tono = "bien" | "flojo" | "sin_dato";
export function tonoSubida(mbps: number | null): Tono {
  if (mbps === null) return "sin_dato";
  return mbps < SUBIDA_FLOJA_MBPS ? "flojo" : "bien";
}
export function tonoBajada(mbps: number | null): Tono {
  if (mbps === null) return "sin_dato";
  return mbps < BAJADA_FLOJA_MBPS ? "flojo" : "bien";
}
export function tonoNC(nc: string | null): Tono {
  if (nc === "fuerte" || nc === "activa") return "bien";
  if (nc === "solo_puerta" || nc === "fallo" || nc === "no_soportada") return "flojo";
  return "sin_dato";
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** PostgREST puede mandar los numeric como texto: aquí todo queda como número. */
export function normalizarFila(r: Record<string, unknown>): FilaLlamadas {
  const horas = Array.isArray(r.horas) ? (r.horas as unknown[]).map((n) => num(n) ?? 0) : [];
  return {
    user_id: String(r.user_id ?? ""),
    nombre: (r.nombre as string | null) ?? null,
    equipo: (r.equipo as string | null) ?? null,
    cortes: num(r.cortes) ?? 0,
    graves: num(r.graves) ?? 0,
    ultimo_corte: (r.ultimo_corte as string | null) ?? null,
    horas: horas.length === 24 ? horas : Array.from({ length: 24 }, (_, h) => horas[h] ?? 0),
    causa: (r.causa as string | null) ?? null,
    causa_texto: (r.causa_texto as string | null) ?? null,
    causa_estimada: (r.causa_estimada as string | null) ?? null,
    consejo: (r.consejo as string | null) ?? null,
    subida_estimada_kbps: num(r.subida_estimada_kbps),
    rtt_ms: num(r.rtt_ms),
    perdida_pct: num(r.perdida_pct),
    nav: (r.nav as string | null) ?? null,
    nucleos: num(r.nucleos),
    prueba_subida_mbps: num(r.prueba_subida_mbps),
    prueba_bajada_mbps: num(r.prueba_bajada_mbps),
    prueba_ms: num(r.prueba_ms),
    prueba_subida_tope: r.prueba_subida_tope === true,
    prueba_at: (r.prueba_at as string | null) ?? null,
    nc: (r.nc as string | null) ?? null,
    nc_at: (r.nc_at as string | null) ?? null,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { rpc: (f: string) => Promise<{ data: any; error: { message: string } | null }> };

export function useLlamadasHoy() {
  return useQuery<FilaLlamadas[]>({
    queryKey: ["argos-llamadas-hoy"],
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await sinTipar.rpc("argos_llamadas_hoy");
      if (error) throw new Error(error.message);
      // [] es «nadie tuvo cortes»; null es que la consulta no trajo nada: fallo.
      if (!Array.isArray(data)) throw new Error("argos_llamadas_hoy no devolvió filas");
      return ordenarLlamadas((data as Record<string, unknown>[]).map(normalizarFila));
    },
  });
}

// ── CADA CORTE, EN PALABRAS (Alvaro, 18/11/2026) ─────────────────────────────
// RPC argos_llamadas_cortes_hoy (migración 20261118234000): una fila por corte
// del día con qué pasó, cuánto estuvo sin llamada y si volvió.

export type TipoCorte = "internet" | "caida" | "no_volvio" | "recarga";
export interface CorteDelDia {
  creado: string;
  tipo: TipoCorte;
  /** Segundos sin llamada; null = no se sabe. */
  duracionS: number | null;
  volvio: boolean;
}

/** El resumen de una persona: cuántos, cuánto tiempo sin llamada en total y
 *  cuánto tardaba en volver (promedio de los que se saben). */
export function resumirCortes(cortes: CorteDelDia[]): { totalS: number | null; promedioS: number | null; sabidos: number } {
  const sabidos = cortes.filter((c) => c.duracionS != null);
  if (sabidos.length === 0) return { totalS: null, promedioS: null, sabidos: 0 };
  const totalS = sabidos.reduce((s, c) => s + (c.duracionS ?? 0), 0);
  return { totalS, promedioS: Math.round(totalS / sabidos.length), sabidos: sabidos.length };
}

/** El internet en una palabra (Alvaro: «un semáforo, no números»). */
export type Semaforo = "bueno" | "flojo" | "malo" | "sin_medir";
export function semaforoInternet(f: Pick<FilaLlamadas, "prueba_subida_mbps" | "prueba_bajada_mbps" | "rtt_ms" | "perdida_pct">): Semaforo {
  const sub = f.prueba_subida_mbps, baj = f.prueba_bajada_mbps;
  if (sub == null && baj == null) return "sin_medir";
  const perdida = f.perdida_pct ?? 0;
  if ((sub != null && sub < 0.8) || perdida >= 8) return "malo";
  if (tonoSubida(sub) === "flojo" || tonoBajada(baj) === "flojo" || (f.rtt_ms ?? 0) > 250 || perdida >= 3) return "flojo";
  return "bueno";
}

export function useCortesHoy() {
  return useQuery<Map<string, CorteDelDia[]>>({
    queryKey: ["argos-llamadas-cortes-hoy"],
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: 1,
    queryFn: async () => {
      const db = supabase as unknown as { rpc: (f: string) => Promise<{ data: unknown[] | null; error: { message: string } | null }> };
      const { data, error } = await db.rpc("argos_llamadas_cortes_hoy");
      if (error) throw new Error(error.message);
      const m = new Map<string, CorteDelDia[]>();
      for (const r of (data ?? []) as Array<{ user_id: string; creado: string; tipo: TipoCorte; duracion_s: number | null; volvio: boolean }>) {
        const l = m.get(r.user_id) ?? [];
        l.push({ creado: r.creado, tipo: r.tipo, duracionS: r.duracion_s == null ? null : Number(r.duracion_s), volvio: !!r.volvio });
        m.set(r.user_id, l);
      }
      return m;
    },
  });
}
