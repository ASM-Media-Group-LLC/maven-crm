// A QUÉ BASE HABLA ESTA PESTAÑA, en un solo lugar (19/11/2026, puerta del edificio).
//
// Antes ~18 archivos leían import.meta.env.VITE_SUPABASE_URL sueltos: con la puerta
// prendida, una sesión del EDIFICIO (maven-agencias) habría llamado a las funciones de
// Kash con su token del edificio. Ahora todos leen de aquí (y client.ts también), así que
// la sesión del edificio habla con el edificio y la de Kash con Kash, exactamente igual
// que antes. Guarda: test/puerta/conexionUnica.test.ts.
//
// Va aparte de client.ts a propósito: muchas pruebas reemplazan client.ts entero, y este
// módulo no crea ningún cliente (no cuesta nada importarlo).

import { almacenDelNavegador, destinoPorEnlaceDeAcceso, destinoPorRuta, elegirConexion, envDeLaApp, fijarDestinoDeEstaPestana, guardarDestino } from "@/lib/puerta";

const PROD_URL = "https://lsagslbkliprespbyhts.supabase.co";
// Modern publishable key (sb_publishable_*). Replaced the legacy anon JWT
// after the v2→v3 cutover so the legacy JWT can be disabled without
// breaking the production build's fallback path.
const PROD_PUBLISHABLE_KEY = "sb_publishable_hEuAcbx-kSMDF9lAG3aPTQ_YXoNdL5Q";

const isPlaceholder = (v: string | undefined): boolean => !v || v.startsWith("__RUNTIME_");

const rawUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const rawKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

/** Kash, siempre (la base de siempre). Para lo que vive SOLO en Kash: los instaladores
 *  de la app (balde público `descargas`) y la telemetría del dominio viejo. */
export const SUPABASE_URL_KASH = isPlaceholder(rawUrl) ? PROD_URL : (rawUrl as string);
export const SUPABASE_KEY_KASH = isPlaceholder(rawKey) ? PROD_PUBLISHABLE_KEY : (rawKey as string);

// Un enlace de invitación / «crear mi contraseña» del edificio (#access_token=… con el
// emisor del edificio) llega a un navegador que todavía no sabe que es del edificio:
// se recuerda ANTES de crear el cliente, para que la sesión del enlace no se pruebe
// contra Kash. Con la puerta apagada no hace nada.
if (typeof window !== "undefined") {
  const env = envDeLaApp();
  if (destinoPorEnlaceDeAcceso(window.location.hash, env) === "edificio" || destinoPorRuta(window.location.pathname, env) === "edificio") {
    guardarDestino(almacenDelNavegador(), "edificio");
  }
}

const conexion = elegirConexion(envDeLaApp(), almacenDelNavegador(), { url: SUPABASE_URL_KASH, llave: SUPABASE_KEY_KASH });
fijarDestinoDeEstaPestana(conexion.destino);

/** "kash" o "edificio": a qué base está conectada esta pestaña. */
export const DESTINO_SUPABASE = conexion.destino;
/** La base de ESTA pestaña (Kash, o el edificio si la puerta lo mandó allá). */
export const SUPABASE_URL = conexion.url;
export const SUPABASE_PUBLISHABLE_KEY = conexion.llave;

/** La dirección de una edge function de la base de esta pestaña. */
export function urlDeFuncion(nombre: string): string {
  return `${SUPABASE_URL}/functions/v1/${nombre}`;
}
