// This file is only imported dynamically in production (see main.tsx)

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
    const updateSW = registerSW({
      // Las pestañas de Maven viven abiertas por DÍAS (SPA, sin navegaciones) y el
      // navegador solo chequea el SW al navegar → el banner de update no aparecía
      // nunca en pestañas longevas. Chequeo explícito cada hora.
      onRegisteredSW(_swUrl: string, r: ServiceWorkerRegistration | undefined) {
        if (r) setInterval(() => { r.update().catch(() => {}); }, 60 * 60 * 1000);
      },
      onNeedRefresh() {
        if (document.getElementById("pwa-update-banner")) return; // no duplicar
        const banner = document.createElement("div");
        banner.id = "pwa-update-banner";
        banner.style.cssText =
          "position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:99999;" +
          "background:#1a1a2e;color:#fff;padding:12px 24px;border-radius:8px;" +
          "display:flex;align-items:center;gap:12px;font-size:14px;box-shadow:0 4px 20px rgba(0,0,0,.4)";
        banner.innerHTML =
          '<span>Nueva versión disponible</span>' +
          '<button id="pwa-reload-btn" style="background:#6366f1;color:#fff;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-size:13px">Recargar</button>';
        document.body.appendChild(banner);
        document.getElementById("pwa-reload-btn")?.addEventListener("click", () => {
          // updateSW(true) manda skipWaiting al SW en espera y recarga cuando toma
          // control. El window.location.reload() pelado NO alcanzaba: el SW nuevo
          // quedaba "waiting", la página recargaba y seguía sirviendo el bundle VIEJO
          // → el equipo quedaba clavado en versiones de días atrás aunque clickeara
          // "Recargar" (así Fabiana no veía el aviso "Ya registrado hoy" de Promolog).
          updateSW(true).catch(() => window.location.reload());
        });
      },
      onOfflineReady() {},
    });
  } catch {
    // virtual:pwa-register not available (dev mode)
  }
}

initPWA();
