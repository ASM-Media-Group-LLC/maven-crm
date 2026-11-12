import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

// Al tocar una notificación push, el service worker (sw-push.js) enfoca una
// ventana de Maven que ya esté abierta y le manda { type: "abrir-url", url }
// para que navegue por dentro (sin recargar la app). Este hook la escucha.
// Va montado en AppShell: vale para cualquier ruta protegida.
//
// La url viene del SW, y el SW la recibe del servidor, pero igual se valida:
// solo rutas internas absolutas ("/closers?id=…"). Nada con esquema ni
// protocolo-relativo ("//otro.sitio"): un mensaje raro de otro origen no puede
// sacarnos de Maven. Antes era una lista de 5 secciones; desde que los avisos
// de la campana (Closers, Creadoras, Evaluador…) también llegan al celular, el
// destino puede ser cualquier página de la app.
//
// EL AVISO PENDIENTE (iPhone, 11/11): en la app instalada, iOS a veces recarga
// la ventana congelada al volver y el postMessage se pierde, o abre la app en
// frío en el inicio y no en la url del aviso. El SW deja además la ruta anotada
// en la caché "maven-aviso-pendiente"; al despertar (montar, volver a la vista o
// recibir el foco) se lee, se borra y se navega ahí si todavía no estamos. Así
// tocar una alerta de Argos lleva SIEMPRE a la vista en vivo de esa persona.
export const TIPO_ABRIR_URL = "abrir-url";
const RUTAS_PERMITIDAS = /^\/(?![\/\\])[^\s]{0,2000}$/;
export const CACHE_AVISO_PENDIENTE = "maven-aviso-pendiente";
export const CLAVE_AVISO_PENDIENTE = "/__aviso-pendiente";
/** Pasado esto, la ruta anotada ya no es «lo que acabas de tocar». */
export const VIGENCIA_AVISO_PENDIENTE_MS = 2 * 60_000;

export function rutaSegura(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { type?: unknown; url?: unknown };
  if (d.type !== TIPO_ABRIR_URL || typeof d.url !== "string") return null;
  return RUTAS_PERMITIDAS.test(d.url) ? d.url : null;
}

/** La ruta anotada por el SW, si es segura y reciente. */
export function rutaPendienteVigente(data: unknown, ahora = Date.now()): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { url?: unknown; at?: unknown };
  if (typeof d.at !== "number" || ahora - d.at > VIGENCIA_AVISO_PENDIENTE_MS || d.at - ahora > 5_000) return null;
  return rutaSegura({ type: TIPO_ABRIR_URL, url: d.url });
}

async function tomarPendiente(): Promise<string | null> {
  if (typeof caches === "undefined") return null;
  try {
    const cache = await caches.open(CACHE_AVISO_PENDIENTE);
    const r = await cache.match(CLAVE_AVISO_PENDIENTE);
    if (!r) return null;
    await cache.delete(CLAVE_AVISO_PENDIENTE);
    return rutaPendienteVigente(await r.json().catch(() => null));
  } catch {
    return null;
  }
}

function borrarPendiente(): void {
  if (typeof caches === "undefined") return;
  void caches.open(CACHE_AVISO_PENDIENTE).then((c) => c.delete(CLAVE_AVISO_PENDIENTE)).catch(() => {});
}

const rutaActual = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;

export function useNavegarDesdeNotificacion(): void {
  const navigate = useNavigate();
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    const alMensaje = (e: MessageEvent) => {
      const ruta = rutaSegura(e.data);
      if (!ruta) return;
      // Llegó el mensaje: la nota de respaldo ya no hace falta. Si la nota ya
      // nos trajo aquí (el foco llegó antes), no se navega dos veces.
      borrarPendiente();
      if (ruta !== rutaActual()) navigate(ruta);
    };
    const revisarPendiente = () => {
      if (document.visibilityState === "hidden") return;
      void tomarPendiente().then((ruta) => {
        if (ruta && ruta !== rutaActual()) navigate(ruta);
      });
    };
    sw.addEventListener("message", alMensaje);
    document.addEventListener("visibilitychange", revisarPendiente);
    window.addEventListener("focus", revisarPendiente);
    revisarPendiente();
    return () => {
      sw.removeEventListener("message", alMensaje);
      document.removeEventListener("visibilitychange", revisarPendiente);
      window.removeEventListener("focus", revisarPendiente);
    };
  }, [navigate]);
}
