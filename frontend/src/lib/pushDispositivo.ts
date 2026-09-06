// Bandera local: "ESTE dispositivo recibe Web Push". La pone usePushSubscription
// al suscribir con éxito y la lee useMessengerNotifications para no dar el aviso
// dos veces: con push activo, la tarjeta con la pestaña oculta la muestra el
// service worker (sw-push.js) y la app se queda solo con el sonido y el título.
//
// Es por dispositivo a propósito (localStorage, no la base): la misma persona
// puede tener push en el celular y no en el portátil.
export const clavePushDispositivo = (userId: string) => `maven:push:${userId}`;

export function tienePushEnEsteDispositivo(userId: string | null | undefined): boolean {
  if (!userId) return false;
  try {
    return localStorage.getItem(clavePushDispositivo(userId)) === "1";
  } catch {
    return false;
  }
}

export function marcarPushEnEsteDispositivo(userId: string, activo: boolean): void {
  try {
    if (activo) localStorage.setItem(clavePushDispositivo(userId), "1");
    else localStorage.removeItem(clavePushDispositivo(userId));
  } catch {
    /* sin storage: la app sigue con el aviso in-app de siempre */
  }
}
