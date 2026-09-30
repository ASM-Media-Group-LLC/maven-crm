// CÓMO ESTÁ LA PERSONA RESPECTO DE LA SALA DE LIVEKIT, y si hay que volver a
// conectarla sola.
//
// Por qué existe: cuando se caía la sala, la lista de participantes se vaciaba,
// la cámara de todo el mundo se veía apagada y el reloj de Cowork anotaba "sin
// cámara". Se le cobraba la caída a quien estaba trabajando, y encima nadie se
// enteraba: después de que LiveKit se rinde (~19 s de reintentos) no había
// cartel, ni botón, ni reconexión. Una caída duraba lo que tardara cada uno en
// darse cuenta. Decisión de Jhon (29/09/2026): la caída es su propio estado en
// el reloj (se pagan hasta 10 minutos por hora), y la llamada muestra un cartel
// con un botón para volver.
//
// Es puro a propósito: lo que decide si alguien cobra no puede probarse solo con
// una llamada de verdad.
import { ConnectionState, DisconnectReason } from "livekit-client";
import type { ConexionSala } from "@/lib/coworkTiempoRegla";
import { esOtraPestana } from "@/lib/sesionDuplicada";

/** Razones por las que la sala nos soltó A PROPÓSITO. No son caídas: no se
 *  reconecta solo (sería volver a entrar por la ventana) y el reloj no las
 *  trata como una caída pagada. */
const SALIDAS_A_PROPOSITO = new Set<number>([
  DisconnectReason.CLIENT_INITIATED, // la persona salió, o cambió de sala
  DisconnectReason.PARTICIPANT_REMOVED, // la sacó el supervisor
  DisconnectReason.ROOM_DELETED,
  DisconnectReason.ROOM_CLOSED,
  DisconnectReason.USER_REJECTED,
]);

/** ¿La sala se CAYÓ (red, servidor, algo que no eligió nadie)?
 *  Ante una razón desconocida, sí: quedarse fuera en silencio es peor que un
 *  intento de más. La otra pestaña nunca: volver ahí arma la pelea entre las
 *  dos (ver sesionDuplicada.ts). */
export function fueUnaCaida(razon?: DisconnectReason | number | null): boolean {
  if (esOtraPestana(razon)) return false;
  return razon == null || !SALIDAS_A_PROPOSITO.has(razon);
}

/** Lo que se le informa al reloj.
 *
 *  `yaEstuvoConectada`: si en esta sala ya se conectó alguna vez. Mientras entra
 *  por primera vez (o cambia de sala) devuelve null = "no se sabe", y el reloj
 *  aplica la regla de siempre. Sin esto, cada entrada dejaría un tramo de
 *  segundos de "sin conexión".
 *
 *  Durante la reconexión de LiveKit (hasta ~19 s) la lista NO se vacía y lo que
 *  dice la cámara sigue siendo cierto: "reconectando" usa la regla de siempre. */
export function conexionDeSala(
  estado: ConnectionState | string,
  razon: DisconnectReason | number | null | undefined,
  yaEstuvoConectada: boolean,
): ConexionSala | null {
  if (estado === ConnectionState.Connected) return "conectada";
  if (estado === ConnectionState.Reconnecting || estado === ConnectionState.SignalReconnecting) return "reconectando";
  if (esOtraPestana(razon)) return "reemplazada";
  if (!yaEstuvoConectada) return null;
  return fueUnaCaida(razon) ? "desconectada" : null;
}

// ── "Hay una caída en curso en esta sala", aunque se recargue la página ─────
// En sessionStorage: sobrevive al F5 (y a la recarga sola por un deploy) de la
// MISMA pestaña, y no pasa a otras. Se pone al CAERSE la sala y se borra al
// volver, al salir o al cambiar de sala.
// ⚠️ Es "caída en curso" y no "ya estuvo conectada": la segunda sobrevivía
// también al F5 de una llamada SANA, y después de recargar la vista creía volver
// de una caída (bloqueaba los botones y le anotaba "sin conexión" al reloj).
// Todo en try/catch: en una ventana privada o con el almacenamiento bloqueado
// puede tirar, y ahí simplemente no se recuerda (queda como antes).
const clave = (sala: string) => `sala-caida:${sala}`;

export function caidaEnCurso(sala: string): boolean {
  try { return sessionStorage.getItem(clave(sala)) === "1"; } catch { return false; }
}

export function marcarCaida(sala: string): void {
  try { sessionStorage.setItem(clave(sala), "1"); } catch { /* sin almacenamiento: no se recuerda */ }
}

export function olvidarCaida(sala: string): void {
  try { sessionStorage.removeItem(clave(sala)); } catch { /* sin almacenamiento */ }
}
