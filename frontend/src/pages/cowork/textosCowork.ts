// Los textos de Cowork que salen de un ESTADO (la pausa del supervisor, por qué
// está parado el reloj, el tipo de pausa), como claves del diccionario.
//
// Por qué no se usan las frases de lib/pausaSupervisor y lib/coworkReloj: esas
// devuelven el español armado, y lib/ no es de este módulo. Acá se mapea el
// VALOR (que es dato: viaja por presencia y se guarda en la base) a su clave, y
// cada pantalla la dibuja con `t()` en el idioma de quien mira. El español del
// diccionario es EXACTAMENTE el de esas funciones (lo vigila
// test/cowork/coworkEnIngles.test.tsx), así que en español no cambia nada.
import type { TranslationKey } from "@/lib/i18n";
import type { EstadoSupervisor } from "@/lib/pausaSupervisor";
import type { EstadoTiempo } from "@/lib/coworkReloj";

export type Traductor = (key: TranslationKey, params?: Record<string, string | number>) => string;

/** "En break", "Lunch", "Ausente": la chapa del supervisor en pausa. */
export const ETIQUETA_SUPERVISOR: Record<EstadoSupervisor, TranslationKey> = {
  break: "cowork.supPause.label.break",
  lunch: "cowork.supPause.label.lunch",
  ausente: "cowork.supPause.label.away",
};

/** "está en break": va después del nombre ("Álvaro está en break"). */
export const FRASE_SUPERVISOR: Record<EstadoSupervisor, TranslationKey> = {
  break: "cowork.supPause.phrase.break",
  lunch: "cowork.supPause.phrase.lunch",
  ausente: "cowork.supPause.phrase.away",
};

/** El segundo renglón de lo que ve el chatter: qué esperar. */
export const SUBTITULO_SUPERVISOR: Record<EstadoSupervisor, TranslationKey> = {
  break: "cowork.supPause.subtitle.break",
  lunch: "cowork.supPause.subtitle.lunch",
  ausente: "cowork.supPause.subtitle.away",
};

/** El título de la tacita cuando el supervisor ya está en pausa. */
export const ESTAS_SUPERVISOR: Record<EstadoSupervisor, TranslationKey> = {
  break: "cowork.supPause.youAre.break",
  lunch: "cowork.supPause.youAre.lunch",
  ausente: "cowork.supPause.youAre.away",
};

/** Por qué está detenido el reloj: a la persona ("no estás frente a la cámara")
 *  o, con `deOtro`, en tercera persona para el tablero ("fuera de cámara").
 *  null cuando corre (activo o en el meet grupal). */
export function claveMotivoDetenido(estado: EstadoTiempo | null | undefined, deOtro = false): TranslationKey | null {
  switch (estado) {
    case "pausa": return "cowork.clock.reason.paused";
    case "sin_camara": return "cowork.clock.reason.cameraOff";
    case "sin_pantalla": return deOtro ? "cowork.clock.reasonOther.noScreen" : "cowork.clock.reason.noScreen";
    case "fuera_de_camara": return deOtro ? "cowork.clock.reasonOther.offCamera" : "cowork.clock.reason.offCamera";
    default: return null;
  }
}

/** El nombre de cada tipo de pausa. El valor ("bano"/"break") es dato. */
export const NOMBRE_PAUSA: Record<"bano" | "break", TranslationKey> = {
  bano: "cowork.pause.bano",
  break: "cowork.pause.break",
};

// Lo que el chatter manda al pedir supervisor queda GUARDADO en la solicitud
// (cowork_host_requests.message) y lo lee otra persona: se sigue mandando en
// español. Al mostrarlo, los dos mensajes fijos que manda la app se dicen en el
// idioma de quien mira; un mensaje escrito por alguien se muestra tal cual.
export const MENSAJE_PEDIR_AYUDA = "Necesito ayuda";
export const MENSAJE_LLAMADA_PRIVADA = "Llamada privada";

export function mensajeDeSolicitud(mensaje: string, t: Traductor): string {
  if (mensaje === MENSAJE_PEDIR_AYUDA) return t("cowork.request.msgHelp");
  if (mensaje === MENSAJE_LLAMADA_PRIVADA) return t("cowork.request.msgPrivate");
  return mensaje;
}
