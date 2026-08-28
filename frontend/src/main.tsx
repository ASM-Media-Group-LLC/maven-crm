import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyStoredSkin, applyStoredAppearance } from "./hooks/useSkin";

// Skin de acento del usuario (Settings → Apariencia): aplicado ANTES del
// primer render para que la app no parpadee con el acento default. La
// sincronización con profiles.ui_skin llega después (useSkinSync en App);
// mientras tanto manda lo guardado en localStorage. applyStoredAppearance
// suma OLED/alto contraste/tono personalizado y el overlay de temporada
// (ui_prefs) — mismo contrato: local primero, el perfil sincroniza después.
applyStoredSkin();
applyStoredAppearance();

// --- Deploy con la app abierta ---
//
// Las páginas se cargan bajo demanda, y cada deploy reemplaza los archivos del
// servidor con nombres nuevos. Quien tenga Maven abierto de antes sigue pidiendo
// los viejos: al navegar a otra sección, ese archivo ya no existe y la pantalla
// queda rota sin decir por qué. Recargar trae la versión nueva y lo resuelve.
//
// El candado en sessionStorage es lo que impide un bucle: si al recargar vuelve
// a fallar, no es un deploy a mitad de camino sino un problema de verdad, y hay
// que dejar que se vea en vez de recargar para siempre.
window.addEventListener("vite:preloadError", (e) => {
  const CLAVE = "maven.recarga-por-deploy";
  const ANTIBUCLE_MS = 15_000;
  try {
    const ultima = Number(sessionStorage.getItem(CLAVE) ?? 0);
    // Si acabamos de recargar por esto, recargar otra vez no va a arreglarlo:
    // no es un deploy a mitad de camino sino un problema de verdad, y hay que
    // dejar que se vea. Con marca de TIEMPO y no un candado suelto porque el
    // candado habia que limpiarlo en algun momento, y limpiarlo al 'load' era
    // demasiado pronto: el chunk falla despues de que la pagina cargo, asi que
    // se limpiaba justo antes de volver a fallar y recargaba para siempre.
    if (Date.now() - ultima < ANTIBUCLE_MS) return;
    sessionStorage.setItem(CLAVE, String(Date.now()));
    e.preventDefault();
    window.location.reload();
  } catch {
    /* sin sessionStorage se deja pasar el error, que es el comportamiento previo */
  }
});

// --- PWA / Service Worker guard ---
// In iframes (preview hosts, embedded contexts) we disable the service
// worker so it doesn't interfere with the parent frame.
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

if (isInIframe) {
  // Unregister all service workers and clear caches in preview/iframe
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      registrations.forEach((r) => r.unregister());
    });
  }
  if ("caches" in window) {
    caches.keys().then((names) => {
      names.forEach((name) => caches.delete(name));
    });
  }
} else if (import.meta.env.PROD) {
  import("./pwa");
}

createRoot(document.getElementById("root")!).render(<App />);
