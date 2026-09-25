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
} as const satisfies Record<string, { es: string; en: string }>;
