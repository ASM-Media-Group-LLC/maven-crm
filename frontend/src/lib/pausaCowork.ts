// La cuenta regresiva de una pausa de Cowork, en UN SOLO lugar.
//
// La ve la persona en su propia pantalla Y el coordinador en la miniatura de la
// sala y en su lista. Si cada lado la calculara por su cuenta, tarde o temprano
// dirían cosas distintas sobre el mismo minuto — y ahí se acaba la conversación
// sobre si alguien se pasó o no.
//
// Cuenta hacia ATRÁS, no hacia adelante. "Llevas 7 minutos" obliga a restar de
// memoria contra un límite que además cambia según el tipo de pausa; "te quedan
// 3" se entiende sin pensar. Y cuando se pasa sigue contando en negativo, que
// es el dato que de verdad importa para el coordinador.

export type EstadoPausa = "ok" | "poco" | "excedida";

export interface CuentaPausa {
  /** Segundos que faltan. NEGATIVO si ya se pasó. */
  restante: number;
  estado: EstadoPausa;
  /** "7:12", o "−2:05" si se pasó. */
  texto: string;
  excedida: boolean;
}

/** Cuánto antes del final se pone en amarillo: un cuarto del tiempo, con piso
 *  de 1 minuto y techo de 5. Sin techo, un break de 30 min pasaría un tercio de
 *  su vida en amarillo y el color dejaría de significar nada. */
function umbralAviso(limiteSeg: number): number {
  return Math.min(300, Math.max(60, Math.round(limiteSeg * 0.25)));
}

function mmss(segundos: number): string {
  const s = Math.abs(Math.round(segundos));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * @param transcurrido segundos desde que arrancó la pausa
 * @param limiteMinutos el tope de ese tipo de pausa (de cowork_break_limits)
 */
export function cuentaPausa(transcurrido: number, limiteMinutos?: number | null): CuentaPausa {
  // Sin límite configurado no se puede prometer una cuenta regresiva: se
  // muestra lo transcurrido y en neutro. Inventar un tope sería peor.
  if (limiteMinutos == null) {
    return { restante: 0, estado: "ok", texto: mmss(transcurrido), excedida: false };
  }
  const restante = limiteMinutos * 60 - transcurrido;
  const excedida = restante < 0;
  const estado: EstadoPausa = excedida
    ? "excedida"
    : restante <= umbralAviso(limiteMinutos * 60) ? "poco" : "ok";
  return { restante, estado, texto: (excedida ? "−" : "") + mmss(restante), excedida };
}

/** Clases de color para el contador. El rojo PARPADEA: es el único de los tres
 *  que pide una acción de alguien, y en una grilla de nueve salas un color fijo
 *  se pierde entre el resto. */
export function clasesPausa(estado: EstadoPausa): string {
  return estado === "excedida"
    ? "text-red-400 animate-pulse font-semibold"
    : estado === "poco"
      ? "text-amber-400 font-semibold"
      : "text-emerald-400";
}

/** Nombre y apellido de alguien, para avisos y chapas.
 *
 *  Se mostraba solo el primer nombre y en un equipo con dos Álvaro Mejía o dos
 *  Manuela Zapata eso no identifica a nadie — que es justo lo que un aviso de
 *  supervisión tiene que hacer.
 *
 *  Se toma la PRIMERA y la ÚLTIMA palabra, no las dos primeras: en nombres como
 *  "Maria De Los Angeles Suarez" las dos primeras dan "Maria De", que no es un
 *  apellido. Así siempre sale un nombre y un apellido de verdad.
 */
export function nombreYApellido(completo: string | null | undefined): string {
  const partes = (completo ?? "").trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "Alguien";
  if (partes.length === 1) return partes[0];
  return `${partes[0]} ${partes[partes.length - 1]}`;
}
