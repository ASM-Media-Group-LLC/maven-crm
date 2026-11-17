// LLAMADA ENTRANTE ENCIMA DE TODO.
//
// Cuando la página detecta que te están llamando, llama a
// window.mavenEscritorio.llamadaEntrante({ id, nombre, detalle, foto }) y acá se
// abre una ventanita arriba a la derecha, siempre encima, aunque Maven esté
// escondido o estés en otra app. Contestar trae Maven al frente y le responde
// a la página «contestar»; Rechazar responde «rechazar». Si la llamada se corta
// antes, la página llama a terminarLlamadaEntrante(id) y la ventanita se cierra.
const { BrowserWindow, ipcMain, screen } = require("electron");
const path = require("node:path");

const avisos = new Map(); // id → { ventana, responder }

function avisarLlamada(datos, alContestar) {
  return new Promise((resolver) => {
    const id = String(datos?.id ?? Date.now());
    cerrarAvisoLlamada(id);
    const area = screen.getPrimaryDisplay().workArea;
    const ancho = 360, alto = 112;
    const v = new BrowserWindow({
      width: ancho,
      height: alto,
      x: area.x + area.width - ancho - 16,
      y: area.y + 16,
      frame: false,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      show: false,
      transparent: true,
      hasShadow: true,
      backgroundColor: "#00000000",
      webPreferences: {
        preload: path.join(__dirname, "llamada-preload.js"),
        contextIsolation: true,
        sandbox: true,
        additionalArguments: [`--maven-llamada=${encodeURIComponent(JSON.stringify({
          id,
          nombre: String(datos?.nombre ?? "Llamada"),
          detalle: String(datos?.detalle ?? "Te está llamando en Maven"),
          foto: typeof datos?.foto === "string" && /^https:\/\//.test(datos.foto) ? datos.foto : null,
        }))}`],
      },
    });
    v.setAlwaysOnTop(true, "screen-saver");
    v.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    v.once("ready-to-show", () => v.showInactive());
    v.loadFile(path.join(__dirname, "llamada.html"));
    const responder = (r) => {
      if (!avisos.has(id)) return;
      avisos.delete(id);
      if (!v.isDestroyed()) v.close();
      if (r === "contestar") alContestar();
      resolver(r);
    };
    v.on("closed", () => responder("cerrada"));
    avisos.set(id, { ventana: v, responder });
  });
}

function cerrarAvisoLlamada(id) {
  const a = avisos.get(String(id));
  if (a) a.responder("cerrada");
}

ipcMain.on("llamada:respuesta", (e, id, r) => {
  const a = avisos.get(String(id));
  if (a && a.ventana.webContents === e.sender) a.responder(r === "contestar" ? "contestar" : "rechazar");
});

module.exports = { avisarLlamada, cerrarAvisoLlamada };
