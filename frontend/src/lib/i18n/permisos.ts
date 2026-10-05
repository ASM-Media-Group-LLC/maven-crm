// El modal de permisos de un rol (Admin › Roles).
//
// Las claves de este archivo empiezan con uno de sus prefijos (los fija
// test/i18n/diccionarioPorModulo.test.ts). Ver lib/i18n.ts.
export const PREFIJOS_PERMISOS = ["permissions."] as const;

export const permisos = {
  // Permissions modal
  "permissions.title": { es: "Configurar permisos para", en: "Set permissions for" },
  "permissions.description": { es: "Configura los permisos granulares para este rol", en: "Configure granular permissions for this role" },
  "permissions.menus": { es: "Menús", en: "Menus" },
  "permissions.functions": { es: "Permisos de función", en: "Function permissions" },
  "permissions.data": { es: "Permisos de datos", en: "Data permissions" },
  "permissions.allData": { es: "Todos los datos", en: "All data" },
  "permissions.subordinates": { es: "Propios y subordinados", en: "Self and subordinates" },
  "permissions.selfOnly": { es: "Solo datos propios", en: "Data about self" },
  "permissions.noSubfunctions": { es: "Permiso global — sin subfunciones", en: "Global permission — no sub-functions" },
  "permissions.functionsCount": { es: "funciones", en: "functions" },
  "permissions.subtabsCount": { es: "subtabs", en: "subtabs" },
  "permissions.noActions": { es: "Sin acciones", en: "No actions" },
  "permissions.menusHint": { es: "Secciones navegables del módulo", en: "Navigable sections of the module" },
  "permissions.functionsHint": { es: "Acciones (crear, editar, eliminar…)", en: "Actions (create, edit, delete…)" },
  "permissions.expandSubtabs": { es: "Ver subtabs", en: "Show subtabs" },
  "permissions.save": { es: "Guardar Permisos", en: "Save Permissions" },
  "permissions.saving": { es: "Guardando...", en: "Saving..." },
} as const satisfies Record<string, { es: string; en: string }>;
