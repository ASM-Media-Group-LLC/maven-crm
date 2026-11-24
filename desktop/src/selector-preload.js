const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("selector", {
  fuentes: () => ipcRenderer.invoke("selector:fuentes"),
  elegir: (id) => ipcRenderer.invoke("selector:elegir", id),
});
