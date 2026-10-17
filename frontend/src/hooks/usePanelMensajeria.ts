import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Métricas del Messenger para el Centro de operaciones. Todo agregado en el
// servidor (RPC messenger_metricas_del_dia, solo admin): acá jamás se bajan
// mensajes al cliente — la base es Micro y ya se cayó una vez por barridos.
export interface MensajeriaDelDia {
  conversacionesActivas: number;
  mensajesHoy: number;
  /** null = hoy todavía no hubo pares pregunta→respuesta que medir. */
  respuestaPromedioS: number | null;
}

export function usePanelMensajeria() {
  const q = useQuery({
    queryKey: ["panel-mensajeria-hoy"],
    refetchInterval: 60_000,
    staleTime: 30_000,
    queryFn: async (): Promise<MensajeriaDelDia> => {
      // La RPC no está en los tipos generados; el cast se acota acá (mismo
      // patrón que useEquipoTiempoCowork).
      const db = supabase as unknown as {
        rpc: (f: string) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
      };
      const { data, error } = await db.rpc("messenger_metricas_del_dia");
      // Fallo ≠ vacío: si la RPC falla se lanza y la tarjeta muestra el error
      // con reintento, nunca ceros que parezcan "día tranquilo".
      if (error) throw new Error(error.message);
      const fila = (data ?? [])[0] as
        | { conversaciones_activas: number | string; mensajes_hoy: number | string; respuesta_promedio_s: number | string | null }
        | undefined;
      return {
        conversacionesActivas: Number(fila?.conversaciones_activas ?? 0),
        mensajesHoy: Number(fila?.mensajes_hoy ?? 0),
        respuestaPromedioS: fila?.respuesta_promedio_s == null ? null : Number(fila.respuesta_promedio_s),
      };
    },
  });
  return { datos: q.data ?? null, cargando: q.isLoading, fallo: q.isError, reintentar: q.refetch };
}
