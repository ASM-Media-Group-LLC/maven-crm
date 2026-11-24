// Cada solicitud pertenece a su ventana. Cowork nunca activa la captura
// automática de un Meet o una llamada directa que se abre aparte.
const { app, BrowserWindow, desktopCapturer, dialog, screen, webContents } = require("electron");
const path = require("node:path");
const { pantallaPermitida, primeraVezSinPermiso, guiaPermisoPantalla, pedirAMacOS } = require("./permisoPantalla");
const { mantenerDuranteDialogo } = require("./ventanaDeLlamada");
const automaticas = new WeakSet();
const pendientes = new WeakSet();
const esMac = process.platform === "darwin";

function ponerPantallaAutomatica(wc, si) {
  if (si) automaticas.add(wc);
  else automaticas.delete(wc);
}

function elegirFuente(fuentes, padre) {
  return new Promise((resolver, rechazar) => {
    const selector = new BrowserWindow({
      parent: padre,
      modal: true,
      width: 760, height: 560,
      resizable: false, minimizable: false, maximizable: false,
      title: app.getLocale().startsWith("es") ? "Compartir pantalla" : "Share screen",
      backgroundColor: "#101827", show: false,
      webPreferences: { preload: path.join(__dirname, "selector-preload.js"), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    let listo = false;
    const ipc = selector.webContents.ipc;
    const terminar = (id, error) => {
      if (listo) return;
      listo = true;
      ipc.removeHandler("selector:fuentes");
      ipc.removeHandler("selector:elegir");
      padre.removeListener("closed", cancelado);
      if (error) rechazar(error);
      else resolver(fuentes.find((f) => f.id === id) || null);
      if (!selector.isDestroyed()) selector.close();
    };
    const cancelado = () => terminar(null);
    // Los canales solo aceptan mensajes del selector que abrió esta solicitud.
    ipc.handle("selector:fuentes", () => fuentes.map((f) => ({
      id: f.id, nombre: f.name, pantalla: f.id.startsWith("screen:"), imagen: f.thumbnail.toDataURL(),
    })));
    ipc.handle("selector:elegir", (_e, id) => {
      if (id !== null && !fuentes.some((f) => f.id === id)) throw new Error("unknown screen source");
      terminar(id);
    });
    padre.once("closed", cancelado);
    selector.on("closed", cancelado);
    selector.once("ready-to-show", () => { selector.show(); selector.focus(); });
    selector.webContents.on("render-process-gone", () => terminar(null, new Error("selector unavailable")));
    selector.setMenuBarVisibility(false);
    selector.loadFile(path.join(__dirname, "selector.html")).catch((error) => terminar(null, error));
  });
}

function crearManejadorDePantalla(esDeMaven) {
  return async (pedido, responder) => {
    let wc;
    try { wc = webContents.fromFrame(pedido.frame); } catch { /* marco cerrado */ }
    const padre = wc && BrowserWindow.fromWebContents(wc);
    if (!wc || wc.isDestroyed() || !padre || padre.isDestroyed() ||
      !esDeMaven(wc.getURL()) || !esDeMaven(pedido.securityOrigin || pedido.frame?.url || "") || pendientes.has(wc)) {
      responder({});
      return;
    }
    pendientes.add(wc);
    const automatica = automaticas.has(wc);
    let finalizarDialogo = () => {};
    let respuesta = {};
    try {
      if (!automatica) finalizarDialogo = mantenerDuranteDialogo(padre);
      if (!pantallaPermitida()) {
        if (primeraVezSinPermiso()) await pedirAMacOS();
        // El permiso puede haberse concedido en el diálogo del sistema.
        if (!pantallaPermitida()) {
          await guiaPermisoPantalla(padre, { explicito: !automatica });
          return;
        }
      }
      const fuentes = await desktopCapturer.getSources({
        types: automatica ? ["screen"] : ["screen", "window"],
        thumbnailSize: automatica ? { width: 1, height: 1 } : { width: 320, height: 200 },
        fetchWindowIcons: false,
      });
      if (padre.isDestroyed() || wc.isDestroyed()) return;
      if (!fuentes.length) throw new Error("no display sources");
      const principal = String(screen.getPrimaryDisplay().id);
      const elegida = automatica
        ? fuentes.find((f) => f.display_id === principal) || fuentes[0]
        : await elegirFuente(fuentes, padre);
      if (elegida && !wc.isDestroyed()) {
        respuesta = { video: elegida, ...(pedido.audioRequested && !esMac ? { audio: "loopback" } : {}) };
      }
    } catch {
      if (!automatica && !padre.isDestroyed()) {
        const es = app.getLocale().startsWith("es");
        await dialog.showMessageBox(padre, {
          type: "info", title: "Maven",
          message: es ? "No se pudo abrir el selector de pantalla" : "The screen picker could not open",
          detail: es
            ? "Inténtalo de nuevo. Si continúa, cierra y vuelve a abrir Maven y revisa el permiso de grabación de pantalla del sistema. Tu llamada sigue conectada."
            : "Try again. If this continues, restart Maven and check your system screen recording permission. Your call is still connected.",
          buttons: [es ? "Entendido" : "OK"],
        }).catch(() => {});
      }
    } finally {
      finalizarDialogo();
      pendientes.delete(wc);
      // Siempre responde una vez, también al cancelar o cerrar la ventana.
      responder(respuesta);
    }
  };
}

module.exports = { crearManejadorDePantalla, ponerPantallaAutomatica, elegirFuente };
