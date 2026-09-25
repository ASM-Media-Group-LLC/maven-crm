// Correo.
//
// Las claves de este archivo empiezan con uno de sus prefijos (los fija
// test/i18n/diccionarioPorModulo.test.ts). Ver lib/i18n.ts.
export const PREFIJOS_CORREO = ["correo.", "mail."] as const;

export const correo = {
  // Correo · mencionar con @ para sumar a alguien al hilo
  "correo.mencion.ayuda": {
    es: "Se suma al correo y le llega un aviso",
    en: "Gets added to the email and receives a notice",
  },
  "correo.mencion.listaLabel": {
    es: "Personas para mencionar",
    en: "People to mention",
  },

  // Correo · la tarjeta de una invitación de calendario (.ics)
  "correo.evento.cancelada": {
    es: "Esta reunión fue cancelada",
    en: "This meeting was cancelled",
  },
  "correo.evento.sinTitulo": { es: "Invitación sin título", en: "Untitled invitation" },
  "correo.evento.todoElDia": { es: "todo el día", en: "all day" },
  "correo.evento.rango": { es: "{from} a {to}", en: "{from} to {to}" },
  "correo.evento.seRepite": { es: "Se repite", en: "Repeats" },
  "correo.evento.organiza": { es: "Organiza", en: "Organized by" },
  "correo.evento.entrar": { es: "Entrar a la videollamada", en: "Join the video call" },
  "correo.evento.invitados": { es: "Invitados ({n})", en: "Guests ({n})" },
  "correo.evento.detalles": { es: "Detalles", en: "Details" },
  "correo.evento.alguien": { es: "alguien", en: "someone" },
  "correo.evento.va": { es: "va", en: "going" },
  "correo.evento.noVa": { es: "no va", en: "not going" },
  "correo.evento.quizas": { es: "quizás", en: "maybe" },
  "correo.evento.sinResponder": { es: "sin responder", en: "no reply" },

  // Correo · etiquetas
  "mail.labels": { es: "Etiquetas", en: "Labels" },
  "mail.labels.name": { es: "Nombre de la etiqueta", en: "Label name" },
  "mail.labels.create": { es: "Crear etiqueta", en: "Create label" },
  "mail.labels.created": { es: "Etiqueta creada", en: "Label created" },
  "mail.labels.deleted": { es: "Etiqueta borrada", en: "Label deleted" },
  "mail.labels.deletedHelp": {
    es: "Se quitó de los correos que la tenían. Ningún correo se borró.",
    en: "It was removed from the emails that had it. No email was deleted.",
  },
  "mail.labels.duplicate": {
    es: "Ya tenés una etiqueta con ese nombre.",
    en: "You already have a label with that name.",
  },
  "mail.labels.empty": {
    es: "Todavía no creaste ninguna. Sirven para agrupar correos sin moverlos de carpeta.",
    en: "You haven\u2019t created any yet. They group emails without moving them between folders.",
  },
  "mail.labels.color": { es: "Color {name}", en: "Color {name}" },
  "mail.labels.delete": { es: "Borrar {name}", en: "Delete {name}" },
} as const satisfies Record<string, { es: string; en: string }>;
