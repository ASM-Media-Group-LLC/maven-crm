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
const { app, dialog, shell, systemPreferences, desktopCapturer } = require("electron");
const { execFile } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
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

// 18/11/2026: pedir la pantalla con desktopCapturer NO pone a Maven en la lista
// de «Grabación de pantalla» de macOS (en el Mac de Alvaro Maven ni aparecía y
// no había interruptor que prender). CGRequestScreenCaptureAccess sí lo pone y
// muestra el aviso de macOS. Electron no lo trae, así que se llama por
// osascript: corre como hijo de Maven y macOS se lo atribuye a Maven.
// Probado en su Mac: tras esta llamada Maven apareció en la lista.
const PEDIR_A_MACOS =
  'ObjC.import("CoreGraphics"); ObjC.bindFunction("CGRequestScreenCaptureAccess", ["bool", []]); $.CGRequestScreenCaptureAccess();';
function pedirAMacOS() {
  if (!esMac) return Promise.resolve();
  return new Promise((resolver) => {
    execFile("/usr/bin/osascript", ["-l", "JavaScript", "-e", PEDIR_A_MACOS], { timeout: 15_000 }, () => resolver());
  });
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

// 18/11/2026: en el Mac de Alvaro el permiso seguía «negado» aunque se viera
// prendido (era de una versión con otra firma). Quitar con «−» y volver a dar
// es un paso que casi nadie hace bien. Ahora Maven lo arregla solo con un clic:
// borra SU propio permiso (tccutil reset, solo de Maven), se reinicia y al abrir
// deja que macOS vuelva a preguntar. La persona solo prende el interruptor.
const BUNDLE_ID = "me.maven-ai.escritorio";
const marcaPedir = () => path.join(app.getPath("userData"), "pedir-permiso-pantalla");

/** Borra el permiso viejo de pantalla de Maven (solo el de Maven). */
function borrarPermisoViejo() {
  return new Promise((resolver) => {
    execFile("/usr/bin/tccutil", ["reset", "ScreenCapture", BUNDLE_ID], (error) => resolver(!error));
  });
}

/** Al arrancar tras «Arreglar»: macOS muestra su propio aviso para dar el permiso. */
async function pedirPermisoSiToca() {
  if (!esMac) return;
  try {
    if (!fs.existsSync(marcaPedir())) return;
    fs.rmSync(marcaPedir(), { force: true });
  } catch {
    return;
  }
  if (pantallaPermitida()) return;
  macOSYaPregunto = true;
  await pedirAMacOS();
  await desktopCapturer.getSources({ types: ["screen"], thumbnailSize: { width: 1, height: 1 } }).catch(() => {});
  // Si macOS no mostró nada, se abre directo el lugar del interruptor.
  if (systemPreferences.getMediaAccessStatus("screen") !== "granted") shell.openExternal(AJUSTES_PANTALLA);
}

function reiniciar() {
  estado.saliendo = true;
  app.relaunch();
  app.quit();
}

let ultimaGuia = 0;
/** Explica cómo dar el permiso y ofrece arreglarlo solo. A lo sumo una vez cada
 *  10 minutos: Cowork vuelve a pedir la pantalla solo tras una caída y no tiene
 *  que llenar de avisos. */
async function guiaPermisoPantalla(ventana) {
  if (Date.now() - ultimaGuia < 10 * 60_000) return;
  ultimaGuia = Date.now();
  const opciones = {
    type: "warning",
    title: "Maven",
    message: "Falta el permiso del Mac para compartir tu pantalla",
    detail:
      "Toca «Arreglar ahora»: Maven borra el permiso viejo y se reinicia.\n\n" +
      "Al abrir, el Mac te pide el permiso: toca «Abrir Ajustes del Sistema», " +
      "prende Maven en «Grabación de pantalla y audio del sistema» y elige «Salir y volver a abrir».",
    buttons: ["Arreglar ahora", "Abrir Ajustes", "Ahora no"],
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
      const borrado = await borrarPermisoViejo();
      if (borrado) {
        try {
          fs.writeFileSync(marcaPedir(), String(Date.now()));
        } catch {
          // sin la marca igual pregunta al primer clic de compartir
        }
        return reiniciar();
      }
      // No se pudo borrar solo: se explica a mano.
      await dialog.showMessageBox({
        type: "info",
        title: "Maven",
        message: "Hazlo a mano, una sola vez",
        detail:
          "1. En Ajustes → Privacidad y seguridad → Grabación de pantalla y audio del sistema, " +
          "selecciona Maven y quítalo con «−» (aunque se vea prendido).\n" +
          "2. Toca «+», elige Maven en Aplicaciones y déjalo prendido.\n" +
          "3. Cierra Maven con Cmd+Q y ábrelo otra vez.",
        buttons: ["Abrir Ajustes"],
        noLink: true,
      });
      shell.openExternal(AJUSTES_PANTALLA);
      ultimaGuia = 0;
    }
    if (response === 1) {
      shell.openExternal(AJUSTES_PANTALLA);
      ultimaGuia = 0; // al volver de Ajustes, el próximo intento vuelve a explicar
    }
  } catch {
    // sin ventana o el diálogo no abrió: no se insiste
  }
}

module.exports = { pantallaPermitida, primeraVezSinPermiso, guiaPermisoPantalla, pedirPermisoSiToca, pedirAMacOS, reiniciar };
