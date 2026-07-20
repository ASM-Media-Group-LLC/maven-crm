import { useCallback, useEffect, useRef, useState } from "react";

// Document Picture-in-Picture: abre una VENTANA de navegador separada (no un div dentro
// de la página) para el contenido que le portalizemos. Esa ventana:
//   • el SO la deja SIEMPRE AL FRENTE (always-on-top real, sobre otras apps),
//   • se puede arrastrar a CUALQUIER monitor,
//   • se redimensiona de forma NATIVA (bordes de ventana del SO).
// Es lo que usa Google Meet para su mini-ventana multi-monitor. Chrome/Edge 116+.
// Firefox/Safari todavía no lo soportan → el caller cae a la ventanita in-page.

export const docPipSupported = () =>
  typeof window !== "undefined" && "documentPictureInPicture" in window;

// Clona los estilos del documento principal a la ventana PiP (que nace en blanco):
// <style> inyectados (Tailwind/Vite dev) + <link rel=stylesheet> (bundle en prod),
// las clases de <html>/<body> (tema dark) y el fondo. Sin esto, la PiP se ve sin CSS.
function copyStyles(target: Window) {
  document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
    try { target.document.head.appendChild(node.cloneNode(true)); } catch { /* noop */ }
  });
  try {
    target.document.documentElement.className = document.documentElement.className;
    target.document.body.className = document.body.className;
    target.document.body.style.margin = "0";
    target.document.body.style.background = getComputedStyle(document.body).backgroundColor || "#14141a";
  } catch { /* noop */ }
}

export function usePipWindow() {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const pipRef = useRef<Window | null>(null);

  const closePip = useCallback(() => {
    try { pipRef.current?.close(); } catch { /* noop */ }
    pipRef.current = null;
    setPipWindow(null);
  }, []);

  // Debe llamarse DENTRO de un gesto del usuario (onClick). El await no rompe la
  // activación porque requestWindow se invoca sincrónicamente al inicio.
  const openPip = useCallback(async (opts?: { width?: number; height?: number }): Promise<boolean> => {
    if (!docPipSupported()) return false;
    try {
      const w: Window = await (window as unknown as {
        documentPictureInPicture: { requestWindow: (o: { width: number; height: number }) => Promise<Window> };
      }).documentPictureInPicture.requestWindow({
        width: opts?.width ?? 480,
        height: opts?.height ?? 420,
      });
      copyStyles(w);
      w.addEventListener("pagehide", () => { pipRef.current = null; setPipWindow(null); });
      pipRef.current = w;
      setPipWindow(w);
      return true;
    } catch {
      return false;
    }
  }, []);

  useEffect(() => () => { try { pipRef.current?.close(); } catch { /* noop */ } }, []);

  return { pipWindow, openPip, closePip, supported: docPipSupported() };
}
