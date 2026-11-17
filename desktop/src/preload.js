// Puente entre Maven (la página) y la app de computador.
//
// Maven ya llama a navigator.setAppBadge(n) con los chats sin leer (lib/
// insigniaDeLaApp.ts). Acá se reemplaza para que ese número llegue al ícono
// de la app: el Dock en Mac y la barra de tareas en Windows. Así la página no
// tiene que saber que vive dentro de la app.
const { contextBridge, ipcRenderer, webFrame } = require("electron");

// En Windows el número va dibujado en un circulito sobre el ícono.
function dibujar(n) {
  try {
    const c = document.createElement("canvas");
    c.width = c.height = 32;
    const g = c.getContext("2d");
    g.fillStyle = "#e5484d";
    g.beginPath();
    g.arc(16, 16, 16, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#ffffff";
    g.font = `bold ${n > 9 ? 16 : 20}px Segoe UI, Arial, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(n > 99 ? "99+" : String(n), 16, 17);
    return c.toDataURL();
  } catch {
    return null;
  }
}

contextBridge.exposeInMainWorld("mavenEscritorio", {
  esApp: true,
  insignia: (n) => {
    const v = Math.max(0, Number(n) || 0);
    ipcRenderer.send("maven:insignia", v, v > 0 ? dibujar(v) : null);
  },
});

webFrame.executeJavaScript(`
  navigator.setAppBadge = (n) => { window.mavenEscritorio.insignia(n ?? 1); return Promise.resolve(); };
  navigator.clearAppBadge = () => { window.mavenEscritorio.insignia(0); return Promise.resolve(); };
`).catch(() => {});
