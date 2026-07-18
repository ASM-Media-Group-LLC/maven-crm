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

  // Comunes (reusables entre módulos)
  "common.all": { es: "Todos", en: "All" },
  "common.loading": { es: "Cargando…", en: "Loading…" },
  "common.noResults": { es: "Sin resultados.", en: "No results." },
  "common.error": { es: "Error", en: "Error" },
  "common.reply": { es: "Responder", en: "Reply" },
  "common.react": { es: "Reaccionar", en: "React" },
  "common.file": { es: "Archivo", en: "File" },
  "common.clear": { es: "Vaciar", en: "Clear" },
  "common.delete": { es: "Eliminar", en: "Delete" },
  "common.searchPerson": { es: "Buscar persona…", en: "Search person…" },
  "common.unassigned": { es: "Sin asignar", en: "Unassigned" },
  "common.removeAllAssignees": { es: "Quitar todos", en: "Unassign all" },

  // Composer compartido (ChatComposer + pickers)
  "composer.recordAudio": { es: "Grabar audio", en: "Record audio" },
  "composer.cancelReply": { es: "Cancelar respuesta", en: "Cancel reply" },
  "composer.attach": { es: "Adjuntar foto / video", en: "Attach photo / video" },
  "composer.send": { es: "Enviar", en: "Send" },
  "composer.removeAttachment": { es: "Quitar adjunto", en: "Remove attachment" },
  "gif.sendTitle": { es: "Enviar GIF", en: "Send GIF" },
  "gif.search": { es: "Buscar GIF…", en: "Search GIF…" },
  "gif.none": { es: "Sin resultados", en: "No results" },
  "sticker.title": { es: "Stickers", en: "Stickers" },
  "sticker.upload": { es: "Subir", en: "Upload" },
  "sticker.none": { es: "Subí tu primer sticker con \"Subir\".", en: "Upload your first sticker with \"Upload\"." },
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

  // Telegram — bandeja
  "tg.accounts": { es: "Cuentas", en: "Accounts" },
  "tg.searchConversation": { es: "Buscar conversación…", en: "Search conversation…" },
  "tg.channel": { es: "Canal", en: "Channel" },
  "tg.unread": { es: "No leídos", en: "Unread" },
  "tg.favorites": { es: "Favoritos", en: "Favorites" },
  "tg.archived": { es: "Archivados", en: "Archived" },
  "tg.viewArchived": { es: "Ver archivados", en: "View archived" },
  "tg.emptyArchived": { es: "No hay chats archivados.", en: "No archived chats." },
  "tg.emptyUnread": { es: "No hay conversaciones sin leer.", en: "No unread conversations." },
  "tg.emptyFavorites": { es: "No hay favoritos todavía. Click derecho en un chat → Añadir a Favoritos.", en: "No favorites yet. Right-click a chat → Add to Favorites." },
  "tg.emptyAll": { es: "No hay conversaciones todavía. Aparecen acá cuando alguien te escribe por Telegram.", en: "No conversations yet. They show up here when someone messages you on Telegram." },
  "tg.pickConversation": { es: "Elegí una conversación para verla.", en: "Pick a conversation to view it." },
  "tg.assignConversation": { es: "Asignar conversación", en: "Assign conversation" },
  "tg.assign": { es: "Asignar", en: "Assign" },
  "tg.assignmentReadOnly": { es: "Asignación (solo lectura)", en: "Assignment (read-only)" },
  "tg.couldNotAssign": { es: "No se pudo asignar", en: "Couldn't assign" },
  "tg.assignedToLabel": { es: "Asignada a", en: "Assigned to" },
  "tg.openInstagram": { es: "Abrir Instagram del lead", en: "Open lead's Instagram" },
  "tg.noMessages": { es: "Sin mensajes.", en: "No messages." },
  "tg.notDelivered": { es: "no entregado", en: "not delivered" },
  "tg.unreadOne": { es: "No leído", en: "Unread" },
  "tg.viewLarge": { es: "Ver en grande", en: "View large" },
  "tg.quotedMessage": { es: "Mensaje citado", en: "Quoted message" },
  "tg.messageDeleted": { es: "Mensaje eliminado", en: "Message deleted" },
  "tg.replying": { es: "Respondiendo", en: "Replying" },
  "tg.replyTo": { es: "Responder a {name}…", en: "Reply to {name}…" },
  "tg.deleteForEveryone": { es: "Eliminar para todos", en: "Delete for everyone" },
  "tg.archiveChat": { es: "Archivar chat", en: "Archive chat" },
  "tg.unarchiveChat": { es: "Desarchivar chat", en: "Unarchive chat" },
  "tg.pinChat": { es: "Fijar chat", en: "Pin chat" },
  "tg.unpinChat": { es: "Desfijar chat", en: "Unpin chat" },
  "tg.markAsRead": { es: "Marcar como leído", en: "Mark as read" },
  "tg.markAsUnread": { es: "Marcar como no leído", en: "Mark as unread" },
  "tg.addFavorite": { es: "Añadir a Favoritos", en: "Add to Favorites" },
  "tg.removeFavorite": { es: "Quitar de Favoritos", en: "Remove from Favorites" },
  "tg.clearChat": { es: "Vaciar chat", en: "Clear chat" },
  "tg.deleteChat": { es: "Eliminar chat", en: "Delete chat" },
  "tg.couldNotUpdate": { es: "No se pudo actualizar el chat", en: "Couldn't update the chat" },
  "tg.couldNotComplete": { es: "No se pudo completar", en: "Couldn't complete" },
  "tg.chatCleared": { es: "Chat vaciado", en: "Chat cleared" },
  "tg.chatDeleted": { es: "Chat eliminado", en: "Chat deleted" },
  "tg.clearChatConfirm": { es: "Se borrarán todos los mensajes de \"{name}\". La conversación queda vacía. No se puede deshacer.", en: "All messages with \"{name}\" will be deleted. The conversation is emptied. This can't be undone." },
  "tg.deleteChatConfirm": { es: "Se eliminará la conversación con \"{name}\" y todos sus mensajes. No se puede deshacer.", en: "The conversation with \"{name}\" and all its messages will be deleted. This can't be undone." },
  "tg.couldNotSend": { es: "No se pudo enviar", en: "Couldn't send" },
  "tg.gatewayNoDeliverMsg": { es: "El gateway no pudo entregar el mensaje.", en: "The gateway couldn't deliver the message." },
  "tg.gatewayNoDeliverFile": { es: "El gateway no pudo entregar el archivo.", en: "The gateway couldn't deliver the file." },
  "tg.couldNotUpload": { es: "No se pudo subir el archivo", en: "Couldn't upload the file" },
  "tg.couldNotReact": { es: "No se pudo reaccionar", en: "Couldn't react" },
  "tg.couldNotDelete": { es: "No se pudo borrar", en: "Couldn't delete" },
} as const;

export type TranslationKey = keyof typeof translations;

// Interpolación: t("wa.replyingTo", { name }) reemplaza {name} en el texto. Necesaria para la
// migración i18n completa (casi todos los textos reales tienen partes dinámicas). Si falta la
// clave, devuelve la key tal cual (útil para detectar textos sin traducir en QA).
export function getTranslation(
  key: TranslationKey,
  lang: Language,
  params?: Record<string, string | number>,
): string {
  let s: string = translations[key]?.[lang] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) s = s.replaceAll(`{${k}}`, String(v));
  }
  return s;
}

export default translations;
