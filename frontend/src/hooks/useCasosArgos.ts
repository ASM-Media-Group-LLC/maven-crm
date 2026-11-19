import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { urlsDelBuzon } from "@/hooks/useMonitorEventos";
import type { CasoArgos, DiaConCasos, FuncionesCasos, ReporteRrhh, Veredicto } from "@/lib/casosArgos";

// Revisión de RR. HH. (19/11/2026). Todo pasa por funciones de la base que ya
// filtran quién ve a quién y qué puede hacer según su puesto. Un fallo es un
// fallo: se dice y se ofrece reintentar, nunca «no hay casos».

type RpcDb = { rpc: (f: string, a?: unknown) => Promise<{ data: unknown; error: { message: string } | null }> };
const db = supabase as unknown as RpcDb;

export function useFuncionesCasos() {
  const { user } = useAuth();
  return useQuery<FuncionesCasos>({
    enabled: !!user?.id,
    queryKey: ["casos-funciones", user?.id ?? null],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("mis_funciones_casos");
      if (error) throw new Error(error.message);
      return data as FuncionesCasos;
    },
  });
}

export function useDiasConCasos(habilitado = true) {
  return useQuery<DiaConCasos[]>({
    enabled: habilitado,
    queryKey: ["casos-dias"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("argos_casos_dias");
      if (error) throw new Error(error.message);
      return (data ?? []) as DiaConCasos[];
    },
  });
}

export function useCasosDelDia(dia: string | null) {
  return useQuery<CasoArgos[]>({
    enabled: !!dia,
    queryKey: ["casos-del-dia", dia],
    staleTime: 20_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("argos_casos_del_dia", { _dia: dia });
      if (error) throw new Error(error.message);
      return (data ?? []) as CasoArgos[];
    },
  });
}

/** Un caso. `null` = no existe o no tiene acceso (distinto de un error). */
export function useCaso(id: string | null | undefined) {
  return useQuery<CasoArgos | null>({
    enabled: !!id,
    queryKey: ["caso", id],
    staleTime: 20_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("argos_caso", { _id: id });
      if (error) throw new Error(error.message);
      return (data ?? null) as CasoArgos | null;
    },
  });
}

export function useReporteRrhh(dia: string | null) {
  return useQuery<ReporteRrhh>({
    enabled: !!dia,
    queryKey: ["reporte-rrhh", dia],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("argos_reporte_rrhh", { _dia: dia });
      if (error) throw new Error(error.message);
      return data as ReporteRrhh;
    },
  });
}

export interface BloqueoCasos { debe: boolean; pendientes: number; total: number }

/** ¿Le toca el cartel que no se quita? Si la consulta falla, NO se bloquea a nadie. */
export function useCasosBloqueo() {
  const { user } = useAuth();
  return useQuery<BloqueoCasos | null>({
    enabled: !!user?.id,
    queryKey: ["casos-bloqueo", user?.id ?? null],
    staleTime: 30_000,
    refetchInterval: 120_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await db.rpc("argos_casos_bloqueo");
      if (error) return null;
      const fila = (Array.isArray(data) ? data[0] : data) as BloqueoCasos | undefined;
      return fila ?? null;
    },
  });
}

export function useJuzgarCaso() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, veredicto, frase }: { id: string; veredicto: Veredicto; frase: string }) => {
      const { error } = await db.rpc("argos_caso_juzgar", { _id: id, _veredicto: veredicto, _frase: frase.trim() });
      if (error) throw new Error(error.message);
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ["casos-del-dia"] });
      void qc.invalidateQueries({ queryKey: ["casos-dias"] });
      void qc.invalidateQueries({ queryKey: ["casos-bloqueo"] });
      void qc.invalidateQueries({ queryKey: ["reporte-rrhh"] });
      void qc.invalidateQueries({ queryKey: ["caso", v.id] });
    },
  });
}

/** URLs firmadas de las fotos de un caso (una hora). Mapa { ruta: url }. */
export function useFotosCaso(paths: string[]) {
  const clave = [...paths].sort().join("|");
  return useQuery<Record<string, string>>({
    enabled: paths.length > 0,
    queryKey: ["casos-fotos", clave],
    staleTime: 30 * 60_000,
    queryFn: () => urlsDelBuzon(paths),
  });
}
