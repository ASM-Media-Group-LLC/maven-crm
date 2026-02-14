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
  "nav.creatorSales": { es: "Creator Sales", en: "Creator Sales" },
  "nav.salesReport": { es: "Sales Report", en: "Sales Report" },
  "nav.salesReportV1": { es: "Sale Report v.1", en: "Sale Report v.1" },
  "nav.aiSales": { es: "AI Sales", en: "AI Sales" },
  "nav.aiConfig": { es: "AI Config", en: "AI Config" },

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
} as const;

export type TranslationKey = keyof typeof translations;

export function getTranslation(key: TranslationKey, lang: Language): string {
  return translations[key]?.[lang] ?? key;
}

export default translations;
