// En la app de computador, Cowork vuelve a compartir la pantalla solo cuando se
// corta (ver LiveKitCallView, «pantallaSola»). Si falla seguido —por ejemplo, en
// un Mac sin el permiso de «Grabación de pantalla»— no se insiste a lo loco: la
// espera crece 10 s, 20 s, 40 s… hasta 5 minutos, y vuelve a cero apenas comparte.
const PRIMERA_ESPERA_MS = 10_000;
const ESPERA_MAXIMA_MS = 5 * 60_000;

/** Desde cuándo se puede volver a intentar. `fallos` = intentos seguidos sin lograr compartir. */
export function proximoIntentoDePantalla(ultimo: number, fallos: number): number {
  if (fallos <= 0) return ultimo;
  return ultimo + Math.min(ESPERA_MAXIMA_MS, PRIMERA_ESPERA_MS * 2 ** (fallos - 1));
}
