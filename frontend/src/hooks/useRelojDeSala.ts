import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { RelojDeRespaldo } from "@/lib/coworkOcupacion";

/**
 * Reloj de respaldo para el tablero del supervisor: lo que el latido dejó en la
 * base, por persona. Se consulta cada 30 s —el mismo ritmo del latido— y solo
 * mientras el tablero está a la vista. Ver lib/coworkOcupacion.ts.
 */
export function useRelojDeSala(sessionId: string | undefined, activo = true) {
  const [filas, setFilas] = useState<Record<string, RelojDeRespaldo>>({});

  useEffect(() => {
    if (!sessionId || !activo) return;
    let cancelado = false;
    const db = supabase as unknown as {
      rpc: (f: string, a: unknown) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
    };
    const leer = async () => {
      const { data, error } = await db.rpc("cowork_reloj_de_sala", { _session_id: sessionId });
      if (cancelado || error || !data) return;
      const mapa: Record<string, RelojDeRespaldo> = {};
      for (const f of data as Array<RelojDeRespaldo & { user_id: string }>) mapa[f.user_id] = f;
      setFilas(mapa);
    };
    void leer();
    const id = window.setInterval(() => { void leer(); }, 30_000);
    return () => { cancelado = true; window.clearInterval(id); };
  }, [sessionId, activo]);

  return filas;
}
