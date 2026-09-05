/**
 * Que un aviso suene UNA vez aunque haya varias pestañas de Maven abiertas.
 *
 * Los avisos globales (Messenger, bandejas de WhatsApp y Telegram, la campana
 * de notificaciones, los pedidos de Cowork) viven en hooks montados POR ENCIMA
 * del router: cada pestaña abierta recibe el MISMO evento de realtime y cada
 * una hacía sonar su propio ding. Con tres pestañas, tres dings.
 *
 * El freno se comparte por `localStorage`, que es común a todas las pestañas
 * del mismo origen. La primera que llega se queda la ventana y las demás se
 * callan.
 *
 * ⚠️ NO es una elección de líder, y es a propósito. Con un líder, si esa pestaña
 * muriera o quedara suspendida no sonaría NADIE. Acá el reparto es por carrera:
 * el modo de falla es "suena de más", nunca "no suena".
 *
 * ⚠️ REGLA DEL ARCHIVO: ante cualquier duda, esto devuelve `true` (que suene).
 * Un aviso que no suena no se nota hasta que importa, y con la voz de los avisos
 * de Cowork ya nos pasó dos veces dejar al equipo en silencio sin enterarnos
 * (ver la memoria de `lib/voz.ts`). Fallar hacia el ruido es barato; fallar
 * hacia el silencio, no. Si algún día hay que tocar este archivo, esa es la
 * única regla que no se negocia.
 */

/** ¿Le toca sonar a ESTA pestaña?
 *
 *  @param clave  Familia de aviso. Cada una lleva su propia ventana, para que
 *                un pedido de Cowork no silencie un mensaje nuevo.
 *  @param ventanaMs  Cuánto se considera "el mismo aviso".
 */
export function sonarUnaVezEntrePestanas(clave: string, ventanaMs: number): boolean {
  const k = `maven:ding:${clave}`;
  try {
    const ahora = Date.now();
    const previo = Number(localStorage.getItem(k)) || 0;

    // Reloj que saltó hacia atrás (cambio de hora, portátil que despierta): un
    // valor guardado "en el futuro" nos dejaría mudos hasta alcanzarlo.
    if (previo > ahora) {
      localStorage.setItem(k, String(ahora));
      return true;
    }

    if (ahora - previo < ventanaMs) return false;

    localStorage.setItem(k, String(ahora));
    return true;
  } catch {
    // Modo privado, storage bloqueado por el navegador, cuota llena… da igual
    // el motivo: se suena.
    return true;
  }
}
