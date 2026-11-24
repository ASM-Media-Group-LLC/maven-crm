// LA LLAMADA NO SE ESCONDE (Alvaro, 18/11/2026: «se escondió la llamada y no
// encontraba dónde colgar»).
//
// En la app, una llamada del Messenger o un Meet se abre en su propia ventana.
// Al volver a la ventana de Maven, la de la llamada quedaba detrás y no había
// cómo volver ni colgar. Ahora, cuando la ventana de la llamada pierde el foco,
// se achica a una ventanita arriba a la derecha, siempre encima de todo (hasta
// de otros programas), con controles para moverla, desanclarla y expandirla.
// Además Maven muestra arriba la barra «En llamada con… · Volver ·
// Colgar» (frontend/src/components/BarraDeLlamada.tsx); «Volver» llega aquí por
// maven:mostrar-esta-ventana.
const { screen } = require("electron");
const controlesPorVentana = new WeakMap();
const dialogosPorVentana = new WeakMap();

/** ¿Esta dirección es una llamada (Messenger) o un Meet de Maven? */
function esLlamada(url) {
  try {
    const { pathname } = new URL(url);
    return /^\/(call|meet|entrar|unirse)\/[^/]+/.test(pathname);
  } catch {
    return false;
  }
}

const MARGEN = 20;

/** Dónde va la ventanita: arriba a la derecha de la pantalla donde está la ventana
 *  (abajo a la derecha ya la usa la ventanita de Maven entero). */
function lugarDeLaVentanita(area, ultimaPosicion, conControles = false) {
  const width = Math.min(conControles ? 400 : 360, area.width);
  const height = Math.min(conControles ? 310 : 250, area.height);
  return {
    x: Math.max(area.x, Math.min(ultimaPosicion?.x ?? area.x + area.width - width - MARGEN, area.x + area.width - width)),
    y: Math.max(area.y, Math.min(ultimaPosicion?.y ?? area.y + MARGEN, area.y + area.height - height)),
    width,
    height,
  };
}

function prepararVentanaDeLlamada(hija) {
  if (controlesPorVentana.has(hija)) return;
  let antes = null; // tamaño y lugar antes de achicarla
  let ultimaPosicion = null;
  let anclada = true;
  let controlesListos = false;
  let arrastre = null;
  const estado = () => ({ miniatura: !!antes, anclada });
  const avisar = () => {
    if (!hija.webContents.isDestroyed()) hija.webContents.send("maven:miniatura-llamada", estado());
  };
  const aplicarAnclaje = () => {
    hija.setAlwaysOnTop(anclada, "floating");
    hija.setVisibleOnAllWorkspaces(anclada, { visibleOnFullScreen: true });
  };

  const achicar = () => {
    if (hija.isDestroyed() || antes || hija.isMinimized() || hija.isFullScreen() || dialogosPorVentana.get(hija)) return;
    antes = { bounds: hija.getBounds(), maximizada: hija.isMaximized() };
    if (hija.isMaximized()) hija.unmaximize();
    const area = screen.getDisplayMatching(ultimaPosicion ?? antes.bounds).workArea;
    hija.setBounds(lugarDeLaVentanita(area, ultimaPosicion, controlesListos));
    aplicarAnclaje();
    avisar();
  };

  const agrandar = () => {
    if (hija.isDestroyed() || !antes) return;
    arrastre = null;
    if (controlesListos) ultimaPosicion = hija.getBounds();
    const anterior = antes;
    antes = null;
    hija.setAlwaysOnTop(false);
    hija.setVisibleOnAllWorkspaces(false);
    hija.setBounds(anterior.bounds);
    if (anterior.maximizada) hija.maximize();
    avisar();
  };

  controlesPorVentana.set(hija, (accion) => {
    if (accion === "estado") controlesListos = true;
    else if (accion === "expandir") agrandar();
    else if (accion === "anclaje" && antes) {
      anclada = !anclada;
      aplicarAnclaje();
      avisar();
    } else if (accion === "arrastre-inicio" && controlesListos && antes) {
      arrastre = { cursor: screen.getCursorScreenPoint(), bounds: hija.getBounds() };
    } else if ((accion === "arrastre-mover" || accion === "arrastre-fin") && arrastre) {
      const cursor = screen.getCursorScreenPoint();
      const x = cursor.x - arrastre.cursor.x;
      const y = cursor.y - arrastre.cursor.y;
      if (Math.hypot(x, y) >= 3 || arrastre.movida) {
        arrastre.movida = true;
        const area = screen.getDisplayNearestPoint(cursor).workArea;
        hija.setBounds(lugarDeLaVentanita(area, { x: arrastre.bounds.x + x, y: arrastre.bounds.y + y }, true));
      }
      if (accion === "arrastre-fin") arrastre = null;
    }
    return estado();
  });

  // Un momento de gracia: los diálogos del sistema (permisos, elegir pantalla)
  // también le sacan el foco un instante, y no por eso hay que achicarla.
  let espera = null;
  hija.on("blur", () => {
    clearTimeout(espera);
    espera = setTimeout(() => { if (!hija.isDestroyed() && !hija.isFocused()) achicar(); }, 400);
  });
  hija.on("focus", () => {
    clearTimeout(espera);
    // Las versiones del frontend que ya tienen el botón Expandir conservan la
    // miniatura al recibir foco, incluso cuando se empieza a arrastrar.
    if (!controlesListos) agrandar();
  });
  hija.on("closed", () => clearTimeout(espera));
}

function controlarMiniatura(w, accion) {
  if (!w || w.isDestroyed() || !["estado", "expandir", "anclaje"].includes(accion)) return null;
  return controlesPorVentana.get(w)?.(accion) ?? null;
}

function arrastrarMiniatura(w, fase) {
  if (!w || w.isDestroyed() || !["inicio", "mover", "fin"].includes(fase)) return;
  controlesPorVentana.get(w)?.("arrastre-" + fase);
}

/** «Volver a la llamada» desde la barra de Maven: trae esta ventana al frente. */
function mostrarVentana(w) {
  if (!w || w.isDestroyed()) return false;
  if (w.isMinimized()) w.restore();
  controlarMiniatura(w, "expandir");
  w.show();
  w.focus();
  return true;
}

/** Mantiene visible la llamada mientras un selector o permiso le quita el foco. */
function mantenerDuranteDialogo(w) {
  if (!w || w.isDestroyed()) return () => {};
  dialogosPorVentana.set(w, (dialogosPorVentana.get(w) || 0) + 1);
  mostrarVentana(w);
  let terminado = false;
  return () => {
    if (terminado) return;
    terminado = true;
    dialogosPorVentana.set(w, Math.max(0, (dialogosPorVentana.get(w) || 1) - 1));
  };
}

module.exports = { esLlamada, lugarDeLaVentanita, prepararVentanaDeLlamada, mostrarVentana, controlarMiniatura, arrastrarMiniatura, mantenerDuranteDialogo };
