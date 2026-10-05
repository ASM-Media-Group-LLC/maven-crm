import { createContext, useContext, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { CAMPOS_FICHA, type CampoFicha, type Ficha } from "@/lib/portal/ficha";

// El portal de creadoras: lo que ve ELLA. Todo pasa por funciones de la base que
// solo devuelven lo suyo (portal_mis_agencias, portal_mi_ficha,
// portal_guardar_ficha, portal_hola: 20261006100000). La tabla creators le está
// cerrada.

/** Una ficha suya: una por agencia con la que trabaja. */
export interface FichaDeAgencia {
  creator_id: string;
  tenant_id: string;
  agencia: string;
  nombre: string;
  nombre_artistico: string | null;
  foto: string | null;
}

export const nombreParaMostrar = (f: Pick<FichaDeAgencia, "nombre" | "nombre_artistico">) =>
  f.nombre_artistico?.trim() || f.nombre.split(" ")[0] || f.nombre;

export function useMisFichas(uid: string | null) {
  return useQuery({
    queryKey: ["portal", "fichas", uid],
    enabled: !!uid,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("portal_mis_agencias" as never);
      if (error) throw error;
      return (data ?? []) as unknown as FichaDeAgencia[];
    },
  });
}

// La agencia elegida se recuerda en ESTE navegador (es solo una comodidad: si no
// se puede leer, se usa la primera).
const CLAVE_ACTIVA = "portal.ficha-activa";
export function leerFichaActiva(): string | null {
  try {
    return localStorage.getItem(CLAVE_ACTIVA);
  } catch {
    return null;
  }
}
export function guardarFichaActiva(id: string): void {
  try {
    localStorage.setItem(CLAVE_ACTIVA, id);
  } catch {
    // Modo privado o almacenamiento bloqueado: se elige de nuevo la próxima vez.
  }
}

export interface PortalCtx {
  fichas: FichaDeAgencia[];
  activa: FichaDeAgencia;
  elegir: (creatorId: string) => void;
}
export const PortalContext = createContext<PortalCtx | null>(null);

export function usePortal(): PortalCtx {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error("usePortal va dentro de PortalLayout");
  return ctx;
}

const fichaVacia = (): Ficha => Object.fromEntries(CAMPOS_FICHA.map((c) => [c, null])) as Ficha;

/** Lo que devuelve la base, con las 22 claves siempre presentes. */
export function normalizarFicha(crudo: unknown): Ficha {
  const ficha = fichaVacia();
  if (crudo && typeof crudo === "object") {
    for (const c of CAMPOS_FICHA) {
      const v = (crudo as Record<string, unknown>)[c];
      ficha[c] = typeof v === "string" ? v : null;
    }
  }
  return ficha;
}

export function useMiFicha(creatorId: string | undefined) {
  return useQuery({
    queryKey: ["portal", "ficha", creatorId],
    enabled: !!creatorId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("portal_mi_ficha" as never, { p_creator: creatorId } as never);
      if (error) throw error;
      return normalizarFicha(data);
    },
  });
}

export function useGuardarFicha(creatorId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cambios: Partial<Record<CampoFicha, string>>) => {
      const { data, error } = await supabase.rpc(
        "portal_guardar_ficha" as never,
        { p_creator: creatorId, p_cambios: cambios } as never,
      );
      if (error) throw error;
      return normalizarFicha(data);
    },
    onSuccess: (ficha) => {
      qc.setQueryData(["portal", "ficha", creatorId], ficha);
    },
  });
}

/** «Entró»: para que la agencia vea cuándo usó el portal por última vez. La base
 *  escribe como mucho cada 5 minutos; si falla, no pasa nada. */
export function usePortalHola(creatorId: string | undefined) {
  useEffect(() => {
    if (!creatorId) return;
    void supabase.rpc("portal_hola" as never, { p_creator: creatorId } as never);
  }, [creatorId]);
}
