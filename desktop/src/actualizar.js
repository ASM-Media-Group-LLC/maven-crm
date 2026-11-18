// SE ACTUALIZA SOLA.
//
// Busca versión nueva en el balde público `descargas` de Supabase (ahí se suben
// latest.yml / latest-mac.yml con cada versión):
//   - al abrir (a los 30 s),
//   - cada 15 minutos (Alvaro, 17/11/2026: antes era cada 4 horas y la versión
//     nueva tardaba en ofrecerse; mirar es bajar un archivito de texto),
//   - al despertar el computador o desbloquear la pantalla,
//   - y a mano: «Buscar actualización» en el menú de la barra y en el de Maven.
// La baja callada y, cuando está lista, ofrece reiniciar. Si se elige «Más
// tarde», se instala sola la próxima vez que se cierre la app.
// En Mac solo funciona con la app firmada por Apple: sin firma, el chequeo
// falla y no pasa nada (la página igual se actualiza sola porque vive en la web).
const { app, dialog, ipcMain, powerMonitor } = require("electron");

// EL AVISO SIEMPRE A LA VISTA (Alvaro, 18/11/2026: «que cada vez que hagamos un
// update la plataforma te lo ponga enfrente con un botón»). Antes era una
// ventanita que salía una vez por versión: si la cerrabas, no volvía. Ahora,
// cuando la versión nueva ya bajó, se le avisa a la página
// ("maven:actualizacion-lista") y ella muestra una franja fija con «Actualizar»
// que no se cierra (components/AvisoActualizacionApp.tsx). En llamada la franja
// avisa que se corta unos segundos; si no se toca, se actualiza al colgar.

const CADA = 15 * 60 * 1000;
const MINIMO_ENTRE_BUSQUEDAS = 60 * 1000;

function iniciarActualizaciones(ventana) {
  if (!app.isPackaged) return () => {};
  let autoUpdater;
  try {
    ({ autoUpdater } = require("electron-updater"));
  } catch {
    return () => {};
  }
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = null;

  const cartel = (opciones) => {
    const v = ventana();
    return v && !v.isDestroyed() ? dialog.showMessageBox(v, opciones) : dialog.showMessageBox(opciones);
  };

  let lista = null;      // versión ya bajada, esperando reinicio
  let ofreciendo = false;
  async function ofrecerReinicio() {
    if (!lista || ofreciendo) return;
    ofreciendo = true;
    try {
      const { response } = await cartel({
        type: "info",
        buttons: ["Reiniciar ahora", "Más tarde"],
        defaultId: 0,
        cancelId: 1,
        title: "Maven",
        message: `Hay una versión nueva de Maven (${lista.version}).`,
        detail: "Se instala al reiniciar la app. Si estás en una llamada, elige «Más tarde»: se instala sola la próxima vez que cierres Maven.",
      });
      if (response === 0) {
        require("./estado").saliendo = true;
        autoUpdater.quitAndInstall();
      }
    } finally {
      ofreciendo = false;
    }
  }

  // La página pregunta al cargar (si se recargó después de la descarga) y
  // escucha el aviso; «Actualizar» instala callada y vuelve a abrir Maven.
  ipcMain.handle("maven:actualizacion-pendiente", () => lista?.version ?? null);
  ipcMain.handle("maven:actualizar-ahora", () => {
    if (!lista) return false;
    require("./estado").saliendo = true;
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
    return true;
  });
  autoUpdater.on("update-downloaded", (info) => {
    lista = info;
    const v = ventana();
    if (v && !v.isDestroyed()) v.webContents.send("maven:actualizacion-lista", info.version);
  });
  autoUpdater.on("error", () => { /* sin firma, sin red: se reintenta en 15 minutos */ });

  let ultima = 0;
  let aMano = false; // la búsqueda la pidió la persona desde el menú
  autoUpdater.on("update-not-available", () => {
    if (!aMano) return;
    aMano = false;
    cartel({ type: "info", buttons: ["Listo"], title: "Maven", message: `Ya tienes la última versión de Maven (${app.getVersion()}).` });
  });
  autoUpdater.on("update-available", (info) => {
    if (!aMano) return;
    aMano = false;
    cartel({ type: "info", buttons: ["Listo"], title: "Maven", message: `Bajando la versión nueva (${info.version}).`, detail: "Cuando termine te ofrece reiniciar." });
  });

  async function buscar(desdeElMenu = false) {
    if (desdeElMenu && lista) return ofrecerReinicio();
    const ahora = Date.now();
    if (!desdeElMenu && ahora - ultima < MINIMO_ENTRE_BUSQUEDAS) return;
    ultima = ahora;
    aMano = desdeElMenu;
    try {
      await autoUpdater.checkForUpdates();
    } catch {
      if (desdeElMenu) {
        aMano = false;
        cartel({ type: "warning", buttons: ["Listo"], title: "Maven", message: "No se pudo buscar la actualización.", detail: "Revisa tu internet e inténtalo de nuevo." });
      }
    }
  }

  setTimeout(() => buscar(), 30 * 1000);
  setInterval(() => buscar(), CADA);
  powerMonitor.on("resume", () => buscar());
  powerMonitor.on("unlock-screen", () => buscar());
  // Al volver a Maven (Alvaro, 18/11/2026: «me fui a la aplicación y no me pidió
  // que le dé update»): la versión subió entre dos vueltas de 15 min. Volver a
  // la ventana también busca (a lo sumo una vez por minuto).
  app.on("browser-window-focus", () => buscar());
  return buscar;
}

module.exports = { iniciarActualizaciones };
