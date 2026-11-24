import { estaEnLlamadaDeMaven } from "@/lib/llamadaEnMaven";

// Precarga de secciones: la navegación instantánea SIN volver a cargar todo.
//
// Desde el 28/08/2026 las 125 pantallas se cargan por ruta: el arranque bajó de
// 4,9 MB a 1,4 MB y el precache de la PWA de 8,8 a 2,5 — y eso importa porque
// el servidor a veces entrega a 5 KB/s y comparte el uplink con el video de
// LiveKit. El costo fue visible: la PRIMERA vez que alguien abre una sección
// hay 200–400 ms de barra de carga, una vez por sección y por deploy (y Maven
// despliega varias veces al día).
//
// Esto es el punto medio que se intentó en mayo (#167) y se revirtió sin
// explicación: mantener el arranque liviano y traer en segundo plano, cuando la
// red está quieta, SOLO las secciones que esa persona puede ver. Dos vías:
//
//   · Al pasar el mouse por un ítem del menú (o enfocarlo con el teclado): el
//     chunk empieza a bajar en el hueco entre el hover y el clic.
//   · Después de cargar los permisos, en ocio: las secciones visibles para su
//     rol, de a una, espaciadas, y NUNCA durante una llamada.
//
// Lo que no se precarga: nada que el rol no vea, nada con la red en modo ahorro
// o lenta, y nada mientras hay una llamada de Maven en curso — ahí cada KB del
// servidor es para el video.

/** El MISMO módulo que importa App.tsx para cada ruta. Vite resuelve los dos
 *  imports al mismo archivo, así que es el mismo chunk: precargarlo acá es
 *  tenerlo listo allá. Si una ruta cambia de módulo en App.tsx hay que cambiarla
 *  acá — la prueba de humo del build lo delata (chunk duplicado). */
const IMPORTADORES: Record<string, () => Promise<unknown>> = {
  "/dashboard": () => import("@/pages/Dashboard"),
  "/dashboard2": () => import("@/pages/Dashboard2"),
  "/correo": () => import("@/pages/correo/CorreoPage"),
  "/messenger": () => import("@/pages/Messenger"),
  "/cowork": () => import("@/pages/cowork/CoworkPage"),
  "/meet": () => import("@/pages/meet/MeetPage"),
  "/grabaciones": () => import("@/pages/grabaciones/GrabacionesPage"),
  "/contactos": () => import("@/pages/Contactos"),
  "/promolog": () => import("@/pages/Promolog"),
  "/parrilla": () => import("@/pages/Parrilla"),
  "/personalizados": () => import("@/pages/personalizados/PersonalizadosPage"),
  "/leadgen": () => import("@/pages/LeadGen"),
  "/closers": () => import("@/pages/Closers"),
  "/telefonos": () => import("@/pages/telefonos/TelefonosPage"),
  "/inbox": () => import("@/pages/inbox/InboxPage"),
  "/telegram/bandeja": () => import("@/pages/telegram/TelegramInboxPage"),
  "/tickets": () => import("@/pages/Tickets"),
  "/chatter-evaluator": () => import("@/pages/ChatterEvaluator"),
  "/chatter-evaluator/rendimiento": () => import("@/pages/chatters/ChatterRendimiento"),
  "/chatters/horarios": () => import("@/pages/chatters/horarios/HorariosPage"),
  "/scouter-assist": () => import("@/pages/scouter/ScouterAssist"),
  "/agency-qa": () => import("@/pages/agency-qa/AgencyQA"),
  "/conexion": () => import("@/pages/conexion/GuiaConexionPage"),
  "/app": () => import("@/pages/guiaApp/GuiaAppPage"),
  // Argos (pantallas al instante, 19/11/2026): una de las cinco pantallas
  // principales y no estaba en el mapa.
  "/hr/monitor-ia": () => import("@/pages/hr/HRMonitorIA"),
};

/** Segundos entre dos chunks en la precarga de ocio: que sea un goteo, no una
 *  ráfaga que compita con lo que la persona sí está mirando. */
export const ESPACIO_ENTRE_CHUNKS_MS = 1_500;

/** La precarga es opcional: sin red, ahorro de datos o 3G, se espera. */
function redEscasa(): boolean {
  if (navigator.onLine === false) return true;
  const c = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  if (!c) return false;
  if (c.saveData) return true;
  return c.effectiveType === "slow-2g" || c.effectiveType === "2g" || c.effectiveType === "3g";
}

function enOcio(fn: () => void): () => void {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void };
  if (typeof w.requestIdleCallback === "function") {
    const id = w.requestIdleCallback(fn, { timeout: 4_000 });
    return () => w.cancelIdleCallback?.(id);
  }
  // Safari no tiene requestIdleCallback: un respiro fijo hace el mismo papel.
  const id = window.setTimeout(fn, 1_200);
  return () => window.clearTimeout(id);
}

/** Fabrica un precargador sobre un mapa de importadores. La app usa el de abajo;
 *  las pruebas le pasan uno propio para no arrastrar páginas reales. */
export function crearPrecargador(importadores: Record<string, () => Promise<unknown>>) {
  const hechas = new Set<string>();
  const cargando = new Map<string, Promise<void>>();

  /** Precarga una ruta. Idempotente, nunca lanza: un chunk que no baja hoy
   *  bajará al hacer clic, como siempre. */
  const precargarRuta = (url: string): Promise<void> | undefined => {
    const imp = importadores[url];
    if (!imp || hechas.has(url)) return cargando.get(url);
    hechas.add(url);
    try {
      const carga = imp()
        .then(() => {}, () => { hechas.delete(url); })
        .finally(() => { cargando.delete(url); });
      cargando.set(url, carga);
      return carga;
    } catch {
      hechas.delete(url);
      return;
    }
  };

  /**
   * Precarga varias rutas en ocio, de a una y espaciadas. Devuelve una función
   * para cancelar lo que falte (al desmontar, al cambiar de rol).
   */
  const precargarEnOcio = (urls: string[]): (() => void) => {
    const pendientes = [...new Set(urls)].filter((u) => importadores[u] && !hechas.has(u));
    if (!pendientes.length || redEscasa()) return () => {};
    let cancelado = false;
    let cancelarPaso: (() => void) | null = null;

    const siguiente = () => {
      if (cancelado) return;
      if (!pendientes.length) return;
      // La red puede empeorar entre dos descargas. No se compite con una
      // llamada ni con la pestaña que la persona tiene al frente.
      if (redEscasa() || document.hidden || estaEnLlamadaDeMaven()) {
        const t = window.setTimeout(siguiente, 15_000);
        cancelarPaso = () => window.clearTimeout(t);
        return;
      }
      const url = pendientes.shift()!;
      // Antes el siguiente chunk arrancaba 1,5 s después, aunque este todavía
      // bajara. Una conexión lenta acumulaba todas las secciones en paralelo.
      // El respiro empieza DESPUÉS de que termina (o falla) la descarga actual.
      void Promise.resolve(precargarRuta(url)).then(() => {
        if (cancelado) return;
        const t = window.setTimeout(() => { cancelarPaso = enOcio(siguiente); }, ESPACIO_ENTRE_CHUNKS_MS);
        cancelarPaso = () => window.clearTimeout(t);
      });
    };

    cancelarPaso = enOcio(siguiente);
    return () => { cancelado = true; cancelarPaso?.(); };
  };

  return { precargarRuta, precargarEnOcio, rutasConocidas: () => Object.keys(importadores) };
}

const precargador = crearPrecargador(IMPORTADORES);
export const precargarRuta = precargador.precargarRuta;
export const precargarEnOcio = precargador.precargarEnOcio;

/**
 * La sección en la que ARRANCA la app (pantallas al instante, 19/11/2026).
 *
 * Al abrir Maven directo en /cowork, /messenger, /correo… el chunk de la página
 * recién se pedía cuando la sesión y los permisos ya habían llegado (la ruta
 * espera los permisos antes de dibujar la página). Pidiéndolo al arrancar, baja
 * EN PARALELO con la sesión y los permisos en vez de después. Es la misma
 * precarga inofensiva de arriba: una vez, sin lanzar, y si la ruta no está en
 * el mapa no hace nada. No mira si hay llamada: al arrancar no hay ninguna.
 */
export function precargarRutaActual(pathname: string = window.location.pathname): void {
  const ruta = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  precargarRuta(ruta);
}
