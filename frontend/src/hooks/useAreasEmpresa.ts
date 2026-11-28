import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ÁREAS DE LA EMPRESA (Alvaro, 28/11/2026): «verlo por posiciones… o por
// departamento… que sea escalable para otras empresas». Cada empresa crea sus
// áreas (Ajustes → Empresa) y cada posición elige la suya. Sirven para filtrar
// Shift. Ver la migración 20261128065835_areas_de_la_empresa.sql.

type RpcDb = { rpc: (f: string, a?: unknown) => Promise<{ data: unknown; error: { message: string } | null }> };
const db = supabase as unknown as RpcDb;

export interface AreaEmpresa { id: string; nombre: string; puestos: number }
export interface PuestoArea { id: string; nombre: string; area_id: string | null; personas: number }
export interface AreasEmpresa { puede_editar: boolean; areas: AreaEmpresa[]; puestos: PuestoArea[] }
export interface PosicionDePersona { user_id: string; posicion_id: string; posicion: string; area_id: string | null; area: string | null }

export const CLAVE_AREAS = ["areas-empresa"] as const;

export function useAreasEmpresa() {
  return useQuery<AreasEmpresa>({
    queryKey: CLAVE_AREAS,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("areas_de_mi_empresa");
      if (error) throw new Error(error.message);
      return data as AreasEmpresa;
    },
  });
}

/** Las posiciones (y su área) de cada persona. Quien tiene dos sale en las dos. */
export function usePosicionesDeLaGente(ids: string[]) {
  return useQuery<Map<string, PosicionDePersona[]>>({
    enabled: ids.length > 0,
    queryKey: ["posiciones-de-la-gente", [...ids].sort().join(",")],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("posiciones_de_la_gente", { _ids: ids });
      if (error) throw new Error(error.message);
      const m = new Map<string, PosicionDePersona[]>();
      for (const x of (data ?? []) as PosicionDePersona[]) m.set(x.user_id, [...(m.get(x.user_id) ?? []), x]);
      return m;
    },
  });
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: CLAVE_AREAS });
    void qc.invalidateQueries({ queryKey: ["posiciones-de-la-gente"] });
  };
}

export function useGuardarArea() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (x: { id: string | null; nombre: string }) => {
      const { error } = await db.rpc("area_empresa_guardar", { _id: x.id, _nombre: x.nombre.trim() });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidar,
  });
}

export function useBorrarArea() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.rpc("area_empresa_borrar", { _id: id });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidar,
  });
}

export function useGuardarAreaPuesto() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (x: { posicion: string; area: string | null }) => {
      const { error } = await db.rpc("posicion_area_guardar", { _posicion: x.posicion, _area: x.area });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidar,
  });
}
