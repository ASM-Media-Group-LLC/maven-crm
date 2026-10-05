import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Contenido original de un mensaje eliminado (tabla chat_message_deletions). */
export interface DeletedMessageArchive {
  message_id: string;
  content: string | null;
  type: string | null;
  file_url: string | null;
  file_name: string | null;
  sender_id: string;
  deleted_by: string;
  deleted_at: string;
  /** Si lo había mandado una integración: la marca que copió delete_chat_message
   *  (migración 20261001200000). Los dos null = lo escribió una persona. */
  api_key_id: string | null;
  api_display_name: string | null;
}

/**
 * Trae el contenido original de los mensajes eliminados que están a la vista.
 *
 * `chat_message_deletions` tiene RLS **solo-admin**: para un usuario normal esta
 * consulta devuelve SIEMPRE vacío — el servidor no manda el contenido, no es un
 * "esconder en la UI". Por eso el componente puede decidir qué pintar con solo
 * mirar si hay fila o no.
 */
export function useDeletedMessages(deletedIds: string[]): Record<string, DeletedMessageArchive> {
  const [archive, setArchive] = useState<Record<string, DeletedMessageArchive>>({});
  // Clave estable: evita refetch por identidad nueva del array en cada render.
  const key = deletedIds.slice().sort().join(",");

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (!ids.length) {
      setArchive((prev) => (Object.keys(prev).length ? {} : prev));
      return;
    }
    let cancelled = false;
    (async () => {
      // Tabla nueva: aún no está en los tipos generados de Supabase.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data, error } = await (supabase as any)
        .from("chat_message_deletions")
        .select("message_id, content, type, file_url, file_name, sender_id, deleted_by, deleted_at, api_key_id, api_display_name")
        .in("message_id", ids);
      if (cancelled || error || !data) return;
      const map: Record<string, DeletedMessageArchive> = {};
      for (const row of data as DeletedMessageArchive[]) map[row.message_id] = row;
      setArchive(map);
    })();
    return () => { cancelled = true; };
  }, [key]);

  return archive;
}
