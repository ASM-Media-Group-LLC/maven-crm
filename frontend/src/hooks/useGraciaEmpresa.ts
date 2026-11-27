import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// GRACIA DE CÁMARA Y PANTALLA (Alvaro, 27/11/2026): un bolsillo de minutos por
// turno para estar sin cámara o sin pantalla. La empresa pone su número (10 por
// defecto) y cada Posición puede tener otro. Lo usa la base para el pago
// (argos_gracia_calculo) y la tabla del turno para las horas trabajadas.

type RpcDb = { rpc: (f: string, a?: unknown) => Promise<{ data: unknown; error: { message: string } | null }> };
const db = supabase as unknown as RpcDb;

export interface GraciaEmpresa {
  minutos: number;
  puede_cambiar: boolean;
  /** Puestos con un número propio: id → minutos. */
  puestos: Record<string, number>;
}

export function useGraciaEmpresa() {
  return useQuery<GraciaEmpresa>({
    queryKey: ["gracia-empresa"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await db.rpc("gracia_de_mi_empresa");
      if (error) throw new Error(error.message);
      const d = (data ?? {}) as Partial<GraciaEmpresa>;
      return { minutos: Number(d.minutos ?? 10), puede_cambiar: d.puede_cambiar === true, puestos: d.puestos ?? {} };
    },
  });
}

export function useGuardarGracia() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (x: { posicion: string | null; minutos: number | null }) => {
      const { error } = x.posicion
        ? await db.rpc("posicion_gracia_guardar", { _posicion: x.posicion, _minutos: x.minutos })
        : await db.rpc("gracia_empresa_guardar", { _minutos: x.minutos });
      if (error) throw new Error(error.message);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ["gracia-empresa"] }); },
  });
}

/** Valida lo escrito: entero de 0 a 240, o vacío (solo en un puesto = usar el de la empresa). */
export function minutosValidos(texto: string, permiteVacio: boolean): number | null | "mal" {
  const s = texto.trim();
  if (!s) return permiteVacio ? null : "mal";
  if (!/^\d{1,3}$/.test(s)) return "mal";
  const n = Number(s);
  return n >= 0 && n <= 240 ? n : "mal";
}
