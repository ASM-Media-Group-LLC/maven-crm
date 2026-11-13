// SI LA CANCELACIÓN DE RUIDO ESTÁ CORRIENDO DE VERDAD (Alvaro, 13/11/2026).
//
// Desde este cambio la cancelación de ruido (RNNoise, ver
// noise-suppression-processor.ts) es OBLIGATORIA: no hay botón para apagarla y
// un «false» guardado en el navegador ya no cuenta. Pero obligatoria no quiere
// decir que siempre corra: un navegador sin AudioWorklet no la soporta, el WASM
// puede no bajar (queda solo la puerta de ruido) y el filtro puede trabarse
// andando (se apaga para no dejar a la persona muda). Esto lo dice tal cual, en
// cada muestra de llamada_salud (`datos.nc`), para que Argos › Llamadas muestre
// a quién le está funcionando y a quién no.

/**
 *  · activa       RNNoise + puerta de ruido, como debe ser.
 *  · solo_puerta  el WASM de RNNoise no cargó: solo la puerta de antes.
 *  · fallo        hay micrófono pero el filtro no arrancó o se trabó (sale crudo).
 *  · no_soportada el navegador no tiene AudioWorklet.
 *  · sin_micro    todavía no hay micrófono publicado (en Cowork se entra silenciado).
 */
export type EstadoNC = "activa" | "solo_puerta" | "fallo" | "no_soportada" | "sin_micro";

export function estadoDeNC(p: {
  soportada: boolean;
  hayMicro: boolean;
  /** El motor del procesador enganchado al micrófono, o null si no hay ninguno funcionando. */
  motor: "rnnoise+puerta" | "puerta" | null;
}): EstadoNC {
  if (!p.soportada) return "no_soportada";
  if (!p.hayMicro) return "sin_micro";
  if (p.motor === "rnnoise+puerta") return "activa";
  if (p.motor === "puerta") return "solo_puerta";
  return "fallo";
}

/** ¿El filtro está haciendo su trabajo (aunque sea a medias)? Para el aviso de la llamada. */
export function ncFunciona(e: EstadoNC): boolean {
  return e === "activa" || e === "solo_puerta" || e === "sin_micro";
}
