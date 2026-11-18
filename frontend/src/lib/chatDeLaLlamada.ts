// El chat de una llamada del Messenger queda en la conversación (Alvaro,
// 18/11/2026: «en la conversación del chat», como en Skype). Antes viajaba solo
// por LiveKit y se perdía al colgar.
//
// Lo guarda SOLO quien lo escribe (un mensaje = una fila). Si quien escribe no
// es de esa conversación (lo agregaron a la llamada), la base no lo deja y el
// mensaje igual se ve en la llamada.
import { supabase } from "@/integrations/supabase/client";
import { uploadSmallWithRetry } from "@/pages/messenger/uploadUtils";
import { claveSeguraParaArchivo } from "@/lib/claveDeArchivo";

export async function guardarMensajeDeLlamada(conversacion: string, uid: string, texto: string): Promise<boolean> {
  const limpio = texto.trim();
  if (!limpio) return false;
  const { error } = await (supabase.from("chat_messages") as any).insert({
    conversation_id: conversacion,
    sender_id: uid,
    content: limpio,
    type: "text",
  });
  if (error) console.warn("[Llamada] El mensaje no quedó en el chat:", error.message);
  return !error;
}

export async function guardarArchivoDeLlamada(conversacion: string, uid: string, archivo: File): Promise<boolean> {
  const ruta = `${uid}/${Date.now()}-${claveSeguraParaArchivo(archivo.name)}`;
  const { error: errorSubida } = await uploadSmallWithRetry(archivo, ruta);
  if (errorSubida) {
    console.warn("[Llamada] El archivo no quedó en el chat:", errorSubida);
    return false;
  }
  const { data } = supabase.storage.from("chat-files").getPublicUrl(ruta);
  const { error } = await (supabase.from("chat_messages") as any).insert({
    conversation_id: conversacion,
    sender_id: uid,
    type: archivo.type.startsWith("image/") ? "image" : "file",
    file_url: data.publicUrl,
    file_name: archivo.name,
    file_size: archivo.size,
  });
  if (error) console.warn("[Llamada] El archivo no quedó en el chat:", error.message);
  return !error;
}
