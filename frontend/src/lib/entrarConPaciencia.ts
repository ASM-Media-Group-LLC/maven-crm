// Que entrar a Maven aguante el cambio de turno.
//
// EL CASO (simulacro del 19/11/2026): 1.000 personas entrando en un minuto
// desde 4 lugares (4 direcciones de internet) y solo entró el 3 %. Supabase
// limita cuántas entradas acepta por dirección de internet y por hora, y
// contestaba 429 («demasiadas peticiones»). En la vida real pasa lo mismo:
// una oficina entera sale a internet por UNA dirección y marca entrada al
// mismo tiempo.
//
// Dos arreglos, los dos en el navegador (los topes del servidor los sube el
// dueño en el panel de Supabase; ver el PR «login-aguanta»):
//
// 1. Al entrar: si el servidor dice «espera» (429), falla (5xx) o no hay red,
//    se reintenta solo con esperas que crecen (1 s, 2 s, 4 s, 8 s…) y un poco
//    de azar, para que mil personas no vuelvan a tocar la puerta en el mismo
//    segundo. Mientras tanto se muestra un aviso tranquilo. La contraseña
//    equivocada (400) NO se reintenta: se avisa enseguida.
//
// 2. Al renovar la sesión (cada hora): supabase-js CIERRA LA SESIÓN si la
//    renovación vuelve con 429 o 500 (solo perdona 502, 503 y 504). Con mil
//    personas que entraron juntas, la renovación de la hora siguiente también
//    llega junta. Aquí el 429/5xx de la renovación se espera un rato al azar y
//    se le pasa a supabase-js como 503: así lo reintenta y la persona sigue
//    adentro.

/** Lo que trae un error de supabase.auth (AuthApiError, AuthRetryableFetchError…). */
export interface ErrorDeEntrada {
  name?: string;
  code?: string;
  status?: number;
  message?: string;
}

/** Errores que son de la persona (no se arreglan esperando). */
const CODIGOS_DE_LA_PERSONA = new Set([
  "invalid_credentials",
  "invalid_grant",
  "email_not_confirmed",
  "user_banned",
  "user_not_found",
  "validation_failed",
  "weak_password",
]);

/** ¿Vale la pena reintentar la entrada? Solo si el problema es de capacidad
 *  (429), del servidor (5xx) o de la red. Contraseña mala: nunca. */
export function esReintentableAlEntrar(error: ErrorDeEntrada | null | undefined): boolean {
  if (!error) return false;
  if (error.code && CODIGOS_DE_LA_PERSONA.has(error.code)) return false;
  if (error.code === "over_request_rate_limit") return true;
  const status = error.status;
  if (status === 429) return true;
  if (typeof status === "number" && status >= 500) return true;
  if (typeof status === "number" && status >= 400) return false;
  // Sin respuesta del servidor (se cortó la red) o respuesta que no era JSON
  // (una página de error de un intermediario): supabase-js los marca así.
  if (error.name === "AuthRetryableFetchError" || error.name === "AuthUnknownError") return true;
  const msg = (error.message ?? "").toLowerCase();
  return /failed to fetch|network|load failed|timeout|timed out/.test(msg);
}

/** Primera espera y tope de cada espera (ms). */
export const PRIMERA_ESPERA_MS = 1_000;
export const ESPERA_MAXIMA_MS = 8_000;
/** Cuánto se insiste en total antes de decirle a la persona que pruebe en un rato. */
export const PRESUPUESTO_ENTRADA_MS = 30_000;

/** La espera antes del reintento número `intento` (0, 1, 2…): 1 s, 2 s, 4 s,
 *  8 s, 8 s… cada una entre la mitad y una vez y media al azar, para que la
 *  gente que falló junta no vuelva junta. */
export function esperaDelIntento(intento: number, azar: () => number = Math.random): number {
  const base = Math.min(PRIMERA_ESPERA_MS * 2 ** intento, ESPERA_MAXIMA_MS);
  return Math.round(base * (0.5 + azar()));
}

export interface OpcionesDeEntrada {
  /** Avisa que se va a reintentar (para mostrar «mucha gente entrando…»). */
  alReintentar?: (intento: number, esperaMs: number) => void;
  dormir?: (ms: number) => Promise<void>;
  azar?: () => number;
  ahora?: () => number;
  presupuestoMs?: number;
}

const dormirDeVerdad = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Llama a `intentar` (p. ej. signInWithPassword) y, si vuelve con un error
 *  de capacidad, servidor o red, lo repite con esperas crecientes hasta
 *  ~30 s. Devuelve el último resultado tal cual. */
export async function entrarConReintentos<R extends { error: ErrorDeEntrada | null }>(
  intentar: () => Promise<R>,
  opciones: OpcionesDeEntrada = {},
): Promise<R> {
  const {
    alReintentar,
    dormir = dormirDeVerdad,
    azar = Math.random,
    ahora = () => Date.now(),
    presupuestoMs = PRESUPUESTO_ENTRADA_MS,
  } = opciones;
  const inicio = ahora();
  for (let intento = 0; ; intento++) {
    let resultado: R;
    try {
      resultado = await intentar();
    } catch (e) {
      // Un fallo de red que se escapó como excepción cuenta como error de red.
      const err = e as ErrorDeEntrada;
      resultado = { error: { name: err?.name ?? "AuthRetryableFetchError", message: err?.message ?? "network" } } as R;
    }
    if (!esReintentableAlEntrar(resultado.error)) return resultado;
    const espera = esperaDelIntento(intento, azar);
    if (ahora() - inicio + espera > presupuestoMs) return resultado;
    alReintentar?.(intento + 1, espera);
    await dormir(espera);
  }
}

// ── Renovación de la sesión ────────────────────────────────────────────────

const RUTA_RENOVACION = /\/auth\/v1\/token\?(?:.*&)?grant_type=refresh_token/;

const urlDe = (input: RequestInfo | URL): string =>
  typeof input === "string" ? input : input instanceof URL ? input.href : input.url;

/** Lo que supabase-js sí perdona (reintenta sin cerrar la sesión). */
const PERDONADOS = new Set([502, 503, 504]);

export interface OpcionesDeRenovacion {
  dormir?: (ms: number) => Promise<void>;
  azar?: () => number;
}

/** Envuelve el fetch del cliente para que una renovación de sesión que vuelve
 *  con 429 o 5xx no saque a la persona: espera un rato al azar (más largo si
 *  sigue fallando) y la entrega como 503, que supabase-js reintenta sin
 *  borrar la sesión. Todo lo demás pasa derecho, igual que antes. */
export function protegerRenovacion(base: typeof fetch, opciones: OpcionesDeRenovacion = {}): typeof fetch {
  const { dormir = dormirDeVerdad, azar = Math.random } = opciones;
  let fallosSeguidos = 0;
  return async (input, init) => {
    if (!RUTA_RENOVACION.test(urlDe(input))) return base(input, init);
    const respuesta = await base(input, init);
    const s = respuesta.status;
    if (s !== 429 && s < 500) {
      if (respuesta.ok) fallosSeguidos = 0;
      return respuesta;
    }
    // El servidor está lleno o falló: se espera al azar antes de devolverle
    // el turno a supabase-js, que reintenta enseguida. Así mil pestañas que
    // fallaron en el mismo segundo no vuelven en el mismo segundo.
    await dormir(Math.round(azar() * Math.min(PRIMERA_ESPERA_MS * 2 ** fallosSeguidos, ESPERA_MAXIMA_MS)));
    fallosSeguidos++;
    if (PERDONADOS.has(s)) return respuesta;
    const cuerpo = await respuesta.text().catch(() => "");
    const headers = new Headers(respuesta.headers);
    headers.delete("content-length");
    headers.delete("content-encoding");
    return new Response(cuerpo, { status: 503, statusText: "Service Unavailable", headers });
  };
}
