// messenger:write en Ajustes → API keys (diseño de la escritura §6.2): lo que la
// pantalla decide sola, PURO para probarlo por comportamiento. Sin React, sin red.
//
// La autoridad es el servidor: manage-api-keys aplica las reglas del scope
// (escritura.ts) y la base valida el nombre visible (api_keys_nombre_visible,
// migración 20261001200000). Aquí se repite solo lo que se puede saber sin datos de
// la agencia —la forma del nombre y las raíces reservadas— para avisar antes de
// mandar; las personas de la agencia y los nombres ya usados los dice el servidor,
// con su mensaje traducido.

export const SCOPE_MESSENGER_LECTURA = "messenger:read";
export const SCOPE_MESSENGER_ESCRITURA = "messenger:write";
const SCOPES_MESSENGER: readonly string[] = [SCOPE_MESSENGER_LECTURA, SCOPE_MESSENGER_ESCRITURA];

/** Los dos del Messenger exigen IPs exactas, vencimiento de 90 días como máximo y
 *  solo van en keys nuevas (igual que esScopeMessenger de manage-api-keys). */
export const esScopeMessenger = (s: string): boolean => SCOPES_MESSENGER.includes(s);
/** El único scope que escribe. Los demás son de lectura («Solo lectura»). */
export const esScopeDeEscritura = (s: string): boolean => s === SCOPE_MESSENGER_ESCRITURA;
export const escribe = (scopes: readonly string[]): boolean => scopes.includes(SCOPE_MESSENGER_ESCRITURA);
/** Una key que escribe HOY o que escribió alguna vez: le quitaron write pero conserva
 *  su nombre visible (reservado para siempre a su integración). A esa se le puede
 *  retirar lo que mandó y se la puede reemplazar. Por el nombre y NO por
 *  integracion_id: toda key tiene integración, también las que nunca escribieron. */
export const escribioAlgunaVez = (k: { scopes: readonly string[]; api_display_name?: string | null }): boolean =>
  escribe(k.scopes) || !!k.api_display_name;

/** Tildar o destildar un scope. write va siempre con read: tildar write tilda read, y
 *  destildar read destilda write (una key que escribe sin leer no existe; el servidor
 *  la rechazaría). */
export function alternarScope(scopes: readonly string[], k: string): string[] {
  if (scopes.includes(k)) {
    const sin = scopes.filter((s) => s !== k);
    return k === SCOPE_MESSENGER_LECTURA ? sin.filter((s) => s !== SCOPE_MESSENGER_ESCRITURA) : sin;
  }
  const con = [...scopes, k];
  return k === SCOPE_MESSENGER_ESCRITURA && !con.includes(SCOPE_MESSENGER_LECTURA) ? [...con, SCOPE_MESSENGER_LECTURA] : con;
}

// ─── El nombre visible ───────────────────────────────────────────────────────

export const NOMBRE_VISIBLE_MIN = 2;
export const NOMBRE_VISIBLE_MAX = 32;

/** Como lo guarda la base: NFC, recortado y los espacios seguidos en uno. */
export function normalizarNombreVisible(t: string): string {
  return t.normalize("NFC").trim().replace(/ {2,}/g, " ");
}

// Letras de Latin-1 (U+00C0–U+00FF sin × ni ÷), números, espacio y . & _ -: la misma
// clase que arma la base con chr(). Con escapes: un carácter raro no se ve.
const FORMA = /^[A-Za-z0-9À-ÖØ-öø-ÿ .&_-]+$/;

// api_sin_acentos: las dos listas del translate() de la base, en el mismo orden.
const CON_ACENTO =
  "ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖØÙÚÛÜÝ" +
  "àáâãäåçèéêëìíîïðñòóôõöøùúûüýÿ";
const SIN_ACENTO = "AAAAAACEEEEIIIIDNOOOOOOUUUUY" + "aaaaaaceeeeiiiidnoooooouuuuyy";
const DIGITOS = "013457";
const LETRAS_DE_DIGITOS = "oieast";

/** El esqueleto de un nombre, como api_esqueleto de la base: sin tildes, en
 *  minúsculas, los números que imitan letras como letras («Mav3n» = «maven») y todo
 *  lo que no es [a-z0-9] como un espacio. */
export function esqueleto(t: string): string {
  const ligaduras = t
    .normalize("NFC")
    .replace(/Æ/g, "AE").replace(/æ/g, "ae").replace(/ß/g, "ss")
    .replace(/Þ/g, "TH").replace(/þ/g, "th");
  const sinAcentos = Array.from(ligaduras, (c) => {
    const i = CON_ACENTO.indexOf(c);
    return i >= 0 ? SIN_ACENTO[i] : c;
  }).join("").toLowerCase();
  const sinDigitos = sinAcentos.replace(/[013457]/g, (d) => LETRAS_DE_DIGITOS[DIGITOS.indexOf(d)]);
  return sinDigitos.replace(/[^a-z0-9]+/g, " ").trim();
}

/** Las raíces que la base no deja en un nombre visible (como subcadena del esqueleto
 *  sin espacios). El test las compara con la migración: si cambian allá, falla. */
export const RAICES_RESERVADAS: readonly string[] = [
  "maven", "admin", "soporte", "support", "sistem", "system", "segur", "secur", "rrhh", "recursoshumanos",
  "talentohumano", "nomina", "payroll", "finanz", "contab", "tesorer", "helpdesk", "ayuda", "oficial", "staff",
  "moderad", "ceo", "gerenc", "direcc", "notific", "clari", "anthropic", "claude",
];

export type ProblemaDelNombre = "vacio" | "forma" | "reservado";

/** Lo que ya se sabe que la base rechazaría, o null. null NO quiere decir que la base
 *  lo acepte: puede parecerse a una persona de la agencia o estar usado por otra
 *  integración, y eso lo contesta el servidor. */
export function problemaDelNombreVisible(crudo: string): ProblemaDelNombre | null {
  const nombre = normalizarNombreVisible(crudo);
  if (nombre === "") return "vacio";
  const largo = Array.from(nombre).length;
  const sin = esqueleto(nombre).replace(/ /g, "");
  const largoValido = NOMBRE_VISIBLE_MIN <= largo && largo <= NOMBRE_VISIBLE_MAX;
  if (!largoValido || !FORMA.test(nombre) || sin.length < 2) return "forma";
  if (RAICES_RESERVADAS.some((r) => sin.includes(r))) return "reservado";
  return null;
}

// ─── La retirada de emergencia ───────────────────────────────────────────────
// api_retirar_mensajes_de_integracion (migración 20261001200000, §4.2.9): retira como
// mucho 200 mensajes por llamada y devuelve {retirados, quedan}. `quedan` se cuenta
// hasta 1.001: más de 1.000 se dice así.

export const TANDA_DE_RETIRADA = 200;
/** Lo que se espera cada tanda: más que el statement_timeout de la base (8 s), para
 *  no cortar una que todavía puede terminar bien. */
export const PLAZO_DE_TANDA_MS = 15_000;
export const QUEDAN_TOPE = 1000;
/** 100 tandas = 20.000 mensajes: el doble de lo que una key puede mandar en un día.
 *  Si después de eso sigue habiendo, se para y se dice (la integración sigue mandando:
 *  hay que revocar la key). */
export const MAX_TANDAS = 100;

export type Tanda = { retirados: number; quedan: number };

/** Lo que devolvió la base, o null si es otra forma (un contrato roto). */
export function leerTanda(v: unknown): Tanda | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const entero = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0;
  return entero(o.retirados) && entero(o.quedan) ? { retirados: o.retirados, quedan: o.quedan } : null;
}

export type Progreso = { retirados: number; quedan: number | null; tandas: number };
export type FinDeLaRetirada =
  | { estado: "listo"; retirados: number; quedan: 0 }
  | { estado: "detenido"; retirados: number; quedan: number | null }
  | { estado: "atascado"; retirados: number; quedan: number | null }
  | { estado: "error"; retirados: number; quedan: number | null; error: unknown };

/** Llama a la base tanda por tanda hasta que no quede nada. Para antes si: alguien
 *  la detiene (`seguir` da false; la tanda en curso termina), una tanda no retira nada
 *  y todavía quedan (no hay progreso: no se repite para siempre), se llega a
 *  MAX_TANDAS, o la base contesta un error. Lo retirado ANTES de un error queda
 *  retirado: volver a correrla sigue desde ahí. */
export async function retirarEnTandas(
  tanda: () => Promise<unknown>,
  opciones: { alProgresar?: (p: Progreso) => void; seguir?: () => boolean; maxTandas?: number } = {},
): Promise<FinDeLaRetirada> {
  const max = opciones.maxTandas ?? MAX_TANDAS;
  let retirados = 0;
  let quedan: number | null = null;
  let tandas = 0;
  for (;;) {
    if (opciones.seguir && !opciones.seguir()) return { estado: "detenido", retirados, quedan };
    if (tandas >= max) return { estado: "atascado", retirados, quedan };
    let crudo: unknown;
    try {
      crudo = await tanda();
    } catch (error) {
      return { estado: "error", retirados, quedan, error };
    }
    const r = leerTanda(crudo);
    if (!r) return { estado: "error", retirados, quedan, error: new Error("forma inesperada") };
    tandas += 1;
    retirados += r.retirados;
    quedan = r.quedan;
    opciones.alProgresar?.({ retirados, quedan, tandas });
    if (r.quedan === 0) return { estado: "listo", retirados, quedan: 0 };
    if (r.retirados === 0) return { estado: "atascado", retirados, quedan };
  }
}

export type ErrorDeRetirada = "sin_sesion" | "sin_permiso" | "sin_llave" | "sin_saber" | "otro";

/** Un código que puso la base (SQLSTATE de 5, propios MV… o de PostgREST): la tanda
 *  se deshizo entera. Sin él (se cortó la red, se venció el plazo, la puerta de enlace
 *  contestó 5xx) no se sabe si la base alcanzó a aplicarla. */
const esCodigoDeLaBase = (code: unknown): boolean =>
  typeof code === "string" && (/^[0-9A-Z]{5}$/.test(code) || code.startsWith("PGRST"));

/** El error de la base (PostgrestError: code MV401/MV403/MV404 y detail
 *  {"error": …}) como uno de los casos que la pantalla explica. */
export function errorDeRetirada(e: unknown): ErrorDeRetirada {
  const err = (e && typeof e === "object" ? e : {}) as { code?: unknown; details?: unknown };
  let dicho: unknown;
  if (typeof err.details === "string") {
    try {
      dicho = (JSON.parse(err.details) as { error?: unknown })?.error;
    } catch {
      dicho = undefined;
    }
  }
  if (err.code === "MV401" || dicho === "unauthorized") return "sin_sesion";
  if (err.code === "MV403" || err.code === "42501" || dicho === "forbidden") return "sin_permiso";
  if (err.code === "MV404" || dicho === "not_found") return "sin_llave";
  // No es un fallo: es no saber. La pantalla lo dice así y deja seguir (seguir no
  // retira nada dos veces).
  if (!esCodigoDeLaBase(err.code)) return "sin_saber";
  return "otro";
}

export type Desde = "hora" | "dia" | "semana" | "todo" | "fecha";

/** Desde cuándo se retira, en ISO; null = todo lo que mandó (la base lo toma como
 *  -infinity). `fecha` es el valor de un <input type="datetime-local"> (hora local);
 *  undefined si falta o no se entiende, o si está en el futuro (no habría nada). */
export function desdeCuando(eleccion: Desde, ahora: number, fecha: string): string | null | undefined {
  const hace = (ms: number) => new Date(ahora - ms).toISOString();
  if (eleccion === "hora") return hace(3_600_000);
  if (eleccion === "dia") return hace(86_400_000);
  if (eleccion === "semana") return hace(7 * 86_400_000);
  if (eleccion === "todo") return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(fecha)) return undefined;
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime()) || d.getTime() > ahora) return undefined;
  return d.toISOString();
}

// ─── Maven sin actualizar ────────────────────────────────────────────────────

/** El build desde el que Maven dibuja la etiqueta API. La etiqueta y la versión en la
 *  presencia (`b`) llegaron en el MISMO cambio (#1983): toda pestaña que dice su
 *  versión la tiene. Así, versionesConectadas(1) da justo las que no dicen versión,
 *  que son las que verían a «BLU» como si fuera la persona de la key. */
export const BUILD_CON_ETIQUETA_API = 1;
