import { createContext } from "react";
import type { ChatMessage } from "./types";

// LA GALERÍA DEL CHAT: todas las fotos, GIFs y videos de la conversación, en
// orden, para que el visor pase de una a otra con flechas.
//
// Jhon (28/09): «cuando me mandan varias imágenes y las visualizo en zoom, no
// tengo opciones para ir pasando de imágenes, tengo que salirme y seleccionar
// otra». Cada burbuja tenía SU visor y solo conocía SU imagen: el visor no
// tenía forma de saber cuál venía después.

/** Qué es un mensaje con archivo. Vive acá y no dentro de MessageBubble para
 *  que la burbuja y la galería decidan con la MISMA regla: si una dijera
 *  «video» y la otra no, el visor saltaría a algo que en el chat se dibuja
 *  como otra cosa (o se saltearía algo que sí se ve como foto). */
export function clasificarMedia(m: Pick<ChatMessage, "type" | "file_url" | "file_name">) {
  const url = m.file_url ?? "";
  const esNotaDeVoz = m.type === "file" && !!m.file_name?.startsWith("voice-note");
  const esAudio = !!url && /\.(webm|ogg|mp3|m4a|wav)(\?|$)/i.test(url);
  const esImagen = m.type === "image" && !!url;
  // GIF: Giphy los manda como .mp4 con file_name "gif.mp4". Se muestran en chico y
  // reproduciéndose SOLOS (autoplay+loop+muted), como en WhatsApp — no como video con
  // botón de play (que obligaba a hacer zoom para verlo animado).
  const esGif = !!url && (
    /\.gif(\?|$)/i.test(url) ||
    (m.file_name || "").toLowerCase().startsWith("gif") ||
    /(giphy|tenor)\.com/i.test(url)
  );
  // OJO: los .webm de nota de voz y los gifs .mp4 también matchean este regex →
  // excluirlos para que NO se dibujen como player de video con botón de play.
  const esVideo = !esNotaDeVoz && !esAudio && !esGif && !!url && /\.(mp4|webm|mov)(\?|$)/i.test(url);
  return { esNotaDeVoz, esAudio, esImagen, esGif, esVideo };
}

export interface MediaDelChat {
  id: string;
  src: string;
  tipo: "image" | "video";
  nombre: string | null;
}

/** Lo que se ve en el visor, en el orden del chat. Los mensajes borrados no
 *  entran: en el chat ya no se ve la foto, y el visor no puede mostrarla. */
export function mediaDelChat(mensajes: ChatMessage[]): MediaDelChat[] {
  const salida: MediaDelChat[] = [];
  for (const m of mensajes) {
    if (m.is_deleted || !m.file_url) continue;
    const c = clasificarMedia(m);
    if (c.esImagen) {
      salida.push({ id: m.id, src: m.file_url, tipo: "image", nombre: m.file_name });
    } else if (c.esGif) {
      // Un GIF de verdad (.gif) se ve como imagen; el de Giphy (.mp4), como video.
      salida.push({ id: m.id, src: m.file_url, tipo: /\.gif(\?|$)/i.test(m.file_url) ? "image" : "video", nombre: m.file_name });
    } else if (c.esVideo) {
      salida.push({ id: m.id, src: m.file_url, tipo: "video", nombre: m.file_name });
    }
  }
  return salida;
}

/** La lista la arma quien dibuja la conversación (MessageList, ThreadPanel) y
 *  la lee cada burbuja al abrir el visor. Vacía = visor sin flechas, como
 *  antes: sirve de valor por defecto para cualquier otro lugar que use la
 *  burbuja (el evaluador de chatters, por ejemplo). */
export const GaleriaDelChat = createContext<MediaDelChat[]>([]);
