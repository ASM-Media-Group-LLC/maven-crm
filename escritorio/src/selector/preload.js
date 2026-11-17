'use strict';

// Lo único que la página del selector puede hacer: leer las fuentes y responder.
// No expone Node ni ipcRenderer entero.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('selector', {
  datos: () => ipcRenderer.invoke('selector:datos'),
  elegir: (id, conAudio) => ipcRenderer.send('selector:elegir', { id: String(id), conAudio: conAudio === true }),
  cancelar: () => ipcRenderer.send('selector:cancelar'),
  abrirAjustes: () => ipcRenderer.send('selector:abrir-ajustes'),
});
