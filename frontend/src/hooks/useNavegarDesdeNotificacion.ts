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
export const TIPO_ABRIR_URL = "abrir-url";
const RUTAS_PERMITIDAS = /^\/(?![\/\\])[^\s]{0,2000}$/;

export function rutaSegura(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const d = data as { type?: unknown; url?: unknown };
  if (d.type !== TIPO_ABRIR_URL || typeof d.url !== "string") return null;
  return RUTAS_PERMITIDAS.test(d.url) ? d.url : null;
}

export function useNavegarDesdeNotificacion(): void {
  const navigate = useNavigate();
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const sw = navigator.serviceWorker;
    const alMensaje = (e: MessageEvent) => {
      const ruta = rutaSegura(e.data);
      if (ruta) navigate(ruta);
    };
    sw.addEventListener("message", alMensaje);
    return () => sw.removeEventListener("message", alMensaje);
  }, [navigate]);
}
