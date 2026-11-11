import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// DÓNDE ESTÁ CADA UNO (Alvaro, 10/11/2026: «necesito saber dónde está el
// empleado en todo momento»). Una fila por empleado (sin admins): en qué estado
// está ahora (en Cowork, sin pantalla, fuera de Cowork en su turno, no ha
// entrado, fuera de turno…), qué tenía en pantalla según la última captura que
// leyó la IA y cuántas veces se salió hoy. RPC donde_esta_cada_uno: dueño,
// admins y RR. HH. ven a todos; un supervisor, a su equipo.

export type EstadoDondeEsta =
  | "activo" | "pausa" | "meet" | "en_llamada" | "sin_pantalla" | "sin_camara" | "fuera_de_camara"
  | "sin_conexion" | "sin_conexion_larga" | "fuera_de_cowork" | "no_ha_entrado" | "fuera_de_turno";

export interface FilaDondeEsta {
  user_id: string;
  nombre: string | null;
  puesto: string | null;
  equipo: string | null;
  entrada: string | null;
  salida: string | null;
  en_turno: boolean;
  estado: EstadoDondeEsta | string;
  estado_desde: string | null;
  ultimo_latido: string | null;
  pantalla_at: string | null;
  pantalla_que: string | null;
  pantalla_fuera_de_lugar: boolean | null;
  captura_at: string | null;
  fuera_hoy_veces: number;
  fuera_hoy_min: number;
  exento: boolean;
}

/** Qué tan urgente es cada estado: arriba lo que hay que mirar ya. */
export const ORDEN_ESTADO: Record<string, number> = {
  fuera_de_cowork: 0, no_ha_entrado: 1, sin_pantalla: 2, sin_conexion_larga: 3, sin_conexion: 4,
  sin_camara: 5, fuera_de_camara: 6, pausa: 7, meet: 8, en_llamada: 8, activo: 9, fuera_de_turno: 10,
};

export type Tono = "rojo" | "naranja" | "neutro" | "verde" | "gris";
export function tonoDe(estado: string): Tono {
  if (estado === "fuera_de_cowork" || estado === "no_ha_entrado") return "rojo";
  if (["sin_pantalla", "sin_camara", "fuera_de_camara", "sin_conexion", "sin_conexion_larga"].includes(estado)) return "naranja";
  if (estado === "pausa" || estado === "meet" || estado === "en_llamada") return "neutro";
  if (estado === "activo") return "verde";
  return "gris";
}

/** «Infloww / OnlyFans · Redactando un mensaje masivo» → app y qué hace. */
export function separarPantalla(veredicto: string | null | undefined): { app: string | null; que: string | null } {
  const v = (veredicto ?? "").trim();
  if (!v) return { app: null, que: null };
  const i = v.indexOf(" · ");
  if (i < 0) return { app: null, que: v };
  return { app: v.slice(0, i).trim() || null, que: v.slice(i + 3).trim() || null };
}

/** En el orden del tablero: urgencia, después nombre. */
export function ordenarFilas(filas: FilaDondeEsta[]): FilaDondeEsta[] {
  return [...filas].sort((a, b) =>
    (ORDEN_ESTADO[a.estado] ?? 99) - (ORDEN_ESTADO[b.estado] ?? 99)
    || (a.nombre ?? "").localeCompare(b.nombre ?? "", "es"));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { rpc: (f: string) => Promise<{ data: any; error: { message: string } | null }> };

export function useDondeEsta() {
  return useQuery<FilaDondeEsta[]>({
    queryKey: ["donde-esta-cada-uno"],
    refetchInterval: 20_000,
    staleTime: 10_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await sinTipar.rpc("donde_esta_cada_uno");
      if (error) throw new Error(error.message);
      return ordenarFilas(((data ?? []) as FilaDondeEsta[]).map((f) => ({
        ...f, fuera_hoy_veces: Number(f.fuera_hoy_veces ?? 0), fuera_hoy_min: Number(f.fuera_hoy_min ?? 0),
      })));
    },
  });
}
