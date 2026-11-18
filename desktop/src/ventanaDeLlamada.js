// LA LLAMADA NO SE ESCONDE (Alvaro, 18/11/2026: «se escondió la llamada y no
// encontraba dónde colgar»).
//
// En la app, una llamada del Messenger o un Meet se abre en su propia ventana.
// Al volver a la ventana de Maven, la de la llamada quedaba detrás y no había
// cómo volver ni colgar. Ahora, cuando la ventana de la llamada pierde el foco,
// se achica a una ventanita arriba a la derecha, siempre encima de todo (hasta
// de otros programas), con sus botones de colgar y micrófono. Al tocarla vuelve
// a su tamaño. Además Maven muestra arriba la barra «En llamada con… · Volver ·
// Colgar» (frontend/src/components/BarraDeLlamada.tsx); «Volver» llega aquí por
// maven:mostrar-esta-ventana.
const { screen } = require("electron");

/** ¿Esta dirección es una llamada (Messenger) o un Meet de Maven? */
function esLlamada(url) {
  try {
    const { pathname } = new URL(url);
    return pathname.startsWith("/call/") || pathname.startsWith("/meet/");
  } catch {
    return false;
  }
}

const ANCHO = 360;
const ALTO = 250;
const MARGEN = 20;

/** Dónde va la ventanita: arriba a la derecha de la pantalla donde está la ventana
 *  (abajo a la derecha ya la usa la ventanita de Maven entero). */
function lugarDeLaVentanita(area) {
  return { x: area.x + area.width - ANCHO - MARGEN, y: area.y + MARGEN, width: ANCHO, height: ALTO };
}

function prepararVentanaDeLlamada(hija) {
  let antes = null; // tamaño y lugar antes de achicarla

  const achicar = () => {
    if (hija.isDestroyed() || antes || hija.isMinimized() || hija.isFullScreen()) return;
    antes = { bounds: hija.getBounds(), maximizada: hija.isMaximized() };
    if (hija.isMaximized()) hija.unmaximize();
    const area = screen.getDisplayMatching(antes.bounds).workArea;
    hija.setBounds(lugarDeLaVentanita(area), true);
    hija.setAlwaysOnTop(true, "floating");
    hija.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  };

  const agrandar = () => {
    if (hija.isDestroyed() || !antes) return;
    hija.setAlwaysOnTop(false);
    hija.setVisibleOnAllWorkspaces(false);
    hija.setBounds(antes.bounds, true);
    if (antes.maximizada) hija.maximize();
    antes = null;
  };

  // Un momento de gracia: los diálogos del sistema (permisos, elegir pantalla)
  // también le sacan el foco un instante, y no por eso hay que achicarla.
  let espera = null;
  hija.on("blur", () => {
    clearTimeout(espera);
    espera = setTimeout(() => { if (!hija.isDestroyed() && !hija.isFocused()) achicar(); }, 400);
  });
  hija.on("focus", () => { clearTimeout(espera); agrandar(); });
  hija.on("closed", () => clearTimeout(espera));
}

/** «Volver a la llamada» desde la barra de Maven: trae esta ventana al frente. */
function mostrarVentana(w) {
  if (!w || w.isDestroyed()) return false;
  if (w.isMinimized()) w.restore();
  w.show();
  w.focus();
  return true;
}

module.exports = { esLlamada, lugarDeLaVentanita, prepararVentanaDeLlamada, mostrarVentana };
