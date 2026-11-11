// REGISTRO DEL SERVICE WORKER SIN TUMBAR LLAMADAS (11/11/2026).
//
// La causa de «la página se me recarga sola y se me cae la llamada»: el registro
// que trae vite-plugin-pwa («virtual:pwa-register», modo prompt) hace, al
// detectar una versión nueva, `addEventListener("controlling", e =>
// e.isUpdate && window.location.reload())` SIN preguntar nada. Y como el SW
// nuevo hace skipWaiting + clientsClaim, en cuanto UNA pestaña lo instala (el
// chequeo de cada hora, o abrir Maven en otra pestaña) toma el control de TODAS
// y cada pestaña abierta se recarga, con llamada o sin ella. Maven se despliega
// varias veces al día: cada deploy podía tumbar las llamadas de Cowork de quien
// tuviera Maven abierto, una por una, dentro de la hora siguiente.
//
// Este registro hace lo mismo que el del plugin (mismo SW, mismo aviso de
// «Nueva versión»), con una sola diferencia: si hay una llamada conectada en la
// pestaña NO recarga; deja el aviso para que la persona recargue al colgar.
//
// La URL ("/sw.js", scope "/", classic) es la que compila vite-plugin-pwa con la
// configuración de vite.config.ts (registerType "prompt", injectRegister false).

export interface EventoSw {
  isUpdate?: boolean;
  isExternal?: boolean;
}

/** Lo que se usa de workbox-window (inyectable para los tests). */
export interface WorkboxMinimo {
  addEventListener(tipo: "installed" | "waiting" | "controlling", fn: (e: EventoSw) => void): void;
  messageSkipWaiting(): void;
  register(opciones?: { immediate?: boolean }): Promise<ServiceWorkerRegistration | undefined>;
}

export interface OpcionesDelRegistro {
  /** Mostrar el aviso de «Nueva versión disponible» (con su botón Recargar). */
  alNecesitarRecarga: () => void;
  alRegistrar?: (registro: ServiceWorkerRegistration | undefined) => void;
  /** ¿Hay una llamada conectada (o entrando) en esta pestaña? */
  enLlamada: () => boolean;
  /** Ya cambió la versión pero hay llamada: avisar que recargue al colgar. */
  alQuedarPendiente: () => void;
  recargar: () => void;
  crearWorkbox?: () => Promise<WorkboxMinimo | undefined>;
}

const workboxReal = async (): Promise<WorkboxMinimo | undefined> => {
  if (!("serviceWorker" in navigator)) return undefined;
  const { Workbox } = await import("workbox-window");
  return new Workbox("/sw.js", { scope: "/", type: "classic" }) as unknown as WorkboxMinimo;
};

/** Registra el SW. Devuelve `actualizar(recargar)`, igual que el registerSW del
 *  plugin: manda skipWaiting al SW en espera; la recarga la hace «controlling». */
export function registrarSw(o: OpcionesDelRegistro): (recargar?: boolean) => Promise<void> {
  let wb: WorkboxMinimo | undefined;
  let avisado = false;

  const alHaberVersionNueva = () => {
    if (avisado) return;
    avisado = true;
    wb?.addEventListener("controlling", (e) => {
      if (!e.isUpdate) return;
      // EL ARREGLO: con llamada no se recarga. La pestaña sigue con la versión
      // que tiene (anda bien) y la persona recarga cuando cuelgue.
      if (o.enLlamada()) {
        o.alQuedarPendiente();
        return;
      }
      o.recargar();
    });
    o.alNecesitarRecarga();
  };

  const listo = (async () => {
    try {
      wb = await (o.crearWorkbox ?? workboxReal)();
    } catch {
      wb = undefined;
    }
    if (!wb) return;
    // Mismo criterio que el plugin para saber que hay una versión nueva.
    wb.addEventListener("installed", (e) => {
      if (e.isUpdate === undefined && e.isExternal) alHaberVersionNueva();
    });
    wb.addEventListener("waiting", alHaberVersionNueva);
    try {
      o.alRegistrar?.(await wb.register({ immediate: false }));
    } catch {
      /* sin SW la app funciona igual */
    }
  })();

  return async () => {
    await listo;
    wb?.messageSkipWaiting();
  };
}
