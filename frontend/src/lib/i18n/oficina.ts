// Oficina: documentos, hojas y presentaciones.
//
// Las claves de este archivo empiezan con uno de sus prefijos (los fija
// test/i18n/diccionarioPorModulo.test.ts). Ver lib/i18n.ts.
export const PREFIJOS_OFICINA = ["doc.", "oficina."] as const;

export const oficina = {
  // Oficina · compartir un documento con personas
  "doc.compartir": { es: "Compartir", en: "Share" },
  "doc.compartirCon": { es: "Compartir con", en: "Share with" },
  "doc.compartirTitulo": { es: "Compartir «{name}»", en: "Share “{name}”" },
  "doc.agregarPersonas": {
    es: "Agregá personas del equipo",
    en: "Add people from the team",
  },
  "doc.personasConAcceso": { es: "Personas con acceso", en: "People with access" },
  "doc.dueno": { es: "Dueño", en: "Owner" },
  "doc.vos": { es: "(vos)", en: "(you)" },
  "doc.accesoGeneral": { es: "Acceso general", en: "General access" },
  "doc.restringido": { es: "Restringido", en: "Restricted" },
  "doc.restringidoAyuda": {
    es: "Solo las personas con acceso pueden abrirlo",
    en: "Only people with access can open it",
  },
  "doc.todoMaven": { es: "Todo Maven", en: "Everyone at Maven" },
  "doc.todoMavenAyuda": {
    es: "Cualquiera del equipo con el link puede abrirlo y editarlo",
    en: "Anyone on the team with the link can open and edit it",
  },
  "doc.copiarLink": { es: "Copiar link", en: "Copy link" },
  "doc.linkCopiado": { es: "Link copiado", en: "Link copied" },
  "doc.listo": { es: "Listo", en: "Done" },
  "doc.quitarAcceso": { es: "Quitar el acceso", en: "Remove access" },
  "doc.visibilidadCambiada": { es: "Cambió quién lo ve", en: "Changed who can see it" },
  "doc.soloElDuenoAcceso": {
    es: "Solo el dueño puede cambiar el acceso general",
    en: "Only the owner can change general access",
  },
  "doc.buscarPersona": { es: "Buscar a alguien…", en: "Search for someone…" },
  "doc.sinCompartir": { es: "No lo compartiste con nadie", en: "You haven\u2019t shared it with anyone" },
  "doc.puedeVer": { es: "puede ver", en: "can view" },
  "doc.puedeEditar": { es: "puede editar", en: "can edit" },
  "doc.dejarDeCompartir": { es: "Dejar de compartir", en: "Stop sharing" },
  "doc.compartido": { es: "Compartido", en: "Shared" },
  "doc.permisoCambiado": { es: "Permiso actualizado", en: "Permission updated" },
  "doc.soloElDueno": {
    es: "Solo quien lo creó puede compartirlo",
    en: "Only its creator can share it",
  },
  "doc.compartidoConmigo": { es: "Compartido conmigo", en: "Shared with me" },
  "oficina.nuevoDoc": { es: "Documento nuevo", en: "New document" },
  "oficina.nuevaHoja": { es: "Hoja nueva", en: "New spreadsheet" },
  "oficina.nuevaPresentacion": { es: "Presentación nueva", en: "New presentation" },
  // >>> i18n ola 3 (paginas-a)
  // Oficina · la lista (docs, hojas, presentaciones)
  "oficina.subtitle": { es: "Del equipo, escritos en Maven", en: "The team's, written in Maven" },
  "oficina.searchPlaceholder": { es: "Buscar por título…", en: "Search by title…" },
  "oficina.view.mine": { es: "Míos", en: "Mine" },
  "oficina.view.trash": { es: "Papelera", en: "Trash" },
  "oficina.empty.docs": { es: "Todavía no hay documentos", en: "No documents yet" },
  "oficina.emptyHint.docs": { es: "Empezá por un procedimiento, un guion o un acta de reunión.", en: "Start with a procedure, a script or meeting minutes." },
  "oficina.empty.sheets": { es: "Todavía no hay hojas de cálculo", en: "No spreadsheets yet" },
  "oficina.emptyHint.sheets": { es: "Sirven para un presupuesto, un control de turnos o un listado.", en: "Good for a budget, a shift tracker or a list." },
  "oficina.empty.slides": { es: "Todavía no hay presentaciones", en: "No presentations yet" },
  "oficina.emptyHint.slides": { es: "Para una inducción, una propuesta o un reporte al equipo.", en: "For an onboarding, a proposal or a report to the team." },
  "oficina.createError": { es: "No se pudo crear el documento", en: "Couldn't create the document" },
  "oficina.trashed": { es: "Documento en la papelera", en: "Document moved to trash" },
  "oficina.restored": { es: "Documento restaurado", en: "Document restored" },
  "oficina.moveError": { es: "No se pudo mover", en: "Couldn't move it" },
  "oficina.loadError": { es: "No se pudieron cargar los documentos", en: "Couldn't load the documents" },
  "oficina.noMatch": { es: "Ningún documento coincide", en: "No document matches" },
  "oficina.noMatchHint": { es: "Se busca por título. Probá con otra palabra.", en: "Search looks at titles. Try another word." },
  "oficina.trashEmpty": { es: "La papelera está vacía", en: "The trash is empty" },
  "oficina.trashEmptyHint": { es: "Lo que mandes a la papelera aparece acá hasta que lo elimines.", en: "Whatever you send to the trash shows up here until you delete it." },
  "oficina.untitled": { es: "Sin título", en: "Untitled" },
  "oficina.private": { es: "Privado", en: "Private" },
  "oficina.restore": { es: "Restaurar", en: "Restore" },
  "oficina.deleteForever": { es: "Eliminar definitivamente", en: "Delete permanently" },
  "oficina.moveToTrash": { es: "Mandar {name} a la papelera", en: "Move {name} to trash" },
  "oficina.deleteTitle": { es: "¿Eliminar «{name}»?", en: "Delete “{name}”?" },
  "oficina.deleteDesc": { es: "Se borra el documento y todas sus versiones. Esto no se puede deshacer.", en: "The document and all its versions will be deleted. This can't be undone." },
  "oficina.deleted": { es: "Documento eliminado", en: "Document deleted" },
  // Oficina · un documento abierto
  "oficina.backToOffice": { es: "Volver a Oficina", en: "Back to Office" },
  "oficina.doc.openError": { es: "No se pudo abrir el documento", en: "Couldn't open the document" },
  "oficina.doc.openErrorHint": { es: "Puede que lo hayan borrado o que no tengas acceso.", en: "It may have been deleted, or you may not have access." },
  "oficina.doc.version": { es: "Versión {n}", en: "Version {n}" },
  "oficina.doc.safe": { es: "El documento está a salvo: lo último guardado sigue en su lugar.", en: "The document is safe: the last saved version is still there." },
  "oficina.doc.opening": { es: "Abriendo el documento…", en: "Opening the document…" },
  // <<< i18n ola 3 (paginas-a)
} as const satisfies Record<string, { es: string; en: string }>;
