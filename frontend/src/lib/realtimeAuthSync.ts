// Realtime siempre con el JWT VIGENTE.
//
// EL BUG (07/09/2026, visto en vivo en el tablero de Cowork de Jhon): la sesión
// se renueva sola cada hora, pero cuando la renovación la hace OTRA pestaña de
// Maven —y todo el mundo tiene varias: Messenger, Cowork, el correo— el
// cliente de Realtime de esta pestaña se quedaba con el JWT viejo. Los canales
// ya unidos seguían andando, pero cualquier canal que tuviera que unirse o
// re-unirse después de la hora recibía "InvalidJWTToken: Token has expired"
// y se quedaba muerto: el tablero del supervisor sin presencia de nadie, las
// notificaciones en TIMED_OUT, el reloj de los chatters invisible. Y el
// vigilante de presencia, al rehacer el canal, chocaba con lo mismo.
//
// supabase-js empuja el JWT nuevo a Realtime cuando SU pestaña emite
// TOKEN_REFRESHED; entre pestañas eso no llegaba. Acá no se depende de ese
// evento: cada tanto (y al volver a mirar la pestaña) se le pide a Realtime que
// vuelva a leer el JWT actual — `setAuth()` sin argumento usa la sesión que ya
// tiene guardada supabase-js. Si no cambió, no manda nada; si cambió, lo empuja
// a los canales unidos y lo deja listo para los que se unan después.
import { supabase } from "@/integrations/supabase/client";

export const CADA_MS = 30_000;

type Cliente = { realtime: { setAuth: (token?: string | null) => Promise<void> } };

let detenerActual: (() => void) | null = null;

/** Un intento; los errores se tragan: la próxima vuelta lo reintenta. */
export async function sincronizarJwtDeRealtime(cliente: Cliente = supabase as unknown as Cliente): Promise<void> {
  try {
    await cliente.realtime.setAuth();
  } catch {
    /* sin red o sin sesión: nada que hacer ahora */
  }
}

/** Arranca el sincronizador. Idempotente. Devuelve cómo pararlo. */
export function arrancarSincronizadorDeJwt(cliente: Cliente = supabase as unknown as Cliente, cadaMs = CADA_MS): () => void {
  if (detenerActual) return detenerActual;
  const temporizador = setInterval(() => { void sincronizarJwtDeRealtime(cliente); }, cadaMs);
  // Volver a la pestaña es EL momento en que la sesión pudo haber cambiado en
  // otra: ahí no se espera a la próxima vuelta.
  const alVolver = () => { if (document.visibilityState === "visible") void sincronizarJwtDeRealtime(cliente); };
  document.addEventListener("visibilitychange", alVolver);
  // Y si otra pestaña escribió la sesión en localStorage, también.
  const alCambiarStorage = (e: StorageEvent) => { if (e.key && /^sb-.*-auth-/.test(e.key)) void sincronizarJwtDeRealtime(cliente); };
  window.addEventListener("storage", alCambiarStorage);
  detenerActual = () => {
    clearInterval(temporizador);
    document.removeEventListener("visibilitychange", alVolver);
    window.removeEventListener("storage", alCambiarStorage);
    detenerActual = null;
  };
  return detenerActual;
}
