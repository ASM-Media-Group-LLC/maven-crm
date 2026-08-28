import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { applyStoredSkin } from "./hooks/useSkin";

// Skin de acento del usuario (Settings → Apariencia): aplicado ANTES del
// primer render para que la app no parpadee con el acento default. La
// sincronización con profiles.ui_skin llega después (useSkinSync en App);
// mientras tanto manda lo guardado en localStorage.
applyStoredSkin();

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
