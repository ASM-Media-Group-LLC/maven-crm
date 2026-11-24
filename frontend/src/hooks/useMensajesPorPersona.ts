import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Mensajes de hoy POR PERSONA (pantallas de «Mensajes hoy» y «Respuesta»,
// 20/11/2026): cuántos escribió, en cuántas conversaciones y cuánto tarda en
// responder. Nunca el contenido. Solo lo ven admins y el dueño (como el total).

export interface MensajesDe { mensajes: number; conversaciones: number; respuestaS: number | null }

type RpcDb = { rpc: (f: string) => Promise<{ data: unknown; error: { message: string } | null }> };

export function useMensajesPorPersona(habilitado: boolean) {
  return useQuery<Map<string, MensajesDe>>({
    enabled: habilitado,
    queryKey: ["mensajes-por-persona-hoy"],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as RpcDb).rpc("messenger_por_persona_del_dia");
      if (error) throw new Error(error.message);
      const m = new Map<string, MensajesDe>();
      for (const f of (data ?? []) as Array<{ user_id: string; mensajes: number; conversaciones: number; respuesta_promedio_s: number | string | null }>) {
        m.set(f.user_id, {
          mensajes: Number(f.mensajes) || 0,
          conversaciones: Number(f.conversaciones) || 0,
          respuestaS: f.respuesta_promedio_s == null ? null : Number(f.respuesta_promedio_s),
        });
      }
      return m;
    },
  });
}
