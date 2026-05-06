import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

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
