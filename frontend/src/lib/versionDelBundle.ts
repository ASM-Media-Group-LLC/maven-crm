// LA VERSIÓN DEL BUNDLE: qué Maven tiene abierto cada pestaña.
//
// Para qué: la etiqueta «API» de los mensajes que manda una integración vive en el
// frontend. Una pestaña con un bundle anterior pinta a «BLU» como si fuera la
// persona dueña de la key. Por eso la escritura por API no se enciende mientras
// haya alguien conectado con un bundle viejo (paso 4 del encendido), y de ahí en
// adelante `ui_build_minimo` obliga a actualizar a quien quede atrás.
//
// Tres piezas, todas puras salvo la constante:
//  - BUILD_PROPIO: la hora del build en ms (vite.config.ts → __MAVEN_BUILD__).
//    Viaja en la presencia como `b` (useOnlinePresence), que es broadcast: no
//    escribe nada en la base.
//  - versionesDesdePresencia: quién está conectado con un bundle anterior a un
//    mínimo, o sin `b` (los bundles de antes de este cambio no lo mandan).
//  - crearVigiaDelMinimo: al volver el foco, con freno, lee app_flags.valor de
//    'ui_build_minimo' y, si el build propio es más viejo, fuerza la
//    actualización UNA vez por pestaña (pwa.ts la conecta).

/** La hora del build de ESTA pestaña (ms). 0 = no se sabe (tests, o un build sin
 *  el define): en ese caso no se manda `b` ni se fuerza nada. */
export const BUILD_PROPIO: number =
  typeof __MAVEN_BUILD__ === "number" && Number.isFinite(__MAVEN_BUILD__) && __MAVEN_BUILD__ > 0
    ? __MAVEN_BUILD__
    : 0;

/** `b` tal como viaja en la presencia: un número de ms válido, o null. */
export function buildDeLaPresencia(p: unknown): number | null {
  const b = (p as { b?: unknown } | null | undefined)?.b;
  return typeof b === "number" && Number.isFinite(b) && b > 0 ? b : null;
}

export interface PersonaConVersionVieja {
  userId: string;
  /** El build más viejo entre sus pestañas, o null si alguna no manda `b`. */
  build: number | null;
}

/**
 * Las personas presentes con un bundle anterior a `minimo` o sin `b`.
 *
 * Mira TODAS las pestañas de cada persona (la presencia guarda una entrada por
 * pestaña bajo la misma llave): basta una vieja para que esa persona vea a «BLU»
 * como alguien del equipo. Cuenta también a quien aparece como desconectado: igual
 * tiene Maven abierto y ve los mensajes.
 */
export function versionesDesdePresencia(
  estado: Record<string, readonly unknown[] | undefined> | null | undefined,
  minimo: number,
): PersonaConVersionVieja[] {
  const viejas: PersonaConVersionVieja[] = [];
  for (const [userId, pestanas] of Object.entries(estado ?? {})) {
    if (!pestanas || pestanas.length === 0) continue;
    let masVieja: number | null = Number.POSITIVE_INFINITY;
    for (const p of pestanas) {
      const b = buildDeLaPresencia(p);
      if (b === null) { masVieja = null; break; }
      if (b < masVieja) masVieja = b;
    }
    if (masVieja === null || masVieja < minimo) viejas.push({ userId, build: masVieja });
  }
  return viejas;
}

// ─── El mínimo de app_flags ──────────────────────────────────────────────────

/** Cada cuánto, como mucho, se pregunta el mínimo (una lectura por PK por pestaña). */
export const FRENO_DEL_MINIMO_MS = 10 * 60 * 1000;

/** Un mínimo más adelante que esto respecto del reloj de la pestaña no es una hora
 *  de build (nadie despliega en el futuro): se ignora. Si no, un valor mal escrito
 *  (microsegundos, un número de más) forzaría una recarga en cada despliegue. */
export const TOLERANCIA_FUTURO_MS = 24 * 60 * 60 * 1000;

/** Dónde se anota que esta pestaña ya forzó por este mínimo. sessionStorage: es de
 *  la pestaña (las demás pestañas viejas también tienen que actualizarse) y
 *  sobrevive a la recarga (que es lo que corta el bucle). */
export const CLAVE_DEL_FORZADO = "maven-ui-build-minimo-forzado";

/** app_flags.valor → el mínimo en ms, o null si no hay uno que valga. */
export function interpretarMinimo(valor: unknown, ahora: number): number | null {
  if (typeof valor !== "string" && typeof valor !== "number") return null;
  const texto = String(valor).trim();
  if (!/^\d+$/.test(texto)) return null;
  const n = Number(texto);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  if (n > ahora + TOLERANCIA_FUTURO_MS) return null;
  return n;
}

export interface AlmacenDeLaPestana {
  getItem(clave: string): string | null;
  setItem(clave: string, valor: string): void;
}

export interface DependenciasDelVigia {
  /** El build de esta pestaña (BUILD_PROPIO). */
  propio: number;
  /** Lee app_flags.valor de 'ui_build_minimo'. Puede tirar o devolver null. */
  leerMinimo: () => Promise<unknown>;
  /** Trae el bundle nuevo (update del SW y recarga). */
  forzar: () => Promise<void> | void;
  /** sessionStorage (o null si no hay). */
  almacen: AlmacenDeLaPestana | null;
  /** true mientras no se puede recargar (una llamada de LiveKit conectada en esta
   *  pestaña: recargar la corta). Se vuelve a intentar en la próxima revisión. */
  ocupado?: () => boolean;
  ahora: () => number;
  /** Desde cuándo corre el freno: al cargar, la pestaña ya trae el último bundle
   *  (index.html va sin caché), así que la primera lectura espera un freno entero. */
  desde?: number;
}

export type ResultadoDelVigia =
  | "frenado"        // se preguntó hace menos de FRENO_DEL_MINIMO_MS (o hay una lectura en curso)
  | "sin_build"      // esta pestaña no sabe su build
  | "sin_minimo"     // no hay fila, valor null, ilegible, en el futuro, o falló la lectura
  | "al_dia"         // el build propio no es más viejo que el mínimo
  | "ya_forzado"     // ya se forzó en esta pestaña por este mínimo y desde este build: no se repite
  | "sin_almacen"    // no se puede anotar el forzado: sin esa marca podría haber un bucle, no se fuerza
  | "en_llamada"     // hace falta, pero hay una llamada en esta pestaña: se deja para la próxima
  | "forzado";

/**
 * El vigía del mínimo. Devuelve la función que se llama al volver el foco.
 *
 * Por qué no puede haber un bucle de recargas: antes de forzar se anota en
 * sessionStorage «mínimo:build propio». Si después de recargar la pestaña sigue
 * con el mismo build (el deploy no llegó, o el mínimo es de un build que no
 * existe), la marca coincide y no se fuerza de nuevo. Solo se vuelve a forzar
 * desde un build DISTINTO, o sea con un deploy nuevo de por medio. Si la marca no
 * se puede escribir, no se fuerza.
 */
export function crearVigiaDelMinimo(d: DependenciasDelVigia): () => Promise<ResultadoDelVigia> {
  let ultima = d.desde ?? Number.NEGATIVE_INFINITY;
  let enCurso = false;

  return async () => {
    if (d.propio <= 0) return "sin_build";
    const ahora = d.ahora();
    if (enCurso || ahora - ultima < FRENO_DEL_MINIMO_MS) return "frenado";
    ultima = ahora;
    enCurso = true;
    try {
      let valor: unknown;
      try {
        valor = await d.leerMinimo();
      } catch {
        return "sin_minimo";
      }
      const minimo = interpretarMinimo(valor, ahora);
      if (minimo === null) return "sin_minimo";
      if (d.propio >= minimo) return "al_dia";
      // Una recarga en medio de un Meet o de Cowork corta la llamada: se espera.
      // Sin anotar nada, para que la próxima revisión (sin llamada) sí fuerce.
      if (d.ocupado?.()) return "en_llamada";

      const marca = `${minimo}:${d.propio}`;
      try {
        if (!d.almacen) return "sin_almacen";
        if (d.almacen.getItem(CLAVE_DEL_FORZADO) === marca) return "ya_forzado";
        d.almacen.setItem(CLAVE_DEL_FORZADO, marca);
        if (d.almacen.getItem(CLAVE_DEL_FORZADO) !== marca) return "sin_almacen";
      } catch {
        return "sin_almacen";
      }
      await d.forzar();
      return "forzado";
    } finally {
      enCurso = false;
    }
  };
}
