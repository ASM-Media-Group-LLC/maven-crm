export type Language = "es" | "en";

const translations = {
  // Sidebar groups
  "sidebar.menu": { es: "Menu", en: "Menu" },
  "sidebar.operations": { es: "Operaciones", en: "Operations" },
  "sidebar.resources": { es: "Recursos", en: "Resources" },

  // Sidebar items - Menu
  "nav.dashboard": { es: "Dashboard", en: "Dashboard" },
  "nav.contacts": { es: "Contactos", en: "Contacts" },
  "nav.tasks": { es: "Tareas", en: "Tasks" },
  "nav.creators": { es: "Creadores", en: "Creators" },
  "nav.events": { es: "Eventos", en: "Events" },
  "nav.creatorSales": { es: "Ventas de Creadores", en: "Creator Sales" },
  "nav.salesReport": { es: "Reporte de Ventas", en: "Sales Report" },
  "nav.salesReportV1": { es: "Sale Report v.1", en: "Sale Report v.1" },
  "nav.aiSales": { es: "IA Ventas", en: "AI Sales" },
  "nav.aiConfig": { es: "Configuración IA", en: "AI Config" },

  // Sidebar items - Operations
  "nav.promolog": { es: "Promolog", en: "Promolog" },
  "nav.leadgen": { es: "LeadGen", en: "LeadGen" },
  "nav.closers": { es: "Closers", en: "Closers" },
  "nav.tickets": { es: "Tickets", en: "Tickets" },

  // Sidebar items - Resources
  "nav.designSystem": { es: "Design System", en: "Design System" },
  "nav.docs": { es: "Documentación", en: "Documentation" },
  "nav.settings": { es: "Settings", en: "Settings" },

  // Topbar
  "topbar.search": { es: "Buscar en la plataforma...", en: "Search the platform..." },
  "topbar.lightMode": { es: "Modo claro", en: "Light mode" },
  "topbar.darkMode": { es: "Modo oscuro", en: "Dark mode" },
  "topbar.notifications": { es: "Notificaciones", en: "Notifications" },
  "topbar.noNotifications": { es: "Sin notificaciones nuevas.", en: "No new notifications." },
  "topbar.changePassword": { es: "Cambiar contraseña", en: "Change password" },
  "topbar.logout": { es: "Cerrar sesión", en: "Log out" },
  "topbar.logoutSuccess": { es: "Sesión cerrada", en: "Logged out" },
  "topbar.logoutDesc": { es: "Has cerrado sesión correctamente.", en: "You have been logged out successfully." },
  "topbar.language": { es: "ES", en: "EN" },

  // Search command palette
  "search.pages": { es: "Páginas", en: "Pages" },
  "search.actions": { es: "Acciones", en: "Actions" },
  "search.noResults": { es: "No se encontraron resultados.", en: "No results found." },
  "search.changeTheme": { es: "Cambiar tema", en: "Toggle theme" },
  "search.shortcut": { es: "Buscar...", en: "Search..." },

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
  "common.cancel": { es: "Cancelar", en: "Cancel" },
} as const;

export type TranslationKey = keyof typeof translations;

export function getTranslation(key: TranslationKey, lang: Language): string {
  return translations[key]?.[lang] ?? key;
}

export default translations;
