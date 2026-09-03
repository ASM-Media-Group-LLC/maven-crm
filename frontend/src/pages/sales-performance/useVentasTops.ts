import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Chatter de BLU: lo que vendió en el rango, con el reparto por agencia.
 *  Sale de `chatter_model_daily` (chatter × modelo × día) y NO de
 *  `chatter_daily_sales`, que desde el 31/08/2026 llega sin casi nada de Plus
 *  — ver la migración 20260904160000. */
export interface TopChatter {
  nombre: string;
  ventas: number;
  plus: number;
  massive: number;
  mensajes: number | null;
  dias: number;
}

/** Closer: plataformas vendidas (oportunidades ganadas) en el rango. */
export interface TopCloser {
  nombre: string;
  ganadas: number;
  /** Valor MENSUAL recurrente de lo ganado, no un pago único. */
  usd_mensual: number;
  /** Promedio de la nota 1-10 que publica el bot en el corte. Null si no tiene. */
  nota_corte: number | null;
}

/** Manager: su objetivo es que su roster PROMOCIONE. */
export interface TopManager {
  nombre: string;
  creadoras: number;
  promocionaron: number;
  dias_con_promo: number;
  dias_medidos: number;
  pct_dias: number;
  nota_corte: number | null;
}

export interface VentasTops {
  chatters: TopChatter[];
  closers: TopCloser[];
  managers: TopManager[];
}

const VACIO: VentasTops = { chatters: [], closers: [], managers: [] };

/**
 * Los tres rankings del Dashboard Ventas en una sola llamada (RPC
 * `ventas_tops`, SECURITY DEFINER con guarda de permiso adentro).
 *
 * Va por RPC y no por queries del front porque `chatter_daily_sales` es
 * management-only por RLS y lo de managers agrega miles de filas de
 * `promolog_entries`: contar eso en el navegador sería tirar toda esa data por
 * la red para mostrar dos números.
 */
export function useVentasTops(desde: string | undefined, hasta: string | undefined, limite = 5) {
  const q = useQuery({
    queryKey: ["ventas-tops", desde, hasta, limite],
    enabled: !!desde && !!hasta,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<VentasTops> => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any).rpc("ventas_tops", {
        _from: desde,
        _to: hasta,
        _limite: limite,
      });
      if (error) throw new Error(error.message);
      const d = (data ?? {}) as Partial<VentasTops>;
      return {
        chatters: d.chatters ?? [],
        closers: d.closers ?? [],
        managers: d.managers ?? [],
      };
    },
  });
  // Default estable: un `?? {…}` inline devolvería un objeto nuevo por render
  // (ver react-default-array-effect-loop).
  return { tops: q.data ?? VACIO, cargando: q.isLoading, error: q.error as Error | null };
}
