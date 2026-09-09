import type { UserProfile } from "@/pages/messenger/types";

export type MapaDePerfiles = Record<string, UserProfile>;

/**
 * Con qué mapa de perfiles se arma la lista de conversaciones.
 *
 * Existe por un bug que reportó Grace (09/09): TODOS sus mensajes directos
 * salían llamados "Usuario", con avatar "U". El mapa de perfiles estaba vacío y
 * `profileName(undefined)` devuelve "Usuario" como último recurso, así que la
 * lista se dibujaba entera sin nombres.
 *
 * Había dos formas de llegar a ese mapa vacío, y esta función tapa las dos:
 *
 * 1. `setProfiles()` solo actualiza el ref en el render SIGUIENTE, pero la carga
 *    de conversaciones se encadenaba con un `.then()`, que corre en un microtask
 *    ANTES de ese render. Por eso el mapa recién cargado se pasa por parámetro y
 *    gana sobre el ref.
 * 2. Si la petición de perfiles falla, el mapa quedaba vacío PARA TODA LA SESIÓN:
 *    se pedía una sola vez, y ni el poll de 20s ni el realtime la reintentaban
 *    (solo recargaban conversaciones). Grace lo describió como "se cayó varias
 *    veces y en dos ocasiones no salían los chats ni nada". Por eso, si el mapa
 *    está vacío, se reintenta.
 */
export async function perfilesGarantizados(
  recienCargados: MapaDePerfiles | undefined,
  delRef: MapaDePerfiles,
  recargar: () => Promise<MapaDePerfiles | null>,
): Promise<MapaDePerfiles> {
  const mapa = recienCargados ?? delRef;
  if (Object.keys(mapa).length > 0) return mapa;
  // Vacío = la carga falló o todavía no llegó. Reintentar acá cubre TODOS los
  // caminos de recarga de una sola vez, porque todos pasan por este punto.
  return (await recargar()) ?? mapa;
}
