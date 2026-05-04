import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// --- PWA / Service Worker guard for Lovable preview ---
const isInIframe = (() => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
})();

const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com");

if (isPreviewHost || isInIframe) {
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
