import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useDondeEsta } from "@/hooks/useDondeEsta";
import { useTurnoPersonas } from "@/hooks/useTurnoPersonas";
import { armarHoyDelEquipo, type HoyDelEquipo } from "@/lib/llegadas";

// LOS CUATRO ATAJOS DEL INICIO (Alvaro, 18/11/2026): quién llegó tarde, quién
// llegó, quién va abajo en puntos y quién no está trabajando. Junta tres
// fuentes que ya existen:
//   · donde_esta_cada_uno → su horario de hoy y su estado ahora (como Presencia).
//   · cowork_tiempo_diario → a qué hora entró cada quien hoy (como el expediente).
//   · argos_dia_personas (useTurnoPersonas) → la nota del día (como el expediente).
// Un fallo se dice como fallo: nunca «nadie llegó tarde» porque algo no cargó.

type RpcDb = { rpc: (f: string, a?: unknown) => Promise<{ data: unknown[] | null; error: { message: string } | null }> };

export const hoyEnBogota = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

/** Fotos de la gente (mismo caché que Presencia). Si fallan, quedan las iniciales. */
export function useFotosDe(ids: string[]) {
  const clave = [...ids].sort().join(",");
  return useQuery<Record<string, { foto: string | null; seed: string | null }>>({
    queryKey: ["presencia-fotos", clave],
    enabled: ids.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      try {
        const { data } = await supabase.from("profiles").select("id, avatar_url, avatar_seed").in("id", ids);
        const m: Record<string, { foto: string | null; seed: string | null }> = {};
        for (const p of (data ?? []) as { id: string; avatar_url: string | null; avatar_seed: string | null }[]) {
          m[p.id] = { foto: p.avatar_url, seed: p.avatar_seed };
        }
        return m;
      } catch {
        return {};
      }
    },
  });
}

export function useHoyDelEquipo(habilitado: boolean) {
  const hoy = hoyEnBogota();
  const donde = useDondeEsta(habilitado);
  const llegadasQ = useQuery({
    enabled: habilitado,
    queryKey: ["llegadas-de-hoy", hoy],
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async (): Promise<Map<string, string>> => {
      const db = supabase as unknown as RpcDb;
      const { data, error } = await db.rpc("cowork_tiempo_diario", { _desde: hoy, _hasta: hoy, _user_id: null, _limit: 1000, _offset: 0 });
      if (error) throw new Error(error.message);
      const m = new Map<string, string>();
      for (const f of (data ?? []) as Array<{ user_id: string; primer_ingreso: string | null }>) {
        if (!f.primer_ingreso) continue;
        const antes = m.get(f.user_id);
        if (!antes || Date.parse(f.primer_ingreso) < Date.parse(antes)) m.set(f.user_id, f.primer_ingreso);
      }
      return m;
    },
  });
  const notasQ = useTurnoPersonas(hoy, 0, 24, habilitado);

  const datos: HoyDelEquipo | null = useMemo(() => {
    if (!donde.data || !llegadasQ.data) return null;
    const notas = new Map(notasQ.personas.map((p) => [p.userId, p.nota.valor]));
    return armarHoyDelEquipo(donde.data, llegadasQ.data, notas);
  }, [donde.data, llegadasQ.data, notasQ.personas]);

  const fotos = useFotosDe((donde.data ?? []).map((f) => f.user_id)).data ?? {};

  return {
    datos,
    fotos,
    cargando: donde.isLoading || llegadasQ.isLoading,
    cargandoNotas: notasQ.cargando,
    fallo: donde.isError || llegadasQ.isError,
    falloNotas: !!notasQ.error,
    reintentar: () => { void donde.refetch(); void llegadasQ.refetch(); },
  };
}
