import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// TURNOS DE LA EMPRESA (Alvaro, 27/11/2026): «aquí el AM es de 8 a 4, de 4 a 12
// el PM y la madrugada el resto… que todo sea muy personalizable para cada
// puesto». Cada empresa define su lista (Ajustes → Empresa), cada puesto trae
// uno por defecto y cada persona puede tener el suyo (Horarios del equipo).
// El turno de alguien: el suyo → el de su puesto. Ver la migración
// 20261127200000_turnos_de_la_empresa.sql. Un fallo es un fallo.

type RpcDb = { rpc: (f: string, a?: unknown) => Promise<{ data: unknown; error: { message: string } | null }> };
const db = supabase as unknown as RpcDb;

export interface TurnoEmpresa { id: string; nombre: string; entrada: string; salida: string; activa: boolean; puestos: number; personas: number }
export interface PuestoTurno { id: string; nombre: string; turno_id: string | null; puede: boolean; personas: number }
/** Alguien con varios puestos de turnos distintos y sin turno propio (se usa el del primer puesto). */
export interface ConflictoTurno { user_id: string; nombre: string; usa: string; puestos: Array<{ puesto: string; turno: string }> }
export interface TurnosEmpresa { puede_editar: boolean; turnos: TurnoEmpresa[]; puestos: PuestoTurno[]; conflictos?: ConflictoTurno[] }
export interface TurnoDePersona { user_id: string; turno_id: string; nombre: string; entrada: string; salida: string; origen: "persona" | "puesto" }

export const CLAVE_TURNOS = ["turnos-empresa"] as const;

export function useTurnosEmpresa(habilitado = true) {
  return useQuery<TurnosEmpresa>({
    enabled: habilitado,
    queryKey: CLAVE_TURNOS,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("turnos_de_mi_empresa");
      if (error) throw new Error(error.message);
      return data as TurnosEmpresa;
    },
  });
}

/** El turno de cada persona (el suyo o el de su puesto). */
export function useTurnosDeLaGente(ids: string[]) {
  return useQuery<Map<string, TurnoDePersona>>({
    enabled: ids.length > 0,
    queryKey: ["turnos-de-la-gente", [...ids].sort().join(",")],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("turnos_de_la_gente", { _ids: ids });
      if (error) throw new Error(error.message);
      return new Map(((data ?? []) as TurnoDePersona[]).map((x) => [x.user_id, x]));
    },
  });
}

function useInvalidar() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: CLAVE_TURNOS });
    void qc.invalidateQueries({ queryKey: ["turnos-de-la-gente"] });
    void qc.invalidateQueries({ queryKey: ["horarios-del-equipo"] });
    void qc.invalidateQueries({ queryKey: ["argos-turno-tabla"] });
  };
}

export function useGuardarTurno() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (x: { id: string | null; nombre: string; entrada: string; salida: string; activa: boolean }) => {
      const { error } = await db.rpc("turno_empresa_guardar", {
        _id: x.id, _nombre: x.nombre.trim(), _entrada: x.entrada, _salida: x.salida, _activa: x.activa,
      });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidar,
  });
}

export function useGuardarTurnoPuesto() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (x: { posicion: string; turno: string | null }) => {
      const { error } = await db.rpc("posicion_turno_guardar", { _posicion: x.posicion, _turno: x.turno });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidar,
  });
}

export function useGuardarTurnoPersona() {
  const invalidar = useInvalidar();
  return useMutation({
    mutationFn: async (x: { userId: string; turno: string | null }) => {
      const { error } = await db.rpc("persona_turno_guardar", { _uid: x.userId, _turno: x.turno });
      if (error) throw new Error(error.message);
    },
    onSuccess: invalidar,
  });
}

/** ¿La hora «HH:MM» cae dentro del turno? (los que cruzan la medianoche también). */
export function horaEnTurno(hhmm: string, t: { entrada: string; salida: string }): boolean {
  const m = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
  const h = m(hhmm), e = m(t.entrada), s = m(t.salida);
  return e < s ? h >= e && h < s : h >= e || h < s;
}
