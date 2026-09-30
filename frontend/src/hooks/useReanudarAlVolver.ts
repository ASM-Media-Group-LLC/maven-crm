import { useEffect, useRef } from "react";

export const MINIMO_OCULTO_MS = 30_000;

/** Lo mismo que el hook de abajo, pero fuera de React: para quien vive en un
 *  módulo y no en un componente (el canal del chat, canalDelChat.ts). Devuelve
 *  cómo dejar de escuchar. */
export function escucharLaVuelta(
  alVolver: (ocultoMs: number) => void,
  minimo: number = MINIMO_OCULTO_MS,
): () => void {
  if (typeof document === "undefined") return () => {};
  let ocultoDesde: number | null = document.visibilityState === "hidden" ? Date.now() : null;

  const alCambiarVisibilidad = () => {
    if (document.visibilityState === "hidden") {
      ocultoDesde = Date.now();
      return;
    }
    if (ocultoDesde === null) return;
    const ocultoMs = Date.now() - ocultoDesde;
    ocultoDesde = null;
    if (ocultoMs >= minimo) alVolver(ocultoMs);
  };
  // bfcache: la página vuelve "congelada" con todo lo que tenía, sockets incluidos.
  const alMostrar = (e: PageTransitionEvent) => {
    if (e.persisted) alVolver(Number.POSITIVE_INFINITY);
  };
  const alRecuperarRed = () => alVolver(Number.POSITIVE_INFINITY);

  document.addEventListener("visibilitychange", alCambiarVisibilidad);
  window.addEventListener("pageshow", alMostrar);
  window.addEventListener("online", alRecuperarRed);
  return () => {
    document.removeEventListener("visibilitychange", alCambiarVisibilidad);
    window.removeEventListener("pageshow", alMostrar);
    window.removeEventListener("online", alRecuperarRed);
  };
}

/** Avisa cuando la app vuelve a primer plano tras estar oculta un rato (o al
 *  salir del bfcache, o al recuperar red). En el teléfono el sistema corta el
 *  socket de realtime cuando la pestaña queda en segundo plano y Supabase deja
 *  el canal en CLOSED sin volver a levantarlo: quien vuelve a Maven veía la
 *  lista de chats congelada hasta el próximo poll. El callback va por ref para
 *  no re-suscribir los listeners en cada render. */
export function useReanudarAlVolver(
  alVolver: (ocultoMs: number) => void,
  opciones?: { minimoOcultoMs?: number },
): void {
  const alVolverRef = useRef(alVolver);
  alVolverRef.current = alVolver;
  const minimo = opciones?.minimoOcultoMs ?? MINIMO_OCULTO_MS;

  useEffect(() => escucharLaVuelta((ocultoMs) => alVolverRef.current(ocultoMs), minimo), [minimo]);
}
