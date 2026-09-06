import * as React from "react";

/** Mismo umbral para toda la app: el sidebar (Sheet), el muelle del Messenger y
 *  el patrón lista→chat de MessengerPage cortan acá. */
export const MOBILE_BREAKPOINT = 768;
const CONSULTA = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function esAnchoMovil(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.matchMedia(CONSULTA).matches;
  } catch {
    return window.innerWidth < MOBILE_BREAKPOINT;
  }
}

export function useIsMobile() {
  // Sincrónico a propósito: el primer render ya sabe si es teléfono. Con
  // `undefined` de arranque, el primer frame se pintaba como escritorio y
  // saltaba al siguiente (sidebar fijo → Sheet, dos columnas → una).
  const [isMobile, setIsMobile] = React.useState<boolean>(esAnchoMovil);

  React.useEffect(() => {
    const mql = window.matchMedia(CONSULTA);
    const onChange = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", onChange);
    setIsMobile(mql.matches);
    return () => mql.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}
