// Que una sesión vencida no deje a nadie mirando un spinner.
//
// EL CASO (07/10/2026, Luis Mercado): su sesión venció a las 8:56 y Maven le
// rechazó 1.868 consultas hasta las 11:25. Menú en esqueleto, spinner eterno,
// ni un mensaje. Supabase estaba sano; el resto de la empresa, normal.
//
// supabase-js decide si renovar la sesión comparando su vencimiento con el
// RELOJ DEL COMPUTADOR. Con el reloj atrasado (zona horaria mal puesta y la
// hora corregida a mano), cree que el token sigue vigente y lo manda vencido,
// aunque se recargue la página. Supabase lo rechaza con un 401 y el navegador
// no se entera.
//
// Acá no se depende del reloj: si una consulta con la sesión de la persona
// vuelve con 401, se renueva la sesión en ese momento y la consulta se repite
// UNA vez con el token nuevo. Lo de /auth/ queda afuera: ahí vive la propia
// renovación, y meterse daría vueltas sobre sí misma.
//
// El aviso de que el reloj está mal es aparte: lib/relojDelEquipo.ts.

/** Las rutas de autenticación pasan derecho. */
const RUTA_AUTH = /\/auth\/v1\//;

/** El rol que trae un JWT, o null si no es un JWT. La llave publicable
 *  (`sb_publishable_…`) no es una sesión: un 401 con ella no se arregla
 *  renovando. */
export function rolDelToken(token: string): string | null {
  const partes = token.split(".");
  if (partes.length !== 3) return null;
  try {
    const carga = JSON.parse(atob(partes[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof carga?.role === "string" ? carga.role : null;
  } catch {
    return null;
  }
}

/** El token de la PERSONA que lleva el pedido, o null (sin sesión, anónimo). */
export function tokenDeSesion(headers: Headers): string | null {
  const m = (headers.get("Authorization") ?? "").match(/^Bearer\s+(\S+)$/i);
  if (!m) return null;
  return rolDelToken(m[1]) === "authenticated" ? m[1] : null;
}

/** Renueva la sesión que llevaba `viejo` y devuelve el token nuevo, o null si
 *  no hubo forma (no hay sesión, falló, o se acaba de intentar). */
export type Renovar = (viejo: string) => Promise<string | null>;

const urlDe = (input: RequestInfo | URL): string =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

/** Envuelve el fetch del cliente de Supabase (opción `global.fetch`). */
export function conSesionRenovada(base: typeof fetch, renovar: Renovar): typeof fetch {
  return async (input, init) => {
    if (RUTA_AUTH.test(urlDe(input))) return base(input, init);

    const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
    const token = tokenDeSesion(headers);
    // Un cuerpo que es un flujo se consume al mandarlo: no se puede repetir.
    const flujo = typeof ReadableStream !== "undefined" && init?.body instanceof ReadableStream;
    if (!token || flujo) return base(input, init);

    // Un Request trae su cuerpo adentro y se gasta al mandarlo: copia antes.
    const copia = input instanceof Request ? input.clone() : null;
    const respuesta = await base(input, init);
    if (respuesta.status !== 401) return respuesta;

    const nuevo = await renovar(token);
    if (!nuevo || nuevo === token) return respuesta;
    headers.set("Authorization", `Bearer ${nuevo}`);
    return base(copia ?? input, { ...init, headers });
  };
}

/** Lo que usa de supabase.auth (así se prueba sin el cliente de verdad). */
export interface AuthParaRenovar {
  getSession(): Promise<{ data: { session: { access_token: string } | null } }>;
  refreshSession(): Promise<{ data: { session: { access_token: string } | null }; error: unknown }>;
}

/** Una vez cada tanto como mucho: si el 401 no era por la sesión (una función
 *  que lo devuelve por otra cosa), no se renueva en cada consulta. */
export const ESPERA_ENTRE_RENOVACIONES_MS = 60_000;

/** El `renovar` de verdad: una sola renovación a la vez para todas las
 *  consultas que vuelvan con 401 juntas (el tablero dispara más de 20), y si
 *  otra ya renovó, se usa ese token sin pedir otro. */
export function crearRenovador(auth: AuthParaRenovar, ahora: () => number = () => performance.now()): Renovar {
  let enCurso: Promise<string | null> | null = null;
  let ultima = -Infinity;

  return async (viejo) => {
    const { data } = await auth.getSession();
    const actual = data.session?.access_token ?? null;
    if (!actual) return null;
    if (actual !== viejo) return actual;
    if (enCurso) return enCurso;
    if (ahora() - ultima < ESPERA_ENTRE_RENOVACIONES_MS) return null;

    ultima = ahora();
    enCurso = auth
      .refreshSession()
      .then(({ data: d, error }) => (error ? null : d.session?.access_token ?? null))
      .catch(() => null)
      .finally(() => {
        enCurso = null;
      });
    return enCurso;
  };
}
