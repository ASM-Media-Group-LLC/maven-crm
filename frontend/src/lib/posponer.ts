// Las opciones de "Posponer" y a qué instante corresponde cada una.
//
// Vive suelto —sin React— porque acá está la parte que se equivoca sola: "esta
// tarde" y "mañana" dependen de la hora en que se toca el botón, y un cálculo
// distraído hace reaparecer el correo en el pasado o a las 3 de la mañana.

export interface OpcionDePosponer {
  clave: string;
  /** Cómo se llama en el menú. Va acá y no en el diccionario porque la
   *  pantalla del Correo todavía es del legado en español; cuando se traduzca,
   *  esto pasa a `t()` de una. */
  rotulo: string;
  /** Cuándo vuelve, o null si esa opción no aplica a esta hora. */
  cuando: Date | null;
}

/** Pone una hora concreta sobre una fecha, sin tocar el día. */
function aLas(base: Date, hora: number, dias = 0): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + dias);
  d.setHours(hora, 0, 0, 0);
  return d;
}

/** Las horas de referencia. Son de JORNADA, no redondas por gusto: un correo
 *  que reaparece a las 6 de la mañana se lee a las 9 igual, pero además llegó
 *  cuando nadie estaba. */
export const HORA_TARDE = 15;
export const HORA_MANANA = 8;

/**
 * Las opciones que se ofrecen, en orden.
 *
 * ⚠️ «Esta tarde» DESAPARECE si ya pasaron las 15. Ofrecerla igual daría un
 * instante en el pasado, y el despertador lo devolvería en su primera corrida:
 * la persona toca "esta tarde" y el correo vuelve a los cinco minutos, que
 * parece un bug aunque sea aritmética.
 *
 * Lo mismo con «mañana» y el resto: siempre caen adelante por construcción.
 */
export function opcionesDePosponer(ahora: Date = new Date()): OpcionDePosponer[] {
  const estaTarde = aLas(ahora, HORA_TARDE);
  return [
    // Solo si todavía falta al menos una hora: a las 14:50, "esta tarde" son
    // diez minutos y no es posponer, es esperar.
    { clave: "tarde", rotulo: "Esta tarde", cuando: estaTarde.getTime() - ahora.getTime() >= 3600_000 ? estaTarde : null },
    { clave: "manana", rotulo: "Mañana", cuando: aLas(ahora, HORA_MANANA, 1) },
    // El lunes que viene: si hoy ES lunes, va al siguiente, no a hoy.
    { clave: "semana", rotulo: "La semana que viene", cuando: proximoLunes(ahora) },
    { clave: "mes", rotulo: "En un mes", cuando: aLas(ahora, HORA_MANANA, 30) },
  ];
}

/** El próximo lunes a la hora de la mañana. Nunca hoy. */
export function proximoLunes(ahora: Date): Date {
  const dia = ahora.getDay(); // 0 domingo … 6 sábado
  // Días hasta el lunes: de lunes (1) son 7, no 0.
  const faltan = ((8 - dia) % 7) || 7;
  return aLas(ahora, HORA_MANANA, faltan);
}
