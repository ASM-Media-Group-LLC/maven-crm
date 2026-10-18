// This file is only imported dynamically in production (see main.tsx)
import { toast } from "sonner";
import { getTranslation, type Language } from "./lib/i18n";
import { BUILD_PROPIO, crearVigiaDelMinimo } from "./lib/versionDelBundle";
import { almacenDeLaPestana, forzarActualizacion, leerUiBuildMinimo } from "./lib/minimoDelBundle";
import { hayLlamadaActiva } from "./lib/llamadaActiva";

/** El aviso "Nueva versión disponible" como toast del design system (el mismo
 *  vidrio de todos los avisos), con `id` fijo para no duplicarse en el chequeo
 *  horario y sin caducar hasta que la persona recargue. <Sonner /> monta con la
 *  app (App.tsx); si el SW avisa antes —raro—, se reintenta tres veces y al
 *  final cae al banner viejo en DOM, que siempre existe. */
function mostrarAvisoDeActualizacion(titulo: string, boton: string, recargar: () => void, intento = 0) {
  if (document.querySelector("[data-sonner-toaster]")) {
    toast(titulo, { id: "pwa-update", duration: Infinity, action: { label: boton, onClick: recargar } });
    return;
  }
  if (intento < 3) {
    setTimeout(() => mostrarAvisoDeActualizacion(titulo, boton, recargar, intento + 1), 1000);
    return;
  }
  bannerDeRespaldo(titulo, boton, recargar);
}

function bannerDeRespaldo(titulo: string, boton: string, recargar: () => void) {
  if (document.getElementById("pwa-update-banner")) return; // no duplicar
  const banner = document.createElement("div");
  banner.id = "pwa-update-banner";
  banner.style.cssText =
    "position:fixed;bottom:calc(16px + env(safe-area-inset-bottom, 0px));left:50%;transform:translateX(-50%);z-index:99999;" +
    "background:#1a1a2e;color:#fff;padding:12px 24px;border-radius:8px;" +
    "display:flex;align-items:center;gap:12px;font-size:14px;box-shadow:0 4px 20px rgba(0,0,0,.4)";
  const span = document.createElement("span");
  span.textContent = titulo;
  const btn = document.createElement("button");
  btn.id = "pwa-reload-btn";
  btn.textContent = boton;
  // Hex literal (no token) a propósito: este banner es el fallback de cuando la
  // app NO cargó, así que el CSS con las variables puede no estar. #8660d2 es el
  // morado primario nuevo (hsl 260 56% 60%) escrito a mano para que se vea igual.
  btn.style.cssText = "background:#8660d2;color:#fff;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:13px";
  btn.addEventListener("click", recargar);
  banner.append(span, btn);
  document.body.appendChild(banner);
}

export async function initPWA() {
  const isInIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();

  const isPreviewHost =
    window.location.hostname.includes("id-preview--");

  const isProductionHost =
    !isPreviewHost && !isInIframe && window.location.hostname !== "localhost";

  if (!isProductionHost) return;

  // Skip in dev — vite-plugin-pwa only loads in production (see vite.config.ts),
  // so virtual:pwa-register doesn't exist during `npm run dev`.
  if (import.meta.env.DEV) return;

  try {
    // Static-string dynamic import: Vite resolves this at build time and
    // emits a real chunk for the SW registration. Using a literal string
    // is required — computed/obfuscated specifiers leave the literal
    // "virtual:pwa-register" in the bundle, which the browser then tries
    // to fetch as a URL and rejects with a CORS/scheme error.
    // @ts-expect-error - virtual module resolved by vite-plugin-pwa
    const { registerSW } = await import("virtual:pwa-register");
    let registro: ServiceWorkerRegistration | undefined;
    const updateSW = registerSW({
      // Las pestañas de Maven viven abiertas por DÍAS (SPA, sin navegaciones) y el
      // navegador solo chequea el SW al navegar → el banner de update no aparecía
      // nunca en pestañas longevas. Chequeo explícito cada hora.
      onRegisteredSW(_swUrl: string, r: ServiceWorkerRegistration | undefined) {
        registro = r;
        if (r) setInterval(() => { r.update().catch(() => {}); }, 60 * 60 * 1000);
      },
      onNeedRefresh() {
        const lang: Language = localStorage.getItem("app-language") === "en" ? "en" : "es";
        // updateSW(true) manda skipWaiting al SW en espera y recarga cuando toma
        // control. El window.location.reload() pelado NO alcanzaba: el SW nuevo
        // quedaba "waiting", la página recargaba y seguía sirviendo el bundle VIEJO
        // → el equipo quedaba clavado en versiones de días atrás aunque clickeara
        // "Recargar" (así Fabiana no veía el aviso "Ya registrado hoy" de Promolog).
        const recargar = () => {
          updateSW(true).catch(() => window.location.reload());
        };
        mostrarAvisoDeActualizacion(
          getTranslation("pwa.actualizar.titulo", lang),
          getTranslation("pwa.actualizar.boton", lang),
          recargar,
        );
      },
      onOfflineReady() {},
    });

    // EL MÍNIMO: si app_flags 'ui_build_minimo' dice que este build es viejo, se
    // actualiza sin preguntar (el aviso de arriba espera un clic que en pestañas
    // abiertas por días no llega). Al volver el foco y con freno de 10 min; una
    // vez por pestaña y por build (ver crearVigiaDelMinimo: no puede haber bucle);
    // nunca con una llamada conectada en la pestaña.
    const alVolver = crearVigiaDelMinimo({
      propio: BUILD_PROPIO,
      leerMinimo: leerUiBuildMinimo,
      // La llamada se vuelve a mirar justo antes de recargar: la búsqueda del SW
      // nuevo tarda hasta 6,5 s y en ese rato alguien puede entrar a una.
      forzar: () => forzarActualizacion(registro, updateSW, () => window.location.reload(), hayLlamadaActiva),
      almacen: almacenDeLaPestana(),
      ocupado: hayLlamadaActiva,
      ahora: () => Date.now(),
      desde: Date.now(),
    });
    const revisar = () => { if (document.visibilityState === "visible") void alVolver(); };
    window.addEventListener("focus", revisar);
    document.addEventListener("visibilitychange", revisar);
  } catch {
    // virtual:pwa-register not available (dev mode)
  }
}

initPWA();
