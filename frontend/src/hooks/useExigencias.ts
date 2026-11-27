import { useEffect, useState } from "react";
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

// SOLO NAVEGADOR POR POSICIÓN (Alvaro, 26/11/2026). Finanzas trabaja en el
// navegador: no se le ofrece la app ni se le exige para Cowork o las llamadas.

/** ¿Mi posición me deja trabajar solo en el navegador? Si la base no contesta,
 *  NO (se queda como antes: se ofrece la app). Sin react-query a propósito: lo
 *  usan el aviso de la app y el bloqueo de llamadas, que viven también fuera
 *  del QueryClientProvider. Una sola consulta por pestaña (5 min). */
export function useSoloNavegador(activo = true): boolean {
  return useSoloNavegadorConEstado(activo).soloNavegador;
}

let cacheNavegador: { valor: boolean; t: number } | null = null;
let enVueloNavegador: Promise<boolean> | null = null;
function leerSoloNavegador(): Promise<boolean> {
  if (cacheNavegador && Date.now() - cacheNavegador.t < 5 * 60_000) return Promise.resolve(cacheNavegador.valor);
  if (enVueloNavegador) return enVueloNavegador;
  enVueloNavegador = (async () => {
    try {
      const { data, error } = await db.rpc("mi_solo_navegador");
      const valor = !error && data === true;
      if (!error) cacheNavegador = { valor, t: Date.now() };
      return valor;
    } catch { return false; } finally { enVueloNavegador = null; }
  })();
  return enVueloNavegador;
}
/** Para las pruebas. */
export function olvidarSoloNavegador() { cacheNavegador = null; enVueloNavegador = null; }

/** Igual, diciendo además si ya se sabe (para no bloquear y desbloquear). */
export function useSoloNavegadorConEstado(activo = true): { soloNavegador: boolean; listo: boolean } {
  const [estado, setEstado] = useState<{ soloNavegador: boolean; listo: boolean }>(() =>
    cacheNavegador ? { soloNavegador: cacheNavegador.valor, listo: true } : { soloNavegador: false, listo: false });
  useEffect(() => {
    if (!activo) return;
    let vivo = true;
    void leerSoloNavegador().then((v) => { if (vivo) setEstado({ soloNavegador: v, listo: true }); });
    return () => { vivo = false; };
  }, [activo]);
  return activo ? estado : { soloNavegador: false, listo: true };
}

export interface ModoDeTrabajo { soloNavegador: boolean; debeCowork: boolean }

/** Los interruptores de trabajo de cada puesto (solo navegador, debe estar en
 *  Cowork), por id de posición. */
export function usePosicionesModoDeTrabajo() {
  return useQuery<Record<string, ModoDeTrabajo>>({
    queryKey: ["posiciones-modo-de-trabajo"],
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("posiciones_modo_de_trabajo");
      if (error) throw new Error(error.message);
      const mapa: Record<string, ModoDeTrabajo> = {};
      for (const f of (Array.isArray(data) ? data : []) as Array<{ id: string; solo_navegador: boolean; debe_cowork: boolean }>) {
        mapa[f.id] = { soloNavegador: f.solo_navegador === true, debeCowork: f.debe_cowork !== false };
      }
      return mapa;
    },
  });
}

/** «Debe estar en Cowork» por posición (Alvaro, 27/11/2026): de ahí salen
 *  Argos «fuera de Cowork», el envío a Cowork y si se le exige la app. */
export function useGuardarDebeCowork() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { posicion: string; valor: boolean }) => {
      const { error } = await db.rpc("posicion_debe_cowork_guardar", { _posicion: v.posicion, _valor: v.valor });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["posiciones-modo-de-trabajo"] }); },
  });
}

export function useGuardarSoloNavegador() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { posicion: string; valor: boolean }) => {
      const { error } = await db.rpc("posicion_solo_navegador_guardar", { _posicion: v.posicion, _valor: v.valor });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["posiciones-modo-de-trabajo"] });
      olvidarSoloNavegador();
    },
  });
}
