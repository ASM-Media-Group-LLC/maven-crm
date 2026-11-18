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
// muestra nada). Si falta, macOS pregunta UNA vez por arranque (al compartir),
// y la vez siguiente Maven explica una sola vez cómo arreglarlo, con un botón
// para reiniciar. Después no insiste hasta que se vuelva a abrir Maven.
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
/** La primera vez por arranque se deja que macOS muestre su aviso (así Maven
 *  también aparece en la lista de Ajustes). Las siguientes, no. */
function primeraVezSinPermiso() {
  if (macOSYaPregunto) return false;
  macOSYaPregunto = true;
  return true;
}

let guiaMostrada = false;
/** Explica cómo dar el permiso. Una sola vez por arranque. */
async function guiaPermisoPantalla(ventana) {
  if (guiaMostrada) return;
  guiaMostrada = true;
  const opciones = {
    type: "warning",
    title: "Maven",
    message: "Falta un permiso del Mac para compartir tu pantalla",
    detail:
      "Abre Ajustes → Privacidad y seguridad → Grabación de pantalla y audio del sistema.\n\n" +
      "• Si Maven está apagado, préndelo.\n" +
      "• Si ya está prendido y aun así no funciona, selecciónalo, quítalo con «−» y vuelve a prenderlo " +
      "cuando el Mac lo pida (pasa cuando Maven se actualiza).\n\n" +
      "Después toca «Reiniciar Maven».",
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
    if (response === 0) shell.openExternal(AJUSTES_PANTALLA);
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
