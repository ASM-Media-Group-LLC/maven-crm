// Messenger.
//
// Las claves de este archivo empiezan con uno de sus prefijos (los fija
// test/i18n/diccionarioPorModulo.test.ts). Ver lib/i18n.ts.
export const PREFIJOS_MESSENGER = ["messenger."] as const;

export const messenger = {
  // Aviso de mención dentro de Maven (useMessengerNotifications → avisarPersona).
  "messenger.teMenciono": { es: "te mencionó", en: "mentioned you" },
  "messenger.teMencionoEn": { es: "te mencionó en", en: "mentioned you in" },
  "messenger.marcarNoLeido": { es: "Marcar como no leído", en: "Mark as unread" },
  "messenger.marcarLeido": { es: "Marcar como leído", en: "Mark as read" },
  "messenger.sinMensajesQueMarcar": { es: "Este chat no tiene mensajes de otros que marcar", en: "This chat has no messages from others to mark" },
  "messenger.noPudeMarcarNoLeido": { es: "No pude marcar el chat como no leído", en: "Couldn't mark the chat as unread" },
} as const satisfies Record<string, { es: string; en: string }>;
