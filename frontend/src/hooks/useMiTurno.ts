import { useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { calcularEnTurno, marcarEnTurno } from "@/lib/turnoActivo";

// MI TURNO (Marcar entrada / Pausa / Salida, 19/11/2026): lo que dice la base
// (mi_turno) y las acciones. Un fallo de red no apaga nada: se queda como estaba.

type RpcDb = { rpc: (f: string, a?: unknown) => Promise<{ data: unknown; error: { message: string } | null }> };
const db = supabase as unknown as RpcDb;

export interface MiTurno {
  aplica: boolean;
  obligatorio: boolean;
  obligatorio_desde: string | null;
  abierta: boolean;
  marca_inicio: string | null;
  sigue_hasta: string | null;
  turno_inicio: string | null;
  turno_fin: string | null;
  puede_desde: string | null;
  puede: boolean;
  horario_confirmado: boolean;
  terminos_ok: boolean;
  en_pausa: boolean;
  pausa_desde: string | null;
  pausa_kind: string | null;
  pausa_usada_seg: number;
  cupo_seg: number;
}

export const VERSION_TERMINOS = 1;

export function useMiTurno() {
  const { user } = useAuth();
  const q = useQuery<MiTurno | null>({
    enabled: !!user?.id,
    queryKey: ["mi-turno", user?.id ?? null],
    staleTime: 15_000,
    refetchInterval: 30_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await db.rpc("mi_turno");
      if (error) throw new Error(error.message);
      const fila = (Array.isArray(data) ? data[0] : data) as MiTurno | undefined;
      return fila ?? null;
    },
  });
  // La bandera que leen capturas, llamados y la pantalla de Cowork: la misma
  // regla que el servidor (calcularEnTurno). Se recalcula cada 30 s porque el
  // horario se acaba solo, sin que cambien los datos. Si no hay datos (cargando
  // o falló), no se toca: el candado real lo tiene el servidor.
  useEffect(() => {
    const t = q.data;
    if (!t) return;
    const aplicar = () => marcarEnTurno(calcularEnTurno(t, Date.now()));
    aplicar();
    const id = window.setInterval(aplicar, 30_000);
    return () => window.clearInterval(id);
  }, [q.data]);
  return q;
}

export function useAccionesTurno() {
  const qc = useQueryClient();
  const refrescar = () => { void qc.invalidateQueries({ queryKey: ["mi-turno"] }); };
  const entrar = useMutation({
    mutationFn: async ({ aceptarTerminos }: { aceptarTerminos: boolean }) => {
      if (aceptarTerminos) {
        const r = await db.rpc("turno_aceptar_terminos", { _version: VERSION_TERMINOS });
        if (r.error) throw new Error(r.error.message);
      }
      const { error } = await db.rpc("turno_entrar");
      if (error) throw new Error(error.message.replace(/^turno_entrar: /, ""));
    },
    onSuccess: () => { marcarEnTurno(true); refrescar(); },
  });
  const salir = useMutation({
    mutationFn: async (cierre: "manual" | "olvido" = "manual") => {
      const { error } = await db.rpc("turno_salir", { _cierre: cierre });
      if (error) throw new Error(error.message);
    },
    onSuccess: refrescar,
  });
  const sigo = useMutation({
    mutationFn: async () => {
      const { error } = await db.rpc("turno_sigo");
      if (error) throw new Error(error.message);
    },
    onSuccess: refrescar,
  });
  return { entrar, salir, sigo, refrescar };
}
