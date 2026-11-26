// LA PUERTA (tren de agencias, vagón 2/7 — 19/11/2026): app.maven-ai.me es una sola,
// pero hay dos bases: Kash (la de siempre, lsagslbkliprespbyhts) y el EDIFICIO
// (maven-agencias, ezeigddgkaemxpshghmu), donde viven los clientes nuevos.
//
// Cómo decide:
//   · Puerta APAGADA (VITE_PUERTA_EDIFICIO distinto de "1", lo de hoy): todo va a Kash,
//     sin preguntar nada a nadie. Cero cambio para la gente de Kash.
//   · Puerta PRENDIDA: el login pide primero el correo y le pregunta al directorio del
//     edificio (edge `directorio`, solo responde sí/no). Si es del edificio, este
//     navegador lo recuerda y la app arranca contra el edificio (client.ts lee la
//     elección al cargar; cambiar de base = recargar la página).
//   · Kash es SIEMPRE el valor por defecto: si el directorio falla o no responde, Kash.
//
// Todo puro y con el almacenamiento inyectado: lo prueba test/puerta/puerta.test.ts.

export type Destino = "kash" | "edificio";

export const CLAVE_DESTINO = "maven.puerta.destino";
export const CLAVE_CORREO = "maven.puerta.correo";

/** Las variables que importan (en producción las pone docker-entrypoint.sh al arrancar). */
export interface EnvPuerta {
  VITE_PUERTA_EDIFICIO?: string;
  VITE_EDIFICIO_URL?: string;
  VITE_EDIFICIO_ANON_KEY?: string;
}

interface Almacen {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const KASH_REF = "lsagslbkliprespbyhts";

/** null si no hay valor o quedó el marcador __RUNTIME_…__ sin reemplazar. Es una función
 *  (y no una comparación directa) para que el compilador no la dé por resuelta: el valor
 *  real llega después, cuando el contenedor arranca. */
export function valorDeEnv(v: string | undefined | null): string | null {
  return !v || v.startsWith("__RUNTIME_") ? null : v;
}

/** La conexión al edificio, o null si la puerta está apagada o mal configurada. */
export function configDelEdificio(env: EnvPuerta): { url: string; llave: string } | null {
  if (valorDeEnv(env.VITE_PUERTA_EDIFICIO) !== "1") return null;
  const url = valorDeEnv(env.VITE_EDIFICIO_URL)?.replace(/\/+$/, "") ?? null;
  const llave = valorDeEnv(env.VITE_EDIFICIO_ANON_KEY);
  if (!url || !llave || !/^https:\/\//.test(url)) return null;
  // Si por error la «del edificio» es la de Kash, no hay puerta (sería la misma base).
  if (url.includes(KASH_REF)) return null;
  return { url, llave };
}

export function puertaActiva(env: EnvPuerta): boolean {
  return configDelEdificio(env) !== null;
}

function leer(almacen: Almacen | null | undefined, k: string): string | null {
  try { return almacen?.getItem(k) ?? null; } catch { return null; }
}

/** A dónde va este navegador. Con la puerta apagada, SIEMPRE Kash. */
export function destinoGuardado(env: EnvPuerta, almacen: Almacen | null | undefined): Destino {
  if (!puertaActiva(env)) return "kash";
  return leer(almacen, CLAVE_DESTINO) === "edificio" ? "edificio" : "kash";
}

export function correoGuardado(almacen: Almacen | null | undefined): string | null {
  return leer(almacen, CLAVE_CORREO);
}

export function guardarDestino(almacen: Almacen | null | undefined, destino: Destino, correo?: string | null): void {
  try {
    if (destino === "edificio") almacen?.setItem(CLAVE_DESTINO, "edificio");
    else almacen?.removeItem(CLAVE_DESTINO);
    if (correo) almacen?.setItem(CLAVE_CORREO, correo.trim().toLowerCase());
  } catch { /* sin almacenamiento: queda Kash, que es lo de siempre */ }
}

export function olvidarDestino(almacen: Almacen | null | undefined): void {
  try {
    almacen?.removeItem(CLAVE_DESTINO);
    almacen?.removeItem(CLAVE_CORREO);
  } catch { /* nada que olvidar */ }
}

/** La base con la que arranca la app (client.ts). */
export function elegirConexion(
  env: EnvPuerta,
  almacen: Almacen | null | undefined,
  kash: { url: string; llave: string },
): { destino: Destino; url: string; llave: string } {
  const edificio = configDelEdificio(env);
  if (edificio && destinoGuardado(env, almacen) === "edificio") return { destino: "edificio", ...edificio };
  return { destino: "kash", ...kash };
}

export type RespuestaDirectorio = "edificio" | "kash" | "error";

/** Le pregunta al directorio del edificio. Cualquier fallo → "error" (y la app sigue a Kash). */
export async function preguntarDirectorio(
  correo: string,
  env: EnvPuerta,
  fetchImpl: typeof fetch = fetch,
): Promise<RespuestaDirectorio> {
  const edificio = configDelEdificio(env);
  if (!edificio) return "kash";
  try {
    const res = await fetchImpl(`${edificio.url}/functions/v1/directorio`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: edificio.llave, Authorization: `Bearer ${edificio.llave}` },
      body: JSON.stringify({ correo: correo.trim().toLowerCase() }),
    });
    if (!res.ok) return "error";
    const cuerpo = (await res.json().catch(() => null)) as { edificio?: unknown } | null;
    if (typeof cuerpo?.edificio !== "boolean") return "error";
    return cuerpo.edificio ? "edificio" : "kash";
  } catch {
    return "error";
  }
}

/** Con la respuesta del directorio: a dónde va. Un error NO saca a nadie de Kash. */
export function destinoDeRespuesta(r: RespuestaDirectorio): Destino {
  return r === "edificio" ? "edificio" : "kash";
}

/** Un enlace de invitación / «crear mi contraseña» trae la sesión en el #hash
 *  (access_token=…). Si ese token lo emitió el EDIFICIO (su `iss` es la dirección del
 *  edificio), este navegador tiene que arrancar contra el edificio aunque nunca haya
 *  pasado por el login. Con la puerta apagada, o con cualquier cosa rara: null (Kash). */
export function destinoPorEnlaceDeAcceso(hash: string | null | undefined, env: EnvPuerta): Destino | null {
  const edificio = configDelEdificio(env);
  if (!edificio || !hash) return null;
  try {
    const token = new URLSearchParams(hash.replace(/^#/, "")).get("access_token");
    const cuerpo = token?.split(".")[1];
    if (!cuerpo) return null;
    const b64 = cuerpo.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(cuerpo.length / 4) * 4, "=");
    const iss = (JSON.parse(atob(b64)) as { iss?: unknown }).iss;
    if (typeof iss !== "string") return null;
    return iss === `${edificio.url}/auth/v1` ? "edificio" : null;
  } catch {
    return null;
  }
}

/** «Crear mi contraseña» (la invitación del Dueño de un cliente nuevo) vive SOLO en el
 *  edificio: esa ruta arranca contra el edificio aunque el navegador nunca haya pasado por
 *  el login. Con la puerta apagada: null (Kash, como siempre). */
export const RUTA_CREAR_CONTRASENA = "/crear-contrasena";
export function destinoPorRuta(pathname: string | null | undefined, env: EnvPuerta): Destino | null {
  if (!configDelEdificio(env) || !pathname) return null;
  return pathname.replace(/\/+$/, "") === RUTA_CREAR_CONTRASENA ? "edificio" : null;
}

/** El token del enlace («#t=…», 64 hex) o null. */
export function tokenDelEnlace(hash: string | null | undefined): string | null {
  const t = new URLSearchParams((hash ?? "").replace(/^#/, "")).get("t")?.trim().toLowerCase() ?? "";
  return /^[0-9a-f]{64}$/.test(t) ? t : null;
}

/** A dónde va el login cuando no hay returnTo: Kash al tablero de siempre; el edificio a
 *  la casa de la plataforma (/plataforma reparte: clientes, /mi-empresa o /dashboard). */
export function inicioTrasEntrar(destino: Destino): string {
  return destino === "edificio" ? "/plataforma" : "/dashboard";
}

/** El entorno real (import.meta.env), en un solo lugar. */
export function envDeLaApp(): EnvPuerta {
  return {
    VITE_PUERTA_EDIFICIO: import.meta.env.VITE_PUERTA_EDIFICIO as string | undefined,
    VITE_EDIFICIO_URL: import.meta.env.VITE_EDIFICIO_URL as string | undefined,
    VITE_EDIFICIO_ANON_KEY: import.meta.env.VITE_EDIFICIO_ANON_KEY as string | undefined,
  };
}

/** localStorage, si se puede (navegación privada / bloqueado → null, y queda Kash). */
export function almacenDelNavegador(): Almacen | null {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch { return null; }
}

// La base de ESTA pestaña, fijada al cargar (client.ts la fija al crear el cliente).
// Cambiar de base = recargar. Va aquí (y no solo en client.ts) para que la pantalla de
// entrada y la de bloqueo la lean sin depender del cliente (que las pruebas reemplazan).
let destinoAlCargar: Destino | null = null;

export function fijarDestinoDeEstaPestana(d: Destino): void {
  destinoAlCargar = d;
}

export function destinoDeEstaPestana(): Destino {
  if (destinoAlCargar === null) destinoAlCargar = destinoGuardado(envDeLaApp(), almacenDelNavegador());
  return destinoAlCargar;
}
