import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// MODALIDADES DE PAUSA (Alvaro, 19/11/2026): cada empresa define las suyas
// (almuerzo + baño); el puesto trae una y a una persona se le puede poner otra.
// Quién puede qué lo decide la base (puede_gestionar_a, N:pausas.modalidades).
// Un fallo es un fallo: se dice, nunca «no hay modalidades».

type RpcDb = { rpc: (f: string, a?: unknown) => Promise<{ data: unknown; error: { message: string } | null }> };
const db = supabase as unknown as RpcDb;

export interface Modalidad { id: string; nombre: string; comida_min: number; bano_min: number; activa: boolean; personas: number; puestos: number }
export interface ModalidadesEmpresa { puede_editar: boolean; modalidades: Modalidad[] }
export interface PausaDePersona {
  user_id: string;
  modalidad_id: string | null;
  modalidad: string | null;
  comida_min: number;
  bano_min: number;
  origen: "persona" | "puesto" | "base";
  puede_cambiar: boolean;
}

export function useModalidades() {
  return useQuery<ModalidadesEmpresa>({
    queryKey: ["pausas-modalidades"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("pausas_modalidades_de_mi_empresa");
      if (error) throw new Error(error.message);
      return data as ModalidadesEmpresa;
    },
  });
}

export function usePausasDelEquipo() {
  return useQuery<Map<string, PausaDePersona>>({
    queryKey: ["pausas-del-equipo"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("pausas_del_equipo");
      if (error) throw new Error(error.message);
      return new Map(((data ?? []) as PausaDePersona[]).map((p) => [p.user_id, p]));
    },
  });
}

export function useAsignarPausa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, modalidadId }: { userId: string; modalidadId: string | null }) => {
      const { error } = await db.rpc("pausas_asignar", { _user_id: userId, _modalidad_id: modalidadId });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["pausas-del-equipo"] });
      void qc.invalidateQueries({ queryKey: ["pausas-modalidades"] });
      void qc.invalidateQueries({ queryKey: ["mi-turno"] });
    },
  });
}

export function useGuardarModalidad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: { id: string | null; nombre: string; comida_min: number; bano_min: number; activa: boolean }) => {
      const { error } = await db.rpc("pausas_modalidad_guardar", {
        _id: m.id, _nombre: m.nombre.trim(), _comida: m.comida_min, _bano: m.bano_min, _activa: m.activa,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["pausas-modalidades"] });
      void qc.invalidateQueries({ queryKey: ["pausas-del-equipo"] });
    },
  });
}

/** «30 + 10 min» para mostrar. */
export function textoModalidad(comida: number, bano: number): string {
  return `${comida} + ${bano} min`;
}
