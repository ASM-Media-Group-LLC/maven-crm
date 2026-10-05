// Quién aparece como emisor en el push de un mensaje del Messenger (el título del
// directo y el «Nombre: …» del cuerpo en un grupo; ver armarTituloYCuerpo en
// _shared/push-notify.ts).
//
// Pura y aparte de index.ts (que arranca el servidor al importarse) para poder
// probarla.
//
// Un mensaje que mandó una integración se anuncia con el nombre visible de la key
// y la etiqueta: «BLU (API)», igual que la campana (notify_chat_message, migración
// 20261001200000) y la burbuja. Ese nombre sale de la FILA del mensaje
// (api_display_name, que la base copió de api_keys al estamparlo), nunca del
// perfil: el perfil es de la persona dueña de la key, y el celular diría «Jhon»
// por un mensaje que escribió «BLU». Lo que decide si vino por API es api_key_id,
// no el nombre. El texto es dato y va igual en los dos idiomas.

export const EMISOR_DESCONOCIDO = "Alguien";
export const ETIQUETA_API = "(API)";

/** Lo que hace falta del mensaje. Las dos columnas pueden faltar si web-push corre
 *  contra una base sin la migración B (ver index.ts): se toma como «no es API». */
export interface MensajeDelEmisor {
  api_key_id?: string | null;
  api_display_name?: string | null;
}

export function nombreDelEmisor(
  msg: MensajeDelEmisor | null | undefined,
  perfil: { full_name?: string | null } | null | undefined,
): string {
  if (msg?.api_key_id != null) {
    return `${msg.api_display_name?.trim() || EMISOR_DESCONOCIDO} ${ETIQUETA_API}`;
  }
  return perfil?.full_name || EMISOR_DESCONOCIDO;
}
