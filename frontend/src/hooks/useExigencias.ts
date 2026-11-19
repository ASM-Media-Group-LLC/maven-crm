import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// CÁMARA Y PANTALLA POR PUESTO (Alvaro, 19/11/2026): cada puesto pide cámara y
// pantalla por separado; Argos va con la pantalla. Lo cambia el dueño (todos los
// puestos) o quien tenga N:camara_pantalla.decidir (todos menos Admin, Dueño y
// el suyo). Las salas de Cowork ya no apagan ninguna de las dos.
// Un fallo es un fallo: se dice, nunca «no hay puestos».

type RpcDb = { rpc: (f: string, a?: unknown) => Promise<{ data: unknown; error: { message: string } | null }> };
const db = supabase as unknown as RpcDb;

export interface MisExigencias { camara: boolean; pantalla: boolean }

/** Lo que MI puesto me pide. Si la base no contesta, se pide todo (como antes). */
export function useMisExigencias() {
  return useQuery<MisExigencias>({
    queryKey: ["mis-exigencias"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("mis_exigencias");
      if (error) throw new Error(error.message);
      const fila = (Array.isArray(data) ? data[0] : data) as Partial<MisExigencias> | null;
      return { camara: fila?.camara !== false, pantalla: fila?.pantalla !== false };
    },
  });
}

export type MotivoBloqueo = "sin_funcion" | "dueno" | "admin" | "propio" | null;

export interface PuestoExigencias {
  id: string;
  nombre: string;
  pide_camara: boolean;
  pide_pantalla: boolean;
  personas: number;
  puede_cambiar: boolean;
  motivo: MotivoBloqueo;
}

export interface CambioExigencias {
  id: string;
  created_at: string;
  tipo: "puesto" | "persona";
  actor: string;
  puesto: string | null;
  persona: string | null;
  puesto_antes: string | null;
  puesto_despues: string | null;
  camara_antes: boolean;
  camara_despues: boolean;
  pantalla_antes: boolean;
  pantalla_despues: boolean;
  afectados: number;
}

export interface ExigenciasEmpresa { puestos: PuestoExigencias[]; cambios: CambioExigencias[] }

export function useExigenciasPorPuesto() {
  return useQuery<ExigenciasEmpresa>({
    queryKey: ["exigencias-por-puesto"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("exigencias_por_puesto");
      if (error) throw new Error(error.message);
      const d = (data ?? {}) as Partial<ExigenciasEmpresa>;
      return { puestos: d.puestos ?? [], cambios: d.cambios ?? [] };
    },
  });
}

export function useGuardarExigencias() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { posicion: string; camara: boolean; pantalla: boolean }) => {
      const { error } = await db.rpc("posicion_exigencias_guardar", {
        _posicion: v.posicion, _camara: v.camara, _pantalla: v.pantalla,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["exigencias-por-puesto"] });
      void qc.invalidateQueries({ queryKey: ["mis-exigencias"] });
    },
  });
}

/** ¿Qué se movió? Para la línea del historial. */
export function cambiosDe(c: Pick<CambioExigencias, "camara_antes" | "camara_despues" | "pantalla_antes" | "pantalla_despues">): {
  quita: Array<"camara" | "pantalla">; pide: Array<"camara" | "pantalla">;
} {
  const quita: Array<"camara" | "pantalla"> = [];
  const pide: Array<"camara" | "pantalla"> = [];
  if (c.camara_antes && !c.camara_despues) quita.push("camara");
  if (!c.camara_antes && c.camara_despues) pide.push("camara");
  if (c.pantalla_antes && !c.pantalla_despues) quita.push("pantalla");
  if (!c.pantalla_antes && c.pantalla_despues) pide.push("pantalla");
  return { quita, pide };
}
