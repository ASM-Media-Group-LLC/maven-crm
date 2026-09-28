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

  // Correo · el menú ⋮ de una etiqueta, como el de Gmail
  "mail.labels.options": { es: "Opciones de {name}", en: "Options for {name}" },
  "mail.labels.menu.color": { es: "Color de etiqueta", en: "Label color" },
  "mail.labels.menu.customColor": { es: "Agregar color personalizado", en: "Add custom color" },
  "mail.labels.menu.removeColor": { es: "Eliminar color", en: "Remove color" },
  "mail.labels.menu.inLabelList": { es: "En la lista de etiquetas", en: "In label list" },
  "mail.labels.menu.inMessageList": { es: "En la lista de mensajes", en: "In message list" },
  "mail.labels.menu.show": { es: "Mostrar", en: "Show" },
  "mail.labels.menu.showIfUnread": { es: "Mostrar si no están leídas", en: "Show if unread" },
  "mail.labels.menu.hide": { es: "Ocultar", en: "Hide" },
  "mail.labels.menu.edit": { es: "Modificar", en: "Edit" },
  "mail.labels.menu.remove": { es: "Eliminar etiqueta", en: "Remove label" },
  "mail.labels.menu.addSublabel": { es: "Agregar subetiqueta", en: "Add sublabel" },
  "mail.labels.more": { es: "Más", en: "More" },
  "mail.labels.less": { es: "Menos", en: "Less" },
  "mail.labels.new": { es: "Crear etiqueta nueva", en: "Create new label" },
  "mail.labels.manage": { es: "Administrar etiquetas", en: "Manage labels" },
  "mail.labels.expand": { es: "Mostrar subetiquetas de {name}", en: "Show sublabels of {name}" },
  "mail.labels.collapse": { es: "Ocultar subetiquetas de {name}", en: "Hide sublabels of {name}" },
  "mail.labels.saveError": { es: "No se pudo guardar la etiqueta", en: "Couldn\u2019t save the label" },

  // Correo · el diálogo de color personalizado
  "mail.labels.custom.title": { es: "Agregar color personalizado", en: "Add custom color" },
  "mail.labels.custom.preview": {
    es: "Vista previa del color de etiqueta - elegir los colores a continuación.",
    en: "Label color preview - choose the colors below.",
  },
  "mail.labels.custom.background": { es: "Color de fondo", en: "Background color" },
  "mail.labels.custom.text": { es: "Color del texto", en: "Text color" },
  "mail.labels.custom.apply": { es: "Aplicar", en: "Apply" },
  "mail.labels.cancel": { es: "Cancelar", en: "Cancel" },

  // Correo · etiqueta nueva / editar etiqueta
  "mail.labels.form.newTitle": { es: "Etiqueta nueva", en: "New label" },
  "mail.labels.form.editTitle": { es: "Editar etiqueta", en: "Edit label" },
  "mail.labels.form.newName": {
    es: "Introduce un nombre de etiqueta nuevo:",
    en: "Please enter a new label name:",
  },
  "mail.labels.form.name": { es: "Nombre de la etiqueta:", en: "Label name:" },
  "mail.labels.form.nest": { es: "Anidar etiqueta en:", en: "Nest label under:" },
  "mail.labels.form.pickParent": { es: "Selecciona una etiqueta superior", en: "Please select a parent" },
  "mail.labels.form.create": { es: "Crear", en: "Create" },
  "mail.labels.form.save": { es: "Guardar", en: "Save" },
  "mail.labels.form.saved": { es: "Etiqueta guardada", en: "Label saved" },
  "mail.labels.form.duplicateHere": {
    es: "Ya hay una etiqueta con ese nombre en ese lugar.",
    en: "There\u2019s already a label with that name there.",
  },

  // Correo · eliminar etiqueta
  "mail.labels.remove.title": { es: "Eliminar etiqueta", en: "Remove label" },
  "mail.labels.remove.body": {
    es: "Se quitará la etiqueta «{name}» de todas las conversaciones. Ningún correo se borra.",
    en: "The label \u201c{name}\u201d will be removed from all conversations. No email is deleted.",
  },
  "mail.labels.remove.withSublabels": {
    es: "También se eliminarán sus subetiquetas ({n}).",
    en: "Its sublabels ({n}) will be removed too.",
  },
  "mail.labels.remove.confirm": { es: "Eliminar", en: "Delete" },
} as const satisfies Record<string, { es: string; en: string }>;
