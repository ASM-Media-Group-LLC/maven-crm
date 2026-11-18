// PERMISO DE «GRABACIÓN DE PANTALLA» EN EL MAC, SIN INSISTIR.
//
// Alvaro (17/11/2026): el aviso de macOS «"Maven" would like to record this
// computer's screen and audio» le salía cada rato, aunque Maven se veía
// prendido en Ajustes. Dos causas:
//   1. Argos (apps.js) lee cada 5 s la ventana del frente con get-windows. Para
//      revisar el permiso, get-windows abre una captura de pantalla
//      (CGDisplayStream), y si falta el permiso macOS muestra su aviso. Se
//      reintentaba cada 10 minutos, y cada vez el aviso volvía.
//   2. El interruptor de Ajustes era de una versión anterior de la app (sin
//      firma o con otra firma). A la versión firmada macOS no se lo reconoce,
//      aunque se vea prendido: hay que quitarlo con «−» y volver a darlo.
//
// Regla: la pantalla solo se toca si macOS ya dio el permiso (esa consulta no
// muestra nada). Si falta, Maven explica cómo arreglarlo en el mismo clic, con
// botones para abrir Ajustes y reiniciar (a lo sumo cada 10 minutos), y una vez
// por arranque deja además que macOS muestre su propio aviso.
const { app, dialog, shell, systemPreferences } = require("electron");
const estado = require("./estado");

const esMac = process.platform === "darwin";
const AJUSTES_PANTALLA = "x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture";

/** ¿macOS ya deja grabar la pantalla? Solo consulta: nunca muestra el aviso. */
function pantallaPermitida() {
  if (!esMac) return true;
  try {
    return systemPreferences.getMediaAccessStatus("screen") === "granted";
  } catch {
    return false;
  }
}

let macOSYaPregunto = false;
/** Una vez por arranque se deja que macOS muestre su propio aviso (si nunca
 *  preguntó en este Mac, así Maven aparece en la lista de Ajustes). Si ya
 *  preguntó antes, macOS no dice nada: por eso Maven explica igual en el mismo
 *  clic (guiaPermisoPantalla). 18/11/2026: en el Mac de Alvaro el permiso
 *  estaba negado, el primer clic fallaba mudo y la explicación salía recién en
 *  el segundo. */
function primeraVezSinPermiso() {
  if (macOSYaPregunto) return false;
  macOSYaPregunto = true;
  return true;
}

let ultimaGuia = 0;
/** Explica cómo dar el permiso. A lo sumo una vez cada 10 minutos: Cowork vuelve
 *  a pedir la pantalla solo tras una caída y no tiene que llenar de avisos. */
async function guiaPermisoPantalla(ventana) {
  if (Date.now() - ultimaGuia < 10 * 60_000) return;
  ultimaGuia = Date.now();
  const opciones = {
    type: "warning",
    title: "Maven",
    message: "Falta el permiso del Mac para compartir tu pantalla",
    detail:
      "Se arregla una sola vez:\n\n" +
      "1. Toca «Abrir Ajustes» (Privacidad y seguridad → Grabación de pantalla y audio del sistema).\n" +
      "2. Si Maven está en la lista, selecciónalo y quítalo con «−», aunque se vea prendido " +
      "(pasa cuando Maven se actualiza: el Mac ya no lo reconoce).\n" +
      "3. Toca «+», elige Maven en Aplicaciones y déjalo prendido.\n" +
      "4. Vuelve aquí y toca «Reiniciar Maven».",
    buttons: ["Abrir Ajustes", "Reiniciar Maven", "Ahora no"],
    defaultId: 0,
    cancelId: 2,
    noLink: true,
  };
  try {
    const { response } =
      ventana && !ventana.isDestroyed()
        ? await dialog.showMessageBox(ventana, opciones)
        : await dialog.showMessageBox(opciones);
    if (response === 0) {
      shell.openExternal(AJUSTES_PANTALLA);
      ultimaGuia = 0; // al volver de Ajustes, el próximo intento vuelve a explicar (con «Reiniciar»)
    }
    if (response === 1) {
      estado.saliendo = true;
      app.relaunch();
      app.quit();
    }
  } catch {
    // sin ventana o el diálogo no abrió: no se insiste
  }
}

module.exports = { pantallaPermitida, primeraVezSinPermiso, guiaPermisoPantalla };
