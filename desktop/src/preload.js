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

const plataforma = process.platform === "darwin" ? "mac" : process.platform === "win32" ? "windows" : "linux";

// La página se entera de que vive en la app por esta clase en <html>: con ella
// su barra de arriba se vuelve «arrastrable» y deja lugar a los botones del
// sistema (frontend/src/index.css, «en-escritorio»).
const marcar = () => document.documentElement.classList.add("en-escritorio", `escritorio-${plataforma}`);
if (document.documentElement) marcar();
window.addEventListener("DOMContentLoaded", marcar);

contextBridge.exposeInMainWorld("mavenEscritorio", {
  esApp: true,
  plataforma,
  insignia: (n) => {
    const v = Math.max(0, Number(n) || 0);
    ipcRenderer.send("maven:insignia", v, v > 0 ? dibujar(v) : null);
  },
  /** Ventanita de llamada entrante encima de todo. Resuelve «contestar», «rechazar» o «cerrada». */
  llamadaEntrante: (datos) => ipcRenderer.invoke("maven:llamada", datos),
  terminarLlamadaEntrante: (id) => ipcRenderer.send("maven:llamada-fin", id),
  /** Ventanita flotante: true la achica y la deja encima; false la devuelve. Sin argumento alterna. */
  flotante: (si) => ipcRenderer.invoke("maven:flotante", si),
  alCambiarFlotante: (cb) => {
    const f = (_e, v) => cb(Boolean(v));
    ipcRenderer.on("maven:flotante", f);
    return () => ipcRenderer.removeListener("maven:flotante", f);
  },
  /** Segundos sin tocar teclado ni mouse en todo el computador. */
  inactividad: () => ipcRenderer.invoke("maven:inactividad"),
  /** Un link maven:// pidió abrir esta ruta de Maven (sin recargar la página). */
  alAbrirRuta: (cb) => {
    const f = (_e, ruta) => { if (typeof ruta === "string" && ruta.startsWith("/")) cb(ruta); };
    ipcRenderer.on("maven:abrir-ruta", f);
    return () => ipcRenderer.removeListener("maven:abrir-ruta", f);
  },
  /** Cowork: true = al compartir, la pantalla completa sola, sin la ventanita para elegir. */
  pantallaAutomatica: (si) => ipcRenderer.send("maven:pantalla-auto", Boolean(si)),
  /** Las veces que la app se cayó o se congeló y se recuperó sola (se leen una vez). */
  ultimoCierre: () => ipcRenderer.invoke("maven:ultimo-cierre"),
  /** ¿Alguien ve la ventana? false = minimizada o escondida en la barra. */
  visible: () => ipcRenderer.invoke("maven:visible"),
  alCambiarVisibilidad: (cb) => {
    const f = (_e, v) => cb(v !== false);
    ipcRenderer.on("maven:visible", f);
    return () => ipcRenderer.removeListener("maven:visible", f);
  },
  /** Versión nueva de la app ya bajada y lista para instalar (o null). */
  actualizacionPendiente: () => ipcRenderer.invoke("maven:actualizacion-pendiente"),
  alActualizacionLista: (cb) => {
    const f = (_e, version) => cb(String(version ?? ""));
    ipcRenderer.on("maven:actualizacion-lista", f);
    return () => ipcRenderer.removeListener("maven:actualizacion-lista", f);
  },
  /** Instala la versión nueva y vuelve a abrir Maven. */
  actualizarAhora: () => ipcRenderer.invoke("maven:actualizar-ahora"),
  /** El correo y la contraseña que la app recuerda en este equipo (solo en /login). Desde el 18/11/2026. */
  acceso: {
    leer: () => ipcRenderer.invoke("maven:acceso-leer"),
    guardar: (correo, clave) => ipcRenderer.invoke("maven:acceso-guardar", String(correo ?? ""), String(clave ?? "")),
  },
  /** Memoria: { app_mb, equipo_gb, libre_gb }. */
  memoria: () => ipcRenderer.invoke("maven:memoria"),
  /** Cada minuto: los tramos de app/página al frente (ver desktop/src/apps.js). */
  alUsoDeApps: (cb) => {
    const f = (_e, lote) => cb(Array.isArray(lote) ? lote : []);
    ipcRenderer.on("maven:apps", f);
    return () => ipcRenderer.removeListener("maven:apps", f);
  },
});

webFrame.executeJavaScript(`
  navigator.setAppBadge = (n) => { window.mavenEscritorio.insignia(n ?? 1); return Promise.resolve(); };
  navigator.clearAppBadge = () => { window.mavenEscritorio.insignia(0); return Promise.resolve(); };
`).catch(() => {});
