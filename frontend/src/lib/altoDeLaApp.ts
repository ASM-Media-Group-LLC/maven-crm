// El alto REAL de la app en la PWA instalada de iPhone.
//
// Con viewport-fit=cover el contenido se dibuja desde el borde superior de la
// pantalla (por eso la topbar lleva pt-safe), pero `100dvh` mide la pantalla
// MENOS la barra de estado (59 pt en los iPhone con Dynamic Island, 47 con
// notch, 20 en los viejos). Resultado: la caja de la app terminaba 59 pt antes
// del final y quedaba una franja muerta debajo del composer del Messenger,
// mientras el teclado y el botón flotante sí llegaban abajo.
//
// Se mide en vez de asumir: si `screen.height - innerHeight` da un faltante
// chico (el de una barra de estado), se compensa vía la variable
// --compensacion-alto que consume `.alto-de-la-app` (index.css). Si no falta
// nada (Android, Safari normal, escritorio), la variable queda en 0 y todo
// sigue midiendo 100dvh.
export function compensacionDeAlto(a: {
  screenHeight: number;
  innerHeight: number;
  esIos: boolean;
  standalone: boolean;
}): number {
  if (!a.esIos || !a.standalone) return 0;
  const faltante = Math.round(a.screenHeight - a.innerHeight);
  // Más de 80 px no es una barra de estado (es apaisado, o algo raro): no tocar.
  return faltante > 0 && faltante <= 80 ? faltante : 0;
}

function esIos(): boolean {
  return typeof CSS !== "undefined" && typeof CSS.supports === "function" && CSS.supports("-webkit-touch-callout", "none");
}

function enStandalone(): boolean {
  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
  } catch {
    /* sin matchMedia */
  }
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function aplicar() {
  const px = compensacionDeAlto({
    screenHeight: window.screen?.height ?? 0,
    innerHeight: window.innerHeight,
    esIos: esIos(),
    standalone: enStandalone(),
  });
  document.documentElement.style.setProperty("--compensacion-alto", `${px}px`);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  aplicar();
  window.addEventListener("resize", aplicar);
  window.addEventListener("orientationchange", aplicar);
}
