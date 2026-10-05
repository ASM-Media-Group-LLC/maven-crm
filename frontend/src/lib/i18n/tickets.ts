// Tickets.
//
// Las claves de este archivo empiezan con uno de sus prefijos (los fija
// test/i18n/diccionarioPorModulo.test.ts). Ver lib/i18n.ts.
export const PREFIJOS_TICKETS = ["tickets."] as const;

// Lo que NO está acá, a propósito: los valores que se guardan en la base
// (priority/status/ticket_type en inglés, el catálogo de compañías) y el texto
// que la plantilla deja escrito en ticket_form_fields —la pregunta de Instagram
// que se agrega sola, "Opción 1", "(copia)"—, porque lo leen todos los que
// llenan el formulario y el correo del aviso. Solo se traduce la ETIQUETA.
export const tickets = {
  // Tickets · catálogos cerrados. La llave es el valor guardado en `tickets`.
  "tickets.priority.low": { es: "Baja", en: "Low" },
  "tickets.priority.medium": { es: "Media", en: "Medium" },
  "tickets.priority.high": { es: "Alta", en: "High" },
  "tickets.priority.urgent": { es: "Urgente", en: "Urgent" },
  "tickets.status.open": { es: "Abierto", en: "Open" },
  "tickets.status.resolved": { es: "Resuelto", en: "Resolved" },
  "tickets.status.closed": { es: "Cerrado", en: "Closed" },
  "tickets.type.complaint": { es: "Queja", en: "Complaint" },
  "tickets.type.technical": { es: "Técnico", en: "Technical" },
  "tickets.type.billing": { es: "Facturación", en: "Billing" },
  "tickets.type.content": { es: "Contenido", en: "Content" },
  "tickets.type.general": { es: "General", en: "General" },

  // Tickets · campos que se repiten entre la lista, los filtros y los modales
  "tickets.priority": { es: "Prioridad", en: "Priority" },
  "tickets.creator": { es: "Creador", en: "Creator" },
  "tickets.assignee": { es: "Asignado", en: "Assignee" },
  "tickets.assignedTo": { es: "Asignado a", en: "Assigned to" },
  "tickets.creatorNotes": { es: "Notas sobre el creator", en: "Notes about the creator" },
  "tickets.newTicket": { es: "Nuevo ticket", en: "New ticket" },
  "tickets.newTemplate": { es: "Nueva plantilla", en: "New template" },
  "tickets.saving": { es: "Guardando...", en: "Saving..." },
  "tickets.published": { es: "Publicada", en: "Published" },
  "tickets.fieldCount.one": { es: "{count} campo", en: "{count} field" },
  "tickets.fieldCount.other": { es: "{count} campos", en: "{count} fields" },
  "tickets.recipientCount.one": { es: "{count} destinatario", en: "{count} recipient" },
  "tickets.recipientCount.other": { es: "{count} destinatarios", en: "{count} recipients" },

  // Tickets · la página (TicketsContent)
  "tickets.subtitle": { es: "Gestión de soporte y escalaciones", en: "Support and escalations" },
  "tickets.tab.list": { es: "Lista de tickets", en: "Ticket list" },
  "tickets.tab.templates": { es: "Plantillas", en: "Templates" },
  "tickets.whatKind": {
    es: "¿Qué tipo de ticket quieres levantar?",
    en: "What kind of ticket do you want to open?",
  },
  "tickets.pickTemplateHint": {
    es: "Elige una plantilla y completa el formulario. El código se asigna solo.",
    en: "Pick a template and fill in the form. The code is assigned automatically.",
  },
  "tickets.loadingTickets": { es: "Cargando tickets...", en: "Loading tickets..." },

  // Tickets · filtros (TicketsFilters)
  "tickets.filters.searchPlaceholder": {
    es: "Buscar por título, descripción, número de ticket...",
    en: "Search by title, description, ticket number...",
  },
  "tickets.filters.clear": { es: "Limpiar filtros", en: "Clear filters" },
  "tickets.filters.listView": { es: "Ver como lista", en: "List view" },
  "tickets.filters.gridView": { es: "Ver como tarjetas", en: "Card view" },

  // Tickets · lista y tarjetas (TicketsList, TicketsGrid)
  "tickets.empty.title": { es: "No hay tickets", en: "No tickets yet" },
  "tickets.empty.description": {
    es: "Crea un nuevo ticket para comenzar",
    en: "Create a new ticket to get started",
  },
  "tickets.col.ticket": { es: "Ticket", en: "Ticket" },
  "tickets.col.created": { es: "Creación", en: "Created" },

  // Tickets · ver un ticket (ViewTicketModal)
  "tickets.view.createdOn": { es: "Creado el {date}", en: "Created on {date}" },
  "tickets.view.createdBy": { es: "Creado por", en: "Created by" },
  "tickets.view.comments": { es: "Comentarios ({count})", en: "Comments ({count})" },
  "tickets.view.noComments": { es: "No hay comentarios aún", en: "No comments yet" },
  "tickets.view.commentPlaceholder": { es: "Escribe un comentario...", en: "Write a comment..." },

  // Tickets · editar un ticket (EditTicketModal)
  "tickets.edit.title": { es: "Editar ticket", en: "Edit ticket" },
  "tickets.edit.description": {
    es: "Modifica los campos necesarios y guarda los cambios",
    en: "Update the fields you need and save your changes",
  },
  "tickets.edit.selectCreator": { es: "Seleccionar creador", en: "Select creator" },
  "tickets.edit.companyOrigin": { es: "Compañía / Cuenta de origen", en: "Company / source account" },
  "tickets.edit.selectCompany": { es: "Seleccionar compañía", en: "Select company" },
  "tickets.edit.noCompany": { es: "Sin compañía", en: "No company" },
  "tickets.edit.assignTo": { es: "Asignar a", en: "Assign to" },
  "tickets.edit.saveChanges": { es: "Guardar cambios", en: "Save changes" },
  "tickets.edit.cancelled": { es: "Edición cancelada", en: "Edit cancelled" },
  "tickets.edit.titleRequired": { es: "El título es requerido", en: "Title is required" },

  // Tickets · borrar un ticket (DeleteTicketDialog). La pregunta va partida
  // porque el título del ticket se muestra en negrita en el medio.
  "tickets.delete.title": { es: "Eliminar ticket", en: "Delete ticket" },
  "tickets.delete.confirmBefore": {
    es: "¿Estás seguro de que deseas eliminar el ticket",
    en: "Are you sure you want to delete the ticket",
  },

  // Tickets · avisos de useTickets (van por traducir(): viven en mutaciones)
  "tickets.toast.created": { es: "Ticket creado exitosamente", en: "Ticket created" },
  "tickets.toast.createError": { es: "Error al crear ticket", en: "Couldn't create the ticket" },
  "tickets.toast.updated": { es: "Ticket actualizado exitosamente", en: "Ticket updated" },
  "tickets.toast.updateError": { es: "Error al actualizar ticket", en: "Couldn't update the ticket" },
  "tickets.toast.deleted": { es: "Ticket eliminado exitosamente", en: "Ticket deleted" },
  "tickets.toast.deleteError": { es: "Error al eliminar ticket", en: "Couldn't delete the ticket" },
  "tickets.toast.commentAdded": { es: "Comentario agregado", en: "Comment added" },
  "tickets.toast.commentError": { es: "Error al agregar comentario", en: "Couldn't add the comment" },

  // Tickets · avisos de useTicketForms
  "tickets.toast.templateSaved": { es: "Plantilla guardada", en: "Template saved" },
  "tickets.toast.templateSaveError": {
    es: "Error al guardar la plantilla",
    en: "Couldn't save the template",
  },
  "tickets.toast.prefixTaken": {
    es: "Ese prefijo ya está en uso por otra plantilla. Elige otro.",
    en: "Another template already uses that prefix. Pick a different one.",
  },
  "tickets.toast.templateArchived": { es: "Plantilla archivada", en: "Template archived" },
  "tickets.toast.archiveError": { es: "Error al archivar", en: "Couldn't archive" },
  "tickets.toast.templatePublished": { es: "Plantilla publicada", en: "Template published" },
  "tickets.toast.templateUnpublished": { es: "Plantilla despublicada", en: "Template unpublished" },
  "tickets.toast.publishError": { es: "Error al publicar", en: "Couldn't publish" },
  "tickets.toast.fieldsSaved": { es: "Campos guardados", en: "Fields saved" },
  "tickets.toast.fieldsSaveError": {
    es: "Error al guardar los campos",
    en: "Couldn't save the fields",
  },
  "tickets.toast.optionsNeeded": {
    es: "Las listas necesitan al menos una opción.",
    en: "Lists need at least one option.",
  },
  "tickets.toast.duplicateKey": {
    es: "Hay dos campos con la misma clave. Cambia una de las etiquetas.",
    en: "Two fields have the same key. Change one of the labels.",
  },
  "tickets.toast.duplicateMapping": {
    es: "Dos campos apuntan a la misma columna del ticket. Solo uno puede.",
    en: "Two fields point to the same ticket column. Only one can.",
  },
  "tickets.toast.invalidKey": {
    es: "Una etiqueta no produce una clave válida. Usa al menos una letra.",
    en: "A label doesn't produce a valid key. Use at least one letter.",
  },
  "tickets.toast.createdWithCode": { es: "Ticket {code} creado", en: "Ticket {code} created" },
  "tickets.toast.createFromFormError": {
    es: "Error al crear el ticket",
    en: "Couldn't create the ticket",
  },

  // Tickets · tipos de pregunta de una plantilla (useTicketForms.FIELD_TYPES)
  "tickets.fieldType.creator": { es: "Creadora", en: "Creator" },
  "tickets.fieldType.text": { es: "Respuesta corta", en: "Short answer" },
  "tickets.fieldType.textarea": { es: "Párrafo", en: "Paragraph" },
  "tickets.fieldType.currency": { es: "Monto ($)", en: "Amount ($)" },
  "tickets.fieldType.percent": { es: "Porcentaje (%)", en: "Percentage (%)" },
  "tickets.fieldType.select": { es: "Opción múltiple", en: "Multiple choice" },
  "tickets.fieldType.multiselect": { es: "Casillas", en: "Checkboxes" },
  "tickets.fieldType.checkbox": { es: "Sí / No", en: "Yes / No" },
  "tickets.fieldType.url": { es: "Enlace", en: "Link" },
  "tickets.fieldType.instagram": { es: "Instagram", en: "Instagram" },
  "tickets.fieldType.user": { es: "Empleado de Maven", en: "Maven employee" },
  "tickets.fieldType.driveLinks": { es: "Archivos de Drive", en: "Drive files" },

  // Tickets · columnas del ticket que una pregunta puede alimentar
  "tickets.column.title": { es: "Título del ticket", en: "Ticket title" },
  "tickets.column.creatorNotes": { es: "Notas de la creadora", en: "Creator notes" },

  // Tickets · las tarjetas de plantilla (NewTicketLauncher)
  "tickets.launcher.noPublished": {
    es: "Todavía no hay plantillas publicadas",
    en: "No published templates yet",
  },
  "tickets.launcher.noPublishedHint": {
    es: "Crea una desde la pestaña Plantillas y publícala para que aparezca aquí.",
    en: "Create one from the Templates tab and publish it to see it here.",
  },
  "tickets.launcher.editTemplate": { es: "Editar plantilla {name}", en: "Edit template {name}" },
  "tickets.launcher.requiresCreator": { es: "requiere creadora", en: "requires a creator" },

  // Tickets · la lista de plantillas (TicketFormsManager)
  "tickets.forms.title": { es: "Plantillas de ticket", en: "Ticket templates" },
  "tickets.forms.intro": {
    es: "Arma los formularios que el equipo va a usar. El botón \"Nueva plantilla\" de arriba crea una; el interruptor de cada fila la publica.",
    en: "Build the forms your team will use. The \"New template\" button above creates one; the switch on each row publishes it.",
  },
  "tickets.forms.loading": { es: "Cargando plantillas...", en: "Loading templates..." },
  "tickets.forms.empty": { es: "Todavía no hay plantillas", en: "No templates yet" },
  "tickets.forms.emptyHint": {
    es: "Usa \"Nueva plantilla\" arriba para crear la primera: sus campos, su prefijo y a quién le llega el correo.",
    en: "Use \"New template\" above to create the first one: its fields, its prefix and who gets the email.",
  },
  "tickets.forms.draft": {
    es: "Borrador - no aparece en Nuevo ticket",
    en: "Draft - not shown in New ticket",
  },
  "tickets.forms.noEmail": { es: "sin correo", en: "no email" },
  "tickets.forms.publish": { es: "Publicar plantilla", en: "Publish template" },
  "tickets.forms.archive": { es: "Archivar", en: "Archive" },
  "tickets.forms.archiveTitle": { es: "¿Archivar \"{name}\"?", en: "Archive \"{name}\"?" },
  // Partida en dos: el prefijo va en <code> en el medio.
  "tickets.forms.archiveBefore": {
    es: "Deja de aparecer en Nuevo ticket. Los tickets ya creados con esta plantilla se conservan intactos, y su prefijo",
    en: "It stops showing up in New ticket. Tickets already created with this template stay intact, and its prefix",
  },
  "tickets.forms.archiveAfter": {
    es: "queda reservado para que los códigos históricos nunca se repitan.",
    en: "stays reserved so past codes are never reused.",
  },

  // Tickets · llenar una plantilla (DynamicTicketForm)
  "tickets.form.missingRequired": { es: "Faltan campos obligatorios", en: "Required fields are missing" },
  "tickets.form.yes": { es: "Sí", en: "Yes" },
  "tickets.form.searchCreator": { es: "Buscar creadora...", en: "Search creator..." },
  "tickets.form.creatorHint": {
    es: "{count} creadoras de la base de Maven — busca por nombre o handle. Queda vinculada al perfil, no es texto libre.",
    en: "{count} creators in Maven — search by name or handle. It links to the profile; it isn't free text.",
  },
  "tickets.form.searchMavenUser": { es: "Buscar empleado de Maven…", en: "Search Maven employee…" },
  "tickets.form.addEvidence": { es: "Agregar otra prueba", en: "Add another proof" },
  "tickets.form.instagramPlaceholder": {
    es: "https://www.instagram.com/usuario/",
    en: "https://www.instagram.com/username/",
  },
  "tickets.form.noFields": {
    es: "Esta plantilla todavía no tiene campos. Agrégalos desde Plantillas.",
    en: "This template has no fields yet. Add them from Templates.",
  },
  "tickets.form.creating": { es: "Creando…", en: "Creating…" },
  "tickets.form.create": { es: "Crear ticket", en: "Create ticket" },

  // Tickets · el constructor de plantillas (TicketFormEditor)
  "tickets.editor.srTitleEdit": { es: "Editar plantilla {name}", en: "Edit template {name}" },
  "tickets.editor.srTitleNew": { es: "Nueva plantilla de ticket", en: "New ticket template" },
  "tickets.editor.untitledTemplate": { es: "Plantilla sin título", en: "Untitled template" },
  "tickets.editor.questions": { es: "Preguntas", en: "Questions" },
  "tickets.editor.settings": { es: "Ajustes", en: "Settings" },
  "tickets.editor.publish": { es: "Publicar", en: "Publish" },
  "tickets.editor.formDescription": { es: "Descripción del formulario", en: "Form description" },
  "tickets.editor.dragToReorder": { es: "Arrastrar para reordenar", en: "Drag to reorder" },
  "tickets.editor.untitledQuestion": { es: "Pregunta sin título", en: "Untitled question" },
  "tickets.editor.optionN": { es: "Opción {n}", en: "Option {n}" },
  "tickets.editor.storedValue": { es: "valor guardado", en: "stored value" },
  "tickets.editor.removeOption": { es: "Quitar opción", en: "Remove option" },
  "tickets.editor.addOption": { es: "Añadir opción", en: "Add option" },
  // Termina en "(ej." porque a continuación va el ejemplo en <code>.
  "tickets.editor.closedCatalogHint": {
    es: "Esta pregunta alimenta {column}, que solo acepta valores de su catálogo. El texto de la izquierda es lo que se ve; el de la derecha es lo que se guarda (ej.",
    en: "This question feeds {column}, which only accepts values from its catalog. The text on the left is what people see; the one on the right is what gets stored (e.g.",
  },
  "tickets.editor.helpText": { es: "Texto de ayuda (opcional)", en: "Help text (optional)" },
  "tickets.editor.onlyInTicket": { es: "Solo queda en el ticket", en: "Only stored on the ticket" },
  "tickets.editor.feeds": { es: "Alimenta: {column}", en: "Feeds: {column}" },
  "tickets.editor.duplicateQuestion": { es: "Duplicar pregunta", en: "Duplicate question" },
  "tickets.editor.deleteQuestion": { es: "Borrar pregunta", en: "Delete question" },
  "tickets.editor.required": { es: "Obligatorio", en: "Required" },
  "tickets.editor.addQuestion": { es: "Añadir pregunta", en: "Add question" },
  "tickets.editor.problems.one": { es: "Falta corregir 1 cosa:", en: "1 thing to fix:" },
  "tickets.editor.problems.other": {
    es: "Falta corregir {count} cosas:",
    en: "{count} things to fix:",
  },
  "tickets.editor.codePrefix": { es: "Prefijo del código *", en: "Code prefix *" },
  "tickets.editor.prefixLocked": {
    es: "No se puede cambiar: los tickets ya emitidos lo usan.",
    en: "It can't be changed: tickets already issued use it.",
  },
  "tickets.editor.prefixPreview": {
    es: "Los tickets saldrán como {prefix}-0001, -0002...",
    en: "Tickets will be numbered {prefix}-0001, -0002...",
  },
  "tickets.editor.icon": { es: "Icono", en: "Icon" },
  "tickets.editor.recipients": { es: "Destinatarios del correo", en: "Email recipients" },
  "tickets.editor.recipientsHint": {
    es: "A quién le llega el aviso al crearse un ticket de esta plantilla.",
    en: "Who gets notified when a ticket is created from this template.",
  },
  "tickets.editor.emailPlaceholder": { es: "persona@unlok.me", en: "name@unlok.me" },
  "tickets.editor.noRecipients": {
    es: "Sin destinatarios: el ticket se crea igual, pero no se avisa por correo.",
    en: "No recipients: the ticket is still created, but nobody gets an email.",
  },
  "tickets.editor.removeEmail": { es: "Quitar {email}", en: "Remove {email}" },
  "tickets.editor.templateSettings": { es: "Ajustes de la plantilla", en: "Template settings" },
  "tickets.editor.checkForm": { es: "Revisa el formulario", en: "Check the form" },
  "tickets.editor.noOneNotified": { es: "Nadie va a recibir el aviso", en: "Nobody will get notified" },
  "tickets.editor.noOneNotifiedDesc": {
    es: "Esta plantilla no tiene destinatarios de correo. Los tickets se van a crear igual, pero no se le va a avisar a nadie — y ese es el tipo de falla que no se nota hasta que alguien pregunta por un ticket que nadie vio.",
    en: "This template has no email recipients. Tickets will still be created, but nobody will be told — and that's the kind of failure nobody notices until someone asks about a ticket no one saw.",
  },
  "tickets.editor.addRecipients": { es: "Agregar destinatarios", en: "Add recipients" },
  "tickets.editor.publishWithoutEmail": { es: "Publicar sin correo", en: "Publish without email" },

  // Tickets · lo que el constructor revisa antes de guardar
  "tickets.editor.problem.noName": {
    es: "La plantilla necesita un nombre.",
    en: "The template needs a name.",
  },
  "tickets.editor.problem.badPrefix": {
    es: "El prefijo debe ser de 1 a 8 caracteres, empezando por letra (ej. TK).",
    en: "The prefix must be 1 to 8 characters and start with a letter (e.g. TK).",
  },
  "tickets.editor.problem.twoCreators": {
    es: "Solo puede haber una pregunta de tipo Creadora por plantilla.",
    en: "A template can only have one Creator question.",
  },
  "tickets.editor.problem.noText": {
    es: "La pregunta {n} no tiene texto.",
    en: "Question {n} has no text.",
  },
  "tickets.editor.problem.badKey": {
    es: "\"{label}\" no produce una clave válida. Usa al menos una letra.",
    en: "\"{label}\" doesn't produce a valid key. Use at least one letter.",
  },
  "tickets.editor.problem.duplicateKey": {
    es: "Hay dos preguntas con la clave \"{key}\". Cambia una etiqueta.",
    en: "Two questions share the key \"{key}\". Change one of the labels.",
  },
  "tickets.editor.problem.needsOption": {
    es: "\"{label}\" necesita al menos una opción.",
    en: "\"{label}\" needs at least one option.",
  },
  "tickets.editor.problem.duplicateMapping": {
    es: "Dos preguntas apuntan a \"{column}\". Solo una puede.",
    en: "Two questions point to \"{column}\". Only one can.",
  },
  "tickets.editor.problem.closedCatalog": {
    es: "\"{label}\" alimenta {column}, que solo acepta valores del catálogo. Completa el \"valor guardado\" de cada opción.",
    en: "\"{label}\" feeds {column}, which only accepts catalog values. Fill in the \"stored value\" of each option.",
  },
} as const satisfies Record<string, { es: string; en: string }>;
