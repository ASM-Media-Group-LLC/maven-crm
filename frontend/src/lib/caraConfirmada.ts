// «NO SE TE VE LA CARA» SOLO CON LA IA QUE LO CONFIRME (Alvaro, 17/11/2026).
//
// El detector chico del navegador falla con la persona un poco lejos, con
// audífonos o con luz detrás. Ahora solo SOSPECHA: el aviso, el reloj detenido y
// el reporte salen únicamente si la IA (edge argos-cara) mira una foto de la
// cámara y dice que no hay nadie. Mientras no lo confirme, a favor de la persona.

/** Cuántas muestras seguidas sin cara (cada 3 s) antes de sospechar. */
export const MUESTRAS_PARA_SOSPECHAR = 3;
/** Cada cuánto se le vuelve a preguntar a la IA mientras siga la sospecha. */
export const IA_CADA_MS = 60_000;
/** Cuánto vale una respuesta de la IA. */
export const IA_VALE_MS = 90_000;

export interface RespuestaIA {
  persona: boolean | null;
  en: number;
}

/** ¿Hay que preguntarle a la IA ahora? */
export function tocaPreguntar(sospecha: boolean, ultima: RespuestaIA | null, enVuelo: boolean, ahora: number): boolean {
  if (!sospecha || enVuelo) return false;
  return !ultima || ahora - ultima.en >= IA_CADA_MS;
}

/** El estado final: «no_face» solo si la IA, hace poco, dijo que no hay nadie. */
export function estadoConfirmado<S extends string>(local: S | "no_face" | "ok", ultima: RespuestaIA | null, ahora: number): S | "no_face" | "ok" {
  if (local !== "no_face") return local;
  const vigente = !!ultima && ahora - ultima.en <= IA_VALE_MS;
  return vigente && ultima!.persona === false ? "no_face" : "ok";
}
