const { contextBridge, ipcRenderer } = require("electron");
const arg = process.argv.find((a) => a.startsWith("--maven-llamada="));
let datos = { id: "", nombre: "Llamada", detalle: "", foto: null };
try { datos = JSON.parse(decodeURIComponent(arg.slice("--maven-llamada=".length))); } catch { /* datos por defecto */ }
contextBridge.exposeInMainWorld("llamada", {
  datos,
  responder: (r) => ipcRenderer.send("llamada:respuesta", datos.id, r),
});
