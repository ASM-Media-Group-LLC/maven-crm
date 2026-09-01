// Cuándo varias imágenes seguidas se muestran como UN álbum.
//
// Si alguien tira cinco capturas seguidas, verlas como cinco burbujas gigantes
// es peor que verlas como una cuadrícula. Por eso las imágenes consecutivas del
// mismo remitente, mandadas con poca diferencia de tiempo, se juntan.
//
// ── EL BUG QUE ESTO ARREGLA (31/08/2026) ────────────────────────────────────
//
// La cuadrícula dibuja UN SOLO texto: el del primer mensaje. Los comentarios de
// las demás imágenes no se dibujan en ninguna parte.
//
// Jhon mandó dos capturas con diecisiete segundos de diferencia, una con el
// comentario "Prueba 2" y otra con "Prueba 3". Se juntaron en un álbum y
// "Prueba 3" desapareció de la pantalla. Su reacción fue la correcta: parecía
// que el mensaje se había borrado. (No se borró — se comprobó en la base: los
// dos mensajes estaban enteros, con su texto. Era solo el dibujo.)
//
// LA REGLA NUEVA, que es la que usan WhatsApp y Telegram: **una imagen con
// comentario no entra al álbum**. Solo se agrupan las que van sin texto.
//
//   · cinco capturas sin comentario  -> álbum, como antes
//   · imágenes con comentario        -> cada una con su burbuja y su texto
//
// Y encaja con la regla que ya existía: `muestraTextoDebajo` decide si una
// imagen tiene pie de foto, y es exactamente la misma pregunta que decide si
// puede entrar al álbum. Una sola regla para las dos cosas.
//
// ── ÁLBUM EXPLÍCITO (01/09/2026) ────────────────────────────────────────────
//
// Ahora el que envía varias imágenes en un mismo envío les estampa el MISMO
// `album_id` (columna en chat_messages). Para esos mensajes el agrupado es
// determinístico: mismo album_id consecutivo = mismo álbum, sin ventana de
// tiempo (una subida lenta ya no lo parte) y CON comentario permitido — el
// comentario del envío viaja en el content de la primera imagen y la
// cuadrícula lo dibuja debajo, como pie de TODO el álbum (modo WhatsApp).
//
// La heurística vieja (sin album_id) queda solo para los mensajes históricos.

import { muestraTextoDebajo } from "./mensajeConAdjunto";

/** Lo mínimo que hace falta de un mensaje para decidir el agrupado. */
export interface MensajeAgrupable {
  id: string;
  type?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  content?: string | null;
  sender_id?: string | null;
  created_at: string;
  is_deleted?: boolean | null;
  album_id?: string | null;
}

/** Cuánto pueden separarse dos imágenes y seguir siendo el mismo álbum. */
export const VENTANA_ALBUM_MS = 60_000;

/** Mínimo de imágenes para que valga la pena una cuadrícula. */
const MINIMO_PARA_ALBUM = 2;

export interface Albumes<T> {
  /** Las que abren un álbum: son las que dibujan la cuadrícula. */
  lideres: Set<string>;
  /** Todas las que forman parte de algún álbum (incluidas las líderes). Las que
   *  no son líderes no se dibujan por su cuenta. */
  partes: Set<string>;
  /** id de la líder -> las imágenes de su álbum, en orden. */
  imagenes: Map<string, T[]>;
}

/** ¿Esta imagen puede entrar a un álbum? */
function puedeEntrarAlAlbum(m: MensajeAgrupable): boolean {
  if (m.type !== "image" || !m.file_url || m.is_deleted) return false;
  // Álbum explícito: el comentario SÍ entra — es el pie de todo el álbum y la
  // cuadrícula lo dibuja debajo (solo la primera imagen del envío lo lleva).
  if (m.album_id) return true;
  // Heurística vieja: con comentario, NO — la cuadrícula solo dibuja un texto
  // y el suyo se perdería. Que tenga pie de foto es justo lo que la saca.
  return !muestraTextoDebajo(m.content, m.file_name);
}

/** ¿`sig` continúa el álbum que abrió `msg`? */
function continuaElAlbum(msg: MensajeAgrupable, sig: MensajeAgrupable): boolean {
  if (!puedeEntrarAlAlbum(sig)) return false;
  // Álbum explícito: el mismo album_id manda; sin ventana de tiempo (una
  // subida lenta no lo parte) y sin mezclar con imágenes de otro envío.
  if (msg.album_id || sig.album_id) return msg.album_id === sig.album_id;
  if (sig.sender_id !== msg.sender_id) return false;
  const separacion = Math.abs(
    new Date(sig.created_at).getTime() - new Date(msg.created_at).getTime(),
  );
  return separacion < VENTANA_ALBUM_MS;
}

/**
 * Agrupa imágenes consecutivas del mismo remitente en álbumes.
 *
 * Se recorre en orden y NO se reordena nada: un álbum es siempre un tramo
 * contiguo de la conversación, así que cualquier cosa en el medio —un texto,
 * una imagen con comentario, otro remitente— lo corta.
 */
export function agruparEnAlbumes<T extends MensajeAgrupable>(mensajes: T[]): Albumes<T> {
  const lideres = new Set<string>();
  const partes = new Set<string>();
  const imagenes = new Map<string, T[]>();

  let i = 0;
  while (i < mensajes.length) {
    const msg = mensajes[i];
    if (!puedeEntrarAlAlbum(msg)) { i++; continue; }

    const grupo: T[] = [msg];
    let j = i + 1;
    while (j < mensajes.length) {
      const sig = mensajes[j];
      if (!continuaElAlbum(msg, sig)) break;
      grupo.push(sig);
      j++;
    }

    if (grupo.length >= MINIMO_PARA_ALBUM) {
      lideres.add(msg.id);
      imagenes.set(msg.id, grupo);
      for (const im of grupo) partes.add(im.id);
    }
    i = j;
  }

  return { lideres, partes, imagenes };
}
