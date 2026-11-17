// SE ACTUALIZA SOLA.
//
// Busca versión nueva al abrir y cada 4 horas en el balde público `descargas`
// de Supabase (el CI sube ahí latest.yml / latest-mac.yml con cada versión).
// La baja callada y la instala al cerrar la app; si lleva más de un día
// esperando, avisa con un cartel para reiniciar.
// En Mac solo funciona con la app firmada por Apple: sin firma, el chequeo
// falla y no pasa nada (la página igual se actualiza sola porque vive en la web).
const { app, dialog } = require("electron");

const CADA = 4 * 60 * 60 * 1000;

function iniciarActualizaciones(ventana) {
  if (!app.isPackaged) return;
  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch {
    return;
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  let avisada = false;
  autoUpdater.on("update-downloaded", async (info) => {
    if (avisada) return;
    avisada = true;
    const v = ventana();
    const { response } = await dialog.showMessageBox(v && !v.isDestroyed() ? v : undefined, {
      type: "info",
      buttons: ["Reiniciar ahora", "Más tarde"],
      defaultId: 0,
      cancelId: 1,
      title: "Maven",
      message: `Hay una versión nueva de Maven (${info.version}).`,
      detail: "Se instala al reiniciar la app. Si estás en una llamada, elige «Más tarde»: se instala sola la próxima vez que cierres Maven.",
    });
    if (response === 0) {
      require("./estado").saliendo = true;
      autoUpdater.quitAndInstall();
    }
  });
  autoUpdater.on("error", () => { /* sin firma, sin red: se reintenta en 4 horas */ });

  const buscar = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(buscar, 30 * 1000);
  setInterval(buscar, CADA);
}

module.exports = { iniciarActualizaciones };
