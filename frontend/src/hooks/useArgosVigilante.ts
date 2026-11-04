// ARGOS VIGILANTE — DESACTIVADO A PROPÓSITO (Álvaro, 04/11/2026).
//
// Antes este hook prendía LA CÁMARA DE LA PERSONA por su cuenta (getUserMedia a
// nivel de toda la app, modelo Hubstaff) para vigilarla aunque no estuviera en
// una llamada. Álvaro lo cortó: Argos NO prende la cámara sin consentimiento.
// «No quiero prenderles una cámara sin permiso. Si la prenden o la apagan, es
// problema de ellos». La cámara solo se mide cuando la propia persona la prende
// en una llamada de Cowork (ahí el monitor corre dentro de LiveKitCallView, con
// el track que ella misma encendió). No tener la cámara prendida no es una falta
// de permiso: cuenta como «no compartió cámara» y por eso le baja la nota del
// día, pero la cámara nunca se enciende a escondidas.
//
// Se deja el hook (inerte) y su componente para no romper el import del AppShell
// y para tener el lugar exacto si algún día se hace una vigilancia-app CON
// consentimiento explícito. Hoy no prende nada, no pide permisos y no registra
// faltas app-wide.

export interface EstadoVigilante {
  /** Está vigilando de verdad (hay cámara viva). Siempre false: ya no vigila app-wide. */
  vigilando: boolean;
  /** Debe vigilar pero la persona no dio permiso de cámara. Siempre false. */
  permisoNegado: boolean;
  /** La config pide vigilar a esta persona. Siempre false: la vigilancia-app se retiró. */
  debeVigilar: boolean;
}

export function useArgosVigilante(): EstadoVigilante {
  // Sin efectos, sin getUserMedia, sin detector: Argos no toca la cámara.
  return { vigilando: false, permisoNegado: false, debeVigilar: false };
}
