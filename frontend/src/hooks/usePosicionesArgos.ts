import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  mapaDePosiciones, type AsignacionBorrador, type MarcaBorrador, type PosicionBorrador, type PosicionDe,
} from "@/lib/posicionesArgos";

// Las posiciones nuevas (borrador de Ajustes › Posiciones) para agrupar Argos ›
// Jornada. Solo el dueño las lee (RLS es_dueno): para cualquier otro, o si algo
// falla, devuelve null y Jornada sigue con los equipos de siempre — un fallo
// nunca deja a nadie sin ver su gente.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export function usePosicionesArgos(habilitado: boolean): Map<string, PosicionDe> | null {
  const q = useQuery({
    enabled: habilitado,
    queryKey: ["argos-posiciones-borrador"],
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, PosicionDe> | null> => {
      const [pos, asig, marcas] = await Promise.all([
        sinTipar.from("posiciones_borrador").select("id, nombre, orden, activa, pide_camara, pide_pantalla"),
        sinTipar.from("posiciones_borrador_personas").select("user_id, posicion_id"),
        sinTipar.from("personas_borrador_marcas").select("user_id, deshabilitada"),
      ]);
      if (pos.error || asig.error || marcas.error) return null;
      const lista = (pos.data ?? []) as PosicionBorrador[];
      if (lista.length === 0) return null;
      return mapaDePosiciones(lista, (asig.data ?? []) as AsignacionBorrador[], (marcas.data ?? []) as MarcaBorrador[]);
    },
  });
  return habilitado ? q.data ?? null : null;
}
