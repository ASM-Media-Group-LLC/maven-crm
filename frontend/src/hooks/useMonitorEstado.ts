import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCanalQueRevive } from "@/hooks/useCanalQueRevive";

// Lee —SIN react-query— si el usuario es admin y el estado del monitor
// (monitor_config). A propósito NO usa useQuery/useUserRole: esto se consume
// DENTRO de la llamada (LiveKitCallView) y del Cowork, que en los tests se
// montan sin QueryClientProvider; con react-query reventaban todas las pruebas
// de videollamada. Usa supabase directo + el canal que revive (que no necesita
// QueryClient). La página de RRHH sí usa useMonitorConfig (react-query), porque
// allá siempre hay provider.

export interface MonitorEstado {
  /** null = todavía no se sabe (no se monitorea hasta confirmar que NO es admin). */
  esAdmin: boolean | null;
  /** null = aún no cargó; true/false = interruptor del monitor. */
  activo: boolean | null;
  intervaloSeg: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export function useMonitorEstado(habilitado: boolean): MonitorEstado {
  const { user } = useAuth();
  const [esAdmin, setEsAdmin] = useState<boolean | null>(null);
  const [activo, setActivo] = useState<boolean | null>(null);
  const [intervaloSeg, setIntervaloSeg] = useState(120);
  const on = habilitado && !!user;

  useEffect(() => {
    if (!on || !user) { setEsAdmin(null); return; }
    let vivo = true;
    void (async () => {
      try {
        const { data } = await supabase.rpc("is_in_role_group", { _user_id: user.id, _group: "admin" });
        if (vivo) setEsAdmin(data === true);
      } catch { if (vivo) setEsAdmin(false); }
    })();
    return () => { vivo = false; };
  }, [on, user]);

  // Por ref para que el canal que revive siempre llame a la última versión.
  const leerCfg = useRef(async () => {});
  leerCfg.current = async () => {
    try {
      const { data, error } = await sinTipar
        .from("monitor_config")
        .select("activo, intervalo_ia_seg")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      setActivo(data ? data.activo !== false : true);
      setIntervaloSeg(data ? Math.max(30, Number(data.intervalo_ia_seg) || 120) : 120);
    } catch {
      // Un fallo de lectura NO apaga el monitor: deja lo anterior (si nunca
      // cargó, queda null y la IA espera; las faltas gratis corren igual).
    }
  };

  useEffect(() => { if (on) void leerCfg.current(); }, [on]);

  useCanalQueRevive({
    topic: on ? "monitor-config" : null,
    armar: (ch) =>
      ch.on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "monitor_config" },
        () => { void leerCfg.current(); },
      ),
    alRevivir: () => { void leerCfg.current(); },
  });

  return { esAdmin, activo, intervaloSeg };
}
