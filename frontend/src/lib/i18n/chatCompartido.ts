// Las piezas de chat que comparten Messenger, WhatsApp y Telegram: el
// composer, los selectores de GIF y stickers, la grabadora de voz y el visor
// de fotos.
//
// Las claves de este archivo empiezan con uno de sus prefijos (los fija
// test/i18n/diccionarioPorModulo.test.ts). Ver lib/i18n.ts.
export const PREFIJOS_CHAT_COMPARTIDO = ["composer.", "gif.", "sticker.", "rec.", "lightbox."] as const;

export const chatCompartido = {
  // Composer compartido (ChatComposer + pickers)
  "composer.recordAudio": { es: "Grabar audio", en: "Record audio" },
  "composer.cancelReply": { es: "Cancelar respuesta", en: "Cancel reply" },
  "composer.attach": { es: "Adjuntar foto / video", en: "Attach photo / video" },
  "composer.send": { es: "Enviar", en: "Send" },
  "composer.removeAttachment": { es: "Quitar adjunto", en: "Remove attachment" },
  "gif.sendTitle": { es: "Enviar GIF", en: "Send GIF" },
  "gif.search": { es: "Buscar GIF…", en: "Search GIF…" },
  "gif.none": { es: "Sin resultados", en: "No results" },
  "gif.notConfigured": { es: "GIFs no configurados (falta la API key de Giphy).", en: "GIFs not set up (the Giphy API key is missing)." },
  "gif.loadError": { es: "No se pudieron cargar los GIFs. Revisa la API key de Giphy.", en: "Couldn't load GIFs. Check the Giphy API key." },
  "gif.viaGiphy": { es: "vía GIPHY", en: "via GIPHY" },
  "sticker.title": { es: "Stickers", en: "Stickers" },
  "sticker.upload": { es: "Subir", en: "Upload" },
  "sticker.none": { es: "Sube tu primer sticker con \"Subir\".", en: "Upload your first sticker with \"Upload\"." },
  "sticker.removeFromGallery": { es: "Eliminar de la galería", en: "Remove from gallery" },
  "sticker.saveError": { es: "No se pudo guardar el sticker", en: "Couldn't save the sticker" },
  "rec.micError": { es: "No se pudo acceder al micrófono", en: "Couldn't access the microphone" },
  "rec.close": { es: "Cerrar", en: "Close" },
  "rec.cancelRecording": { es: "Cancelar grabación", en: "Cancel recording" },
  "rec.cancel": { es: "Cancelar", en: "Cancel" },
  "rec.pause": { es: "Pausar", en: "Pause" },
  "rec.resume": { es: "Reanudar", en: "Resume" },
  "rec.sendVoice": { es: "Enviar nota de voz", en: "Send voice note" },
  "rec.send": { es: "Enviar", en: "Send" },
  "lightbox.zoomOut": { es: "Alejar (−)", en: "Zoom out (−)" },
  "lightbox.zoomIn": { es: "Acercar (+)", en: "Zoom in (+)" },
  "lightbox.reset": { es: "Restablecer (doble-clic)", en: "Reset (double-click)" },
  "lightbox.download": { es: "Descargar / abrir", en: "Download / open" },
  "lightbox.close": { es: "Cerrar (Esc)", en: "Close (Esc)" },
  "lightbox.prev": { es: "Anterior (←)", en: "Previous (←)" },
  "lightbox.next": { es: "Siguiente (→)", en: "Next (→)" },
} as const satisfies Record<string, { es: string; en: string }>;
