import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { diasEntre } from "@/lib/range-presets";

// MIS HORAS DE HUBSTAFF, día por día. Compartido por los tableros de closer y
// de manager (y sirve para cualquier "mis horas" que venga después).
//
// Sale del RPC `mis_horas_hubstaff` (migración 20260905120000), que agrega
// `hubstaff_activities` — LA MISMA FUENTE Y LA MISMA ARITMÉTICA que usa el bot
// para la nota. La tabla `hubstaff_daily_data` está incompleta (3,92 h donde el
// día real fueron 8,48) y con ella el tablero del manager se contradecía a sí
// mismo: "Tus horas 3.9" arriba y "Hubstaff 7.5 h" en la tarjeta de su nota.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

export interface DiaDeHubstaff {
  date: string;
  horas: number;
  /** Actividad de teclado y mouse, 0-100. */
  actividad: number | null;
}

const SIN_DIAS: DiaDeHubstaff[] = [];

export function useMisHoras(desde: string, hasta: string) {
  const { user } = useAuth();
  const q = useQuery({
    enabled: !!user?.id,
    queryKey: ["mis-horas-hubstaff", user?.id, desde, hasta],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<DiaDeHubstaff[]> => {
      // El RPC ya viene agregado por día de Bogotá, con la actividad ponderada
      // por segundos: acá no se recalcula nada.
      const { data, error } = await db.rpc("mis_horas_hubstaff", { _desde: desde, _hasta: hasta });
      if (error) throw new Error(error.message);
      return ((data ?? []) as Array<{ dia: string; horas: number | string; actividad: number | null }>)
        .map((r) => ({
          date: r.dia,
          horas: Number(r.horas),
          actividad: r.actividad == null ? null : Number(r.actividad),
        }))
        .sort((a, b) => a.date.localeCompare(b.date));
    },
  });
  return { dias: q.data ?? SIN_DIAS, cargando: q.isLoading };
}

/**
 * Un elemento por CADA día del rango, con 0 h en los que no hay registro.
 * El gráfico tiene que cubrir el rango del calendario: con solo los días que
 * tienen dato, una semana con 3 días trabajados dibujaba 3 barras y parecía un
 * rango de 3 días. Ojo: para los totales se usa el arreglo crudo, porque
 * `diasTrabajados` cuenta días CON registro.
 */
export function diasDelRango(dias: DiaDeHubstaff[], desde: string, hasta: string): DiaDeHubstaff[] {
  const fechas = diasEntre(desde, hasta);
  if (fechas.length === 0) return dias; // rango absurdo: no revienta el gráfico
  const porFecha = new Map(dias.map((d) => [d.date, d]));
  return fechas.map((iso) => porFecha.get(iso) ?? { date: iso, horas: 0, actividad: null });
}

/** Total de horas y actividad ponderada de un conjunto de días. */
export function resumirHoras(dias: DiaDeHubstaff[]) {
  const horas = dias.reduce((s, d) => s + d.horas, 0);
  const conAct = dias.filter((d) => d.actividad != null);
  const actividad = horas > 0 && conAct.length
    ? Math.round(conAct.reduce((s, d) => s + d.actividad! * d.horas, 0) / conAct.reduce((s, d) => s + d.horas, 0))
    : null;
  return { horas, actividad, diasTrabajados: dias.length, maxHoras: Math.max(...dias.map((d) => d.horas), 1) };
}
