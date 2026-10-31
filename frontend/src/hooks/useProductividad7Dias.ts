import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

// Serie REAL de los últimos 7 días (día contable America/Bogota, igual que el
// resto del reloj) con las horas totales de Cowork del equipo — para la barra
// de "Productividad del equipo" del Centro de operaciones, como la del mockup.
//
// No hay RPC de serie diaria, así que se reusa `equipo_tiempo_cowork` (mismo
// permiso: supervisor+ ve a todos; cualquier otro, solo lo suyo) una vez por
// día, en paralelo. Cacheado 5 min: en un tablero de admin son 7 llamadas
// livianas que casi nunca se repiten. Un fallo se propaga (no se inventan ceros).

export interface DiaProductividad {
  /** Día contable en ISO (YYYY-MM-DD, Bogotá). */
  dia: string;
  /** Rótulo corto del día (lun, mar…). */
  etiqueta: string;
  /** Horas totales de Cowork del equipo ese día. */
  horas: number;
  /** Es hoy (para resaltar la barra, como en el link). */
  esHoy: boolean;
}

const fmtISO = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(d);
const fmtDia = (d: Date) =>
  new Intl.DateTimeFormat("es", { timeZone: "America/Bogota", weekday: "short" })
    .format(d)
    .replace(".", "");

export function useProductividad7Dias() {
  const { user } = useAuth();
  const q = useQuery({
    enabled: !!user?.id,
    queryKey: ["productividad-7dias"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<DiaProductividad[]> => {
      const hoyISO = fmtISO(new Date());
      // Últimos 7 días terminando hoy.
      const dias: Date[] = [];
      const base = new Date();
      for (let i = 6; i >= 0; i--) {
        const d = new Date(base);
        d.setDate(base.getDate() - i);
        dias.push(d);
      }
      const db = supabase as unknown as {
        rpc: (f: string, a: unknown) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
      };
      return Promise.all(
        dias.map(async (d) => {
          const iso = fmtISO(d);
          const { data, error } = await db.rpc("equipo_tiempo_cowork", { _desde: iso, _hasta: iso });
          if (error) throw new Error(error.message);
          let seg = 0;
          for (const r of (data ?? []) as Array<{ seg_activo: number | string }>) seg += Number(r.seg_activo);
          return { dia: iso, etiqueta: fmtDia(d), horas: seg / 3600, esHoy: iso === hoyISO };
        }),
      );
    },
  });
  return { dias: q.data ?? [], cargando: q.isLoading, fallo: q.isError, reintentar: q.refetch };
}
