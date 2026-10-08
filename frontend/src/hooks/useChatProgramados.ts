// Los mensajes programados de UNA conversación del Messenger («Programar envío»,
// como Google Chat. Jhon, 08/10). La tabla y quién puede qué:
// supabase/migrations/20261008170000_chat_programados.sql.

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { MensajeAProgramar } from "@/pages/messenger/programados";

export interface ChatProgramado {
  id: string;
  enviar_en: string;
  estado: "pendiente" | "fallido";
  mensajes: MensajeAProgramar[];
  resumen: string;
  ultimo_error: string | null;
}

const clave = (conversationId: string) => ["chat-programados", conversationId] as const;

export function useChatProgramados(conversationId: string | undefined) {
  return useQuery({
    queryKey: clave(conversationId ?? ""),
    enabled: !!conversationId,
    staleTime: 30_000,
    retry: false,
    // Salen solos: con alguno a punto de salir se pregunta seguido, para que la
    // franja lo saque apenas el mensaje aparece en el chat. Sin ninguno, nada.
    refetchInterval: (q) => {
      const filas = q.state.data as ChatProgramado[] | undefined;
      if (!filas?.some((f) => f.estado === "pendiente")) return false;
      const proximo = Math.min(...filas.filter((f) => f.estado === "pendiente").map((f) => new Date(f.enviar_en).getTime()));
      return proximo - Date.now() < 2 * 60_000 ? 15_000 : 60_000;
    },
    queryFn: async (): Promise<ChatProgramado[]> => {
      // ⚠️ `as never`: types.ts es generado y todavía no conoce la tabla.
      const { data, error } = await supabase.from("chat_programados" as never)
        .select("id, enviar_en, estado, mensajes, resumen, ultimo_error")
        .eq("conversation_id", conversationId!)
        .in("estado", ["pendiente", "fallido"])
        .order("enviar_en", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as ChatProgramado[];
    },
  });
}

export function useProgramarMensajes(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ mensajes, cuando }: { mensajes: MensajeAProgramar[]; cuando: Date }) => {
      const { data, error } = await supabase.rpc("chat_programar" as never, {
        p_conversation_id: conversationId,
        p_enviar_en: cuando.toISOString(),
        p_mensajes: mensajes,
      } as never);
      if (error) throw error;
      return data as unknown as string;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: clave(conversationId) }),
  });
}

/** Cancelar devuelve los mensajes (para editarlos o mandarlos ya), o null si ya
 *  salieron. */
export function useCancelarProgramado(conversationId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string): Promise<MensajeAProgramar[] | null> => {
      const { data, error } = await supabase.rpc("chat_programado_cancelar" as never, { p_id: id } as never);
      if (error) throw error;
      const r = data as unknown as { mensajes?: MensajeAProgramar[] } | null;
      return r?.mensajes ?? null;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: clave(conversationId) }),
  });
}
