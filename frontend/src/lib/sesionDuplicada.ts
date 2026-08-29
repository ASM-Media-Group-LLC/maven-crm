import { DisconnectReason } from "livekit-client";

// Qué hacer cuando LiveKit nos desconecta, según POR QUÉ nos desconectó.
//
// EL BUG QUE ESTO ARREGLA (reproducido en vivo el 29/08/2026):
//
// Cada persona entra a la sala con su user id como identidad. LiveKit exige
// identidad única: cuando entra una segunda conexión con la misma, EXPULSA a la
// primera. O sea que abrir Cowork en dos pestañas alcanza para que se peleen.
//
// Pero la pelea infinita no la causaban las dos pestañas: la causaba el
// REINTENTO. El monitor trataba cualquier desconexión como un corte de red y
// volvía a conectar con backoff — y al volver, pateaba a la otra, que hacía
// exactamente lo mismo. `disconnect from room` cada ocho segundos, para
// siempre. Se veía como la miniatura parpadeando y la persona entrando y
// saliendo sola de la sala.
//
// La distinción que faltaba: un corte de red SÍ hay que reintentarlo —
// reconectar es lo correcto y es lo que hace que Cowork sobreviva a un wifi
// malo. Pero "te sacaron porque abriste esto en otra pestaña" NO se reintenta
// nunca: reintentarlo es justamente lo que arma el bucle. Ahí hay que parar y
// preguntarle a la persona en cuál de las dos quiere quedarse.

/** ¿Nos sacaron porque la misma cuenta abrió esto en otro lado?
 *
 *  `DUPLICATE_IDENTITY` es literalmente eso en el protocolo de LiveKit:
 *  "another participant with the same identity has joined the room". Puede ser
 *  otra pestaña, otra ventana, u otra computadora — para el caso da igual. */
export function esOtraPestana(razon?: DisconnectReason | number | null): boolean {
  return razon === DisconnectReason.DUPLICATE_IDENTITY;
}

/** ¿Corresponde volver a conectar solos?
 *
 *  Que sea la NEGACIÓN de lo anterior y no una lista de casos es a propósito:
 *  ante una razón desconocida conviene reintentar. Quedarse sin supervisión en
 *  silencio es peor que un reintento de más — y esa fue la decisión original
 *  del monitor, que acá se conserva. */
export function debeReintentar(razon?: DisconnectReason | number | null): boolean {
  return !esOtraPestana(razon);
}

// Los textos, acá y no repartidos por las pantallas, para que el supervisor y
// la persona supervisada lean lo mismo y nadie tenga que adivinar qué pasó.

/** Título del cartel. Dice el HECHO, no un error: no se rompió nada. */
export const TITULO_OTRA_PESTANA = "Abierto en otra ventana";

/** Explicación. Nombra las dos cosas que la persona necesita saber: por qué
 *  se cortó acá, y que puede traerlo de vuelta con un clic. */
export const DETALLE_OTRA_PESTANA =
  "Tu cuenta abrió esto en otra pestaña o dispositivo. Solo puede estar activa en un lugar a la vez.";

/** El botón. "Usar aquí" y no "Reconectar": lo que hace no es reintentar, es
 *  ELEGIR este lugar — y de paso deja al otro fuera. Conviene que el texto lo
 *  diga, porque la consecuencia le cae a la otra pestaña. */
export const BOTON_USAR_AQUI = "Usar aquí";
