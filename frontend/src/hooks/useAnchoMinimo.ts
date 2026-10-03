import { useEffect, useState } from "react";

/** ¿La pantalla tiene por lo menos `px` de ancho? Sincrónico en el primer
 *  dibujo, como useIsMobile (si no, el primer cuadro saltaría de diseño). */
export function useAnchoMinimo(px: number): boolean {
  const consulta = `(min-width: ${px}px)`;
  const [ancho, setAncho] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try { return window.matchMedia(consulta).matches; } catch { return window.innerWidth >= px; }
  });
  useEffect(() => {
    let mql: MediaQueryList;
    try { mql = window.matchMedia(consulta); } catch { return; }
    const alCambiar = (e: MediaQueryListEvent) => setAncho(e.matches);
    mql.addEventListener?.("change", alCambiar);
    setAncho(mql.matches);
    return () => mql.removeEventListener?.("change", alCambiar);
  }, [consulta]);
  return ancho;
}
