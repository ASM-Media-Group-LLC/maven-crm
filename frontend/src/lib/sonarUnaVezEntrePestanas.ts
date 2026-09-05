/**
 * Que un aviso suene UNA vez aunque haya varias pestañas de Maven abiertas.
 *
 * Los avisos globales (Messenger, bandejas de WhatsApp y Telegram, la campana
 * de notificaciones, los pedidos de Cowork) viven en hooks montados POR ENCIMA
 * del router: cada pestaña abierta recibe el MISMO evento de realtime y cada
 * una hacía sonar su propio ding. Con tres pestañas, tres dings.
 *
 * ⚠️ NO alcanza con mirar una marca en `localStorage`. Se probó y falló EN VIVO
 * al primer intento: dos pestañas reciben el evento de realtime prácticamente
 * en el mismo instante, las dos leyeron la marca vieja, las dos escribieron y
 * las dos sonaron. La ventana de carrera no es teórica, es la normal.
 *
 * Por eso el chequeo Y el sonido van dentro de un candado de la Web Locks API,
 * que sí da exclusión mutua entre pestañas. La segunda pestaña entra al candado
 * cuando la primera ya soltó, ve la marca fresca y se calla.
 *
 * ⚠️ NO es una elección de líder, y es a propósito. Con un líder, si esa pestaña
 * muriera o quedara suspendida no sonaría NADIE. Acá cada aviso se reparte solo,
 * y el modo de falla es "suena de más", nunca "no suena".
 *
 * ⚠️ REGLA DEL ARCHIVO: ante cualquier duda, suena. Un aviso que no suena no se
 * nota hasta que importa, y con la voz de los avisos de Cowork ya dejamos al
 * equipo en silencio dos veces sin enterarnos (ver la memoria de `lib/voz.ts`).
 * Fallar hacia el ruido es barato; fallar hacia el silencio, no. Si algún día
 * hay que tocar este archivo, esa es la única regla que no se negocia.
 */

type ConLocks = Navigator & {
  locks?: { request: (nombre: string, fn: () => void) => Promise<unknown> };
};

/** Hace sonar el aviso solo si no lo acaba de hacer otra pestaña.
 *
 *  @param clave      Familia de aviso. Cada una lleva su propia ventana y su
 *                    propio candado, para que un pedido de Cowork no silencie
 *                    un mensaje nuevo.
 *  @param ventanaMs  Cuánto se considera "el mismo aviso".
 *  @param sonar      Qué reproducir. Se llama DENTRO del candado, para que la
 *                    marca y el sonido sean atómicos.
 */
export function sonarUnaVezEntrePestanas(
  clave: string,
  ventanaMs: number,
  sonar: () => void,
): void {
  const k = `maven:ding:${clave}`;

  const decidirYSonar = () => {
    let toca = true;
    try {
      const ahora = Date.now();
      const previo = Number(localStorage.getItem(k)) || 0;

      if (previo > ahora) {
        // Reloj que saltó hacia atrás (cambio de hora, portátil que despierta):
        // una marca "en el futuro" nos dejaría mudos hasta alcanzarla.
        localStorage.setItem(k, String(ahora));
      } else if (ahora - previo < ventanaMs) {
        toca = false;
      } else {
        localStorage.setItem(k, String(ahora));
      }
    } catch {
      // Modo privado, storage bloqueado, cuota llena… da igual el motivo.
      toca = true;
    }
    if (toca) sonar();
  };

  const locks = (navigator as ConLocks).locks;
  if (!locks?.request) {
    // Sin Web Locks queda la carrera, que es lo que había antes de este arreglo:
    // peor que sonar una vez, pero mucho mejor que no sonar.
    decidirYSonar();
    return;
  }

  void locks.request(`${k}:lock`, decidirYSonar).catch(() => {
    // Si el candado ni siquiera llegó a correr, no perdemos el aviso.
    decidirYSonar();
  });
}
