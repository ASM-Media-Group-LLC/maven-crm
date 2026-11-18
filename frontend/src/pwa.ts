// This file is only imported dynamically in production (see main.tsx)
import { toast } from "sonner";
import { getTranslation, type Language } from "./lib/i18n";
import { BUILD_PROPIO, crearVigiaDelMinimo } from "./lib/versionDelBundle";
import { almacenDeLaPestana, forzarActualizacion, leerUiBuildMinimo } from "./lib/minimoDelBundle";
import { hayLlamadaActiva } from "./lib/llamadaActiva";
import { registrarSw } from "./lib/registroDelSw";
import { crearRecargaAlColgar, estaEscribiendoAhora, hayAlgoAMedioEscribir, marcarRecarga } from "./lib/recargaAlColgar";
import { abrirCartelVersionNueva } from "./lib/cartelVersionNueva";

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
  // app NO cargó, así que el CSS con las variables puede no estar. #4a8de0 es el
  // azul acero primario (hsl 213 70% 58%) escrito a mano para que se vea igual.
  btn.style.cssText = "background:#4a8de0;color:#fff;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:13px";
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

  // /aportar/<token> es la página pública de creadoras externas que suben videos
  // grandes. Si salta "Nueva versión · Recargar" en medio de una subida y le dan
  // click, se pierde todo el avance. Además, el SW que les quedó instalado en
  // visitas anteriores les seguía sirviendo bundles cacheados VIEJOS (con bugs
  // ya arreglados, p.ej. el x-upsert que daba 403 al subir con TUS). Entonces
  // acá no registramos SW nuevo Y además desregistramos cualquier SW anterior +
  // borramos los caches, forzando al navegador a bajar el bundle fresco en la
  // próxima recarga. La creadora ve el aviso y refresca una sola vez.
  if (window.location.pathname.startsWith("/aportar/") || window.location.pathname.startsWith("/subir/")) {
    void (async () => {
      try {
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          const habiaSw = regs.length > 0;
          await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
          if ("caches" in window) {
            const names = await caches.keys();
            await Promise.all(names.map((n) => caches.delete(n).catch(() => false)));
          }
          if (habiaSw) {
            // Había un SW viejo sirviendo bundles cacheados: una recarga trae
            // el bundle fresco ya sin SW en el medio.
            window.location.reload();
          }
        }
      } catch { /* no bloquear la página por esto */ }
    })();
    return;
  }

  try {
    // Registro propio (lib/registroDelSw.ts) en vez de «virtual:pwa-register»:
    // el del plugin recargaba TODAS las pestañas al salir una versión nueva, con
    // llamada o sin ella, y cada deploy tumbaba llamadas de Cowork (11/11/2026).
    let registro: ServiceWorkerRegistration | undefined;
    const lang: Language = localStorage.getItem("app-language") === "en" ? "en" : "es";
    // VERSIÓN NUEVA: Maven se recarga solo, pero NUNCA en una llamada ni con
    // algo a medio escribir (lib/recargaAlColgar.ts, Alvaro 17/11/2026). Con
    // llamada, un aviso SIN botón (tocar «Recargar» cortaba la propia llamada) y
    // al colgar se recarga sola. Una vez por versión: no hay bucle.
    const almacen = almacenDeLaPestana();
    const build = String(BUILD_PROPIO);
    const ocupada = () => hayLlamadaActiva() || hayAlgoAMedioEscribir();
    const recargarUnaVez = () => { marcarRecarga(almacen, build); window.location.reload(); };
    const avisar = crearRecargaAlColgar({
      enLlamada: hayLlamadaActiva,
      // El cartel solo espera a que suelte el campo donde está escribiendo.
      aMedioEscribir: () => estaEscribiendoAhora(),
      // EL CARTEL DEL CENTRO (Alvaro, 18/11/2026): «Actualizar» pasa a la versión
      // nueva. Mira solo la llamada: lo que tenga escrito, lo decide la persona.
      mostrarCartel: () => abrirCartelVersionNueva(
        () => forzarActualizacion(registro, updateSW, recargarUnaVez, hayLlamadaActiva),
      ),
      // Busca el SW nuevo, le da el control y recarga; mira la llamada y lo escrito
      // otra vez justo antes (en esos segundos alguien puede entrar a una llamada).
      pasarALaNueva: () => forzarActualizacion(registro, updateSW, recargarUnaVez, ocupada),
      almacen,
      build,
      mostrarEnLlamada: () => {
        if (document.querySelector("[data-sonner-toaster]")) {
          toast(getTranslation("pwa.actualizar.enLlamada", lang), { id: "pwa-update", duration: Infinity });
        }
      },
      mostrarNormal: () => mostrarAvisoDeActualizacion(
        getTranslation("pwa.actualizar.titulo", lang),
        getTranslation("pwa.actualizar.boton", lang),
        // updateSW(true) manda skipWaiting al SW en espera y recarga cuando toma
        // control. El window.location.reload() pelado NO alcanzaba: el SW nuevo
        // quedaba "waiting", la página recargaba y seguía sirviendo el bundle VIEJO
        // → el equipo quedaba clavado en versiones de días atrás aunque clickeara
        // "Recargar" (así Fabiana no veía el aviso "Ya registrado hoy" de Promolog).
        () => { updateSW(true).catch(() => window.location.reload()); },
      ),
    });
    const updateSW = registrarSw({
      // Las pestañas de Maven viven abiertas por DÍAS (SPA, sin navegaciones) y el
      // navegador solo chequea el SW al navegar → el banner de update no aparecía
      // nunca en pestañas longevas. Chequeo explícito cada hora.
      alRegistrar(r) {
        registro = r;
        // Cada 10 minutos (Alvaro, 18/11/2026; antes cada hora) y al volver a
        // la pestaña, con freno de 1 minuto: mirar es bajar un archivito.
        if (r) {
          let ultima = Date.now();
          const mirar = () => {
            if (Date.now() - ultima < 60_000) return;
            ultima = Date.now();
            r.update().catch(() => {});
          };
          setInterval(() => { ultima = 0; mirar(); }, 10 * 60 * 1000);
          window.addEventListener("focus", mirar);
          document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") mirar(); });
        }
      },
      alNecesitarRecarga: avisar,
      enLlamada: hayLlamadaActiva,
      // Con llamada no se recarga: queda el aviso y se recarga sola al colgar.
      alQuedarPendiente: avisar,
      // El SW nuevo ya tomó el control sin llamada: también por el camino seguro
      // (nada a medio escribir, una vez por versión).
      recargar: avisar,
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
