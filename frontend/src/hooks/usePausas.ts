import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// MODALIDADES DE PAUSA (Alvaro, 19/11/2026): cada empresa define las suyas
// (almuerzo + baño) en Ajustes → Empresa; cada PUESTO trae una y la pausa de una
// persona sale solo de su puesto («nada a mano, todo en los roles»). Quién
// configura la empresa lo decide la función del puesto N:empresa.configurar.
// Un fallo es un fallo: se dice, nunca «no hay modalidades».

type RpcDb = { rpc: (f: string, a?: unknown) => Promise<{ data: unknown; error: { message: string } | null }> };
const db = supabase as unknown as RpcDb;

export interface Modalidad {
  id: string; nombre: string; comida_min: number; bano_min: number; activa: boolean; personas: number; puestos: number;
  /** Hora de comida del plan («12:00»), o null si el plan no pone hora. */
  comida_hora?: string | null;
  /** Obligatoria (con margen) o solo recomendada (un recordatorio). */
  comida_obligatoria?: boolean;
  comida_margen_min?: number;
}
export interface ModalidadesEmpresa { puede_editar: boolean; modalidades: Modalidad[] }
export interface PausaDePersona {
  user_id: string;
  modalidad_id: string | null;
  modalidad: string | null;
  comida_min: number;
  bano_min: number;
  origen: "puesto" | "base";
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

export function useGuardarModalidad() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (m: { id: string | null; nombre: string; comida_min: number; bano_min: number; activa: boolean; hora: string | null; obligatoria: boolean; margen: number }) => {
      const { error } = await db.rpc("pausas_modalidad_guardar", {
        _id: m.id, _nombre: m.nombre.trim(), _comida: m.comida_min, _bano: m.bano_min, _activa: m.activa,
        _hora: m.hora, _obligatoria: m.obligatoria, _margen: m.margen,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["pausas-modalidades"] });
      void qc.invalidateQueries({ queryKey: ["pausas-del-equipo"] });
    },
  });
}

/** ¿Puede entrar a Ajustes → Empresa? (dueño o función del puesto). Un fallo = no. */
export function usePuedoConfigurarEmpresa() {
  return useQuery<boolean>({
    queryKey: ["puedo-configurar-empresa"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("puedo_configurar_empresa");
      if (error) return false;
      return data === true;
    },
  });
}

/** «30 + 10 min» para mostrar. */
export function textoModalidad(comida: number, bano: number): string {
  return `${comida} + ${bano} min`;
}

/** La pausa pagada que trae MI puesto (almuerzo + baño). null = sin dato: el
 *  texto queda general, nunca un número inventado. */
export function useMiPausa(uid: string | null | undefined) {
  return useQuery<{ comida: number; bano: number } | null>({
    queryKey: ["mi-pausa", uid],
    enabled: !!uid,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("argos_pausas_de", { _uid: uid });
      if (error) throw new Error(error.message);
      const f = (Array.isArray(data) ? data[0] : data) as { comida_min?: unknown; bano_min?: unknown } | null;
      if (!f) return null;
      const comida = Number(f.comida_min), bano = Number(f.bano_min);
      return Number.isFinite(comida) && Number.isFinite(bano) ? { comida, bano } : null;
    },
  });
}

// HORA DE COMIDA (Alvaro, 27/11/2026): la del plan o la que RR. HH. le puso a
// la persona. Cada empresa decide si es recomendada (recordatorio) u
// obligatoria (con margen; fuera de él, Argos lo anota).
export interface ComidaDePersona {
  user_id: string;
  hora: string | null;
  obligatoria: boolean;
  margen_min: number;
  origen: "persona" | "plan" | "ninguna";
  hora_plan: string | null;
}

export function useComidasDelEquipo() {
  return useQuery<Map<string, ComidaDePersona>>({
    queryKey: ["comidas-del-equipo"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("comidas_del_equipo");
      if (error) throw new Error(error.message);
      return new Map(((data ?? []) as ComidaDePersona[]).map((c) => [c.user_id, c]));
    },
  });
}

export function useGuardarComidaPersona() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { uid: string; hora: string | null }) => {
      const { error } = await db.rpc("comida_persona_guardar", { _uid: v.uid, _hora: v.hora });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["comidas-del-equipo"] }); },
  });
}
