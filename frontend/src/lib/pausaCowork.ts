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

// ── La voz que avisa que se acabó la pausa ──────────────────────────────────
//
// Quien está en pausa está LEJOS DE LA PANTALLA — es el sentido de la pausa —
// así que un cartel no le sirve de nada. Por eso este aviso es hablado, y por
// eso se repite: el primero, casi por definición, no lo escucha nadie.
//
// Rotan por la misma razón que las del supervisor de encuadre: la misma frase
// repetida cada dos minutos se vuelve ruido de fondo que el oído filtra.

const FRASES_FIN_PAUSA: Record<"bano" | "break", string[]> = {
  bano: [
    "Se te acabó el tiempo de baño. Por favor, vuelve a tu puesto.",
    "Terminó tu tiempo de baño. Regresa a la sala, por favor.",
    "Tu pausa de baño ya terminó. Por favor, vuelve a la cámara.",
    "Se cumplió el tiempo de baño. Te esperamos de vuelta.",
  ],
  break: [
    "Se te acabó el break. Por favor, vuelve a tu puesto.",
    "Terminó tu break. Regresa a la sala, por favor.",
    "Tu break ya terminó. Por favor, vuelve a la cámara.",
    "Se cumplió el tiempo de break. Te esperamos de vuelta.",
  ],
};

// Fuera de React: si viviera en un useRef se reiniciaría en cada montaje y la
// persona escucharía siempre la primera frase, que es lo contrario de rotar.
let idxFinPausa = 0;

export function fraseFinDePausa(kind: "bano" | "break" | null): string {
  const lista = FRASES_FIN_PAUSA[kind === "break" ? "break" : "bano"];
  const frase = lista[idxFinPausa % lista.length];
  idxFinPausa += 1;
  return frase;
}

/** Cada cuánto se repite el aviso hablado mientras siga pasado. Dos minutos:
 *  suficiente para no atosigar, corto para que quien volvió al escritorio se
 *  entere sin tener que mirar la pantalla. */
export const REPETIR_FIN_PAUSA_MS = 120_000;

/** Cuánto tiene que estar pasado alguien para que se le avise al SUPERVISOR.
 *  Antes que eso es asunto de la persona: pasarse un minuto del baño no es algo
 *  que amerite interrumpir a quien supervisa nueve salas. */
export const AVISAR_SUPERVISOR_PASADO_MS = 180_000;
