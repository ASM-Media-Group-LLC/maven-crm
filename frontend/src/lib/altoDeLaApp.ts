// El alto REAL de la app en la PWA instalada de iPhone.
//
// Con viewport-fit=cover el contenido se dibuja desde el borde superior de la
// pantalla (por eso la topbar lleva pt-safe), pero `100dvh` mide la pantalla
// MENOS la barra de estado (59 pt en los iPhone con Dynamic Island, 47 con
// notch, 20 en los viejos). Resultado: la caja de la app terminaba 59 pt antes
// del final y quedaba una franja muerta debajo del composer del Messenger,
// mientras el teclado y el botón flotante sí llegaban abajo.
//
// Se mide en vez de asumir: si `alto de pantalla − innerHeight` da un faltante
// chico (el de una barra de estado), se compensa vía la variable
// --compensacion-alto que consume `.alto-de-la-app` (index.css). Si no falta
// nada (Android, Safari normal, escritorio), la variable queda en 0 y todo
// sigue midiendo 100dvh.
//
// ⚠️ Con el TECLADO abierto iOS encoge innerHeight cientos de píxeles: esa
// medida no es plausible y NO debe pisar la compensación (la primera versión la
// ponía en 0 y, como al cerrar el teclado no siempre llega otro `resize`, el
// hueco volvía y más grande — Jhon lo vio en el iPhone). Medida rara = se
// conserva la última buena; y se vuelve a medir cuando el teclado se cierra.

/** null = medida no plausible (teclado abierto, transición): conservar la anterior. */
export function compensacionDeAlto(a: {
  screenHeight: number;
  innerHeight: number;
  esIos: boolean;
  standalone: boolean;
}): number | null {
  if (!a.esIos || !a.standalone) return 0;
  const faltante = Math.round(a.screenHeight - a.innerHeight);
  if (faltante <= 0) return 0;
  // Más de 80 px no es una barra de estado: es el teclado o una transición.
  return faltante <= 80 ? faltante : null;
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

/** En iOS `screen.width/height` no rotan con el dispositivo: el alto de la
 *  pantalla en apaisado es el menor de los dos. */
function altoDePantalla(): number {
  const s = window.screen;
  if (!s) return 0;
  let apaisado = false;
  try {
    apaisado = window.matchMedia("(orientation: landscape)").matches;
  } catch {
    apaisado = window.innerWidth > window.innerHeight;
  }
  return apaisado ? Math.min(s.width, s.height) : Math.max(s.width, s.height);
}

let ultimaBuena = 0;

function aplicar() {
  const px = compensacionDeAlto({
    screenHeight: altoDePantalla(),
    innerHeight: window.innerHeight,
    esIos: esIos(),
    standalone: enStandalone(),
  });
  if (px !== null) ultimaBuena = px;
  document.documentElement.style.setProperty("--compensacion-alto", `${ultimaBuena}px`);
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  aplicar();
  window.addEventListener("resize", aplicar);
  window.addEventListener("orientationchange", () => setTimeout(aplicar, 300));
  window.visualViewport?.addEventListener("resize", aplicar);
  // Al cerrar el teclado no siempre llega un resize: remedir tras el blur.
  document.addEventListener("focusout", () => setTimeout(aplicar, 350), true);
}
