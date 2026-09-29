import type { TranslationKey } from "@/lib/i18n";

// CÓMO SE DIBUJAN LOS NOMBRES DEL CATÁLOGO DE PERMISOS.
//
// Los grupos, módulos, secciones y funciones de MODULES_CONFIG (useRoles.ts) son
// LLAVES: se guardan tal cual en role_permissions (module, submodule) y las leen
// canAccess(), el menú lateral, las rutas y la RLS (can_use_module_function).
// Traducir la llave le quitaría el acceso a todo el mundo sin un error. Así que
// la llave se queda en español y lo único que cambia es lo que se VE.
//
// Un nombre nuevo en MODULES_CONFIG va en uno de los dos lados:
//  - ETIQUETAS, si en inglés se dice distinto ("Lista" → "List");
//  - IGUAL_EN_INGLES, si se escribe igual ("Dashboard", "Hubstaff").
// test/admin/adminEnIngles.test.tsx falla si queda uno sin anotar.
//
// Las secciones anidadas ("Perfil: Info") se dibujan sin el prefijo del padre, así
// que acá se anota la parte que se ve ("Info").
export const ETIQUETAS: Record<string, TranslationKey> = {
  // Grupos
  "Menú": "admin.perm.group.menu",
  "Operaciones": "admin.perm.group.operations",
  "Finanzas": "admin.perm.group.finance",
  "Recursos Humanos": "admin.perm.group.hr",
  "Configuración": "admin.perm.group.settings",
  // Módulos
  "Panel de control": "admin.perm.controlPanel",
  "Correo": "admin.perm.mail",
  "Grabaciones": "admin.perm.recordings",
  "Oficina": "admin.perm.office",
  "Contactos": "admin.perm.contacts",
  "Creadores": "admin.perm.creators",
  // "Creator Sales" es el permiso de VER INGRESOS (ver moduleLabel en useRoles.ts).
  "Creator Sales": "admin.perm.revenue",
  "Parrilla": "admin.perm.contentGrid",
  "Personalizados": "admin.perm.customs",
  "Telefonos": "admin.perm.phones",
  "Administración": "admin.perm.administration",
  // Secciones
  "Modelos": "admin.perm.models",
  "Chatters Reclutamiento": "admin.perm.chatterRecruiting",
  "Cuentas Spammer": "admin.perm.spammerAccounts",
  "Control de Gasto": "admin.perm.spendControl",
  "Bot WhatsApp": "admin.perm.whatsappBot",
  "Calendario": "admin.perm.calendar",
  "Documentos": "admin.perm.documents",
  "Hojas de cálculo": "admin.perm.spreadsheets",
  "Presentaciones": "admin.perm.presentations",
  "Lista": "admin.perm.list",
  "Perfil": "admin.perm.profile",
  "Lineamientos": "admin.perm.guidelines",
  "Redes": "admin.perm.social",
  "Monetización": "admin.perm.monetization",
  "Notas": "admin.perm.notes",
  "Historial": "admin.perm.history",
  "Referencias": "admin.perm.references",
  "Tablero": "admin.perm.board",
  "Tabla": "admin.perm.table",
  "Agentes": "admin.perm.agents",
  "Supervisores": "admin.perm.supervisors",
  "Rendimiento": "admin.perm.performance",
  "Actividad": "admin.perm.activity",
  "Oportunidades": "admin.perm.opportunities",
  "Dispositivos": "admin.perm.devices",
  "Bandeja": "admin.perm.inbox",
  "Canales": "admin.perm.channels",
  "Analítica": "admin.perm.analytics",
  "Cuentas": "admin.perm.accounts",
  "Lista de Tickets": "admin.perm.ticketList",
  "Plantillas": "admin.perm.templates",
  "Horarios": "admin.perm.schedules",
  "Busquedas": "admin.perm.searches",
  "Favoritas": "admin.perm.favorites",
  "Mis Tareas": "admin.perm.myTasks",
  "Alertas": "admin.perm.alerts",
  "Asistencia": "admin.perm.attendance",
  "Anomalías": "admin.perm.anomalies",
  "QA Cualitativo": "admin.perm.qualitativeQa",
  "Masivos": "admin.perm.bulk",
  "Notificaciones": "admin.perm.notifications",
  "Nómina": "admin.perm.payroll",
  "Horas Variables": "admin.perm.variableHours",
  "Control Financiero": "admin.perm.financialControl",
  "Reportes": "admin.perm.reports",
  "Candidatos": "admin.perm.candidates",
  "Empleados Activos": "admin.perm.activeEmployees",
  "Horarios Chatters": "admin.perm.chatterSchedules",
  "Horas Extra": "admin.perm.overtime",
  "Banco de Horas": "admin.perm.hoursBank",
  "Vacaciones": "admin.perm.vacation",
  "Permisos": "admin.perm.leave",
  "Monitoreo": "admin.perm.monitoring",
  "Incidentes": "admin.perm.incidents",
  "Desempeño": "admin.perm.hrPerformance",
  "Capacitación": "admin.perm.training",
  "Directorio": "admin.perm.directory",
  "Organigrama": "admin.perm.orgChart",
  "Deducciones": "admin.perm.deductions",
  "Anuncios": "admin.perm.announcements",
  "Usuarios": "admin.perm.users",
  "Auditoría": "admin.perm.audit",
  // Funciones
  "Crear sesión": "admin.perm.createSession",
  "Crear reunión": "admin.perm.createMeeting",
  "Terminar reunión": "admin.perm.endMeeting",
  "Crear Contacto": "admin.perm.createContact",
  "Editar Contacto": "admin.perm.editContact",
  "Eliminar Contacto": "admin.perm.deleteContact",
  "Ver Teléfonos": "admin.perm.viewPhones",
  "Nuevo": "admin.perm.new",
  "Editar Creator": "admin.perm.editCreator",
  "Eliminar Creator": "admin.perm.deleteCreator",
  "Editar Blu CRM": "admin.perm.editBluCrm",
  "Editar Banking": "admin.perm.editBanking",
  "Cambiar Plataforma": "admin.perm.changePlatform",
  "Editar": "admin.perm.edit",
  "Enviar al grupo": "admin.perm.sendToGroup",
  "Crear pedido": "admin.perm.createRequest",
  "Aprobar": "admin.perm.approve",
  "Gestionar": "admin.perm.manage",
  "Crear Entrada": "admin.perm.createEntry",
  "Eliminar Entradas": "admin.perm.deleteEntries",
  "Editar Status": "admin.perm.editStatus",
  "Asignar Closer": "admin.perm.assignCloser",
  "Editar Comisiones": "admin.perm.editCommissions",
  "Convertir a Creadora": "admin.perm.convertToCreator",
  "IA": "admin.perm.ai",
  "Asignar conversaciones": "admin.perm.assignConversations",
  "Crear Ticket": "admin.perm.createTicket",
  "Editar Ticket": "admin.perm.editTicket",
  "Eliminar Ticket": "admin.perm.deleteTicket",
  "Asignar Ticket": "admin.perm.assignTicket",
  "Gestionar Plantillas": "admin.perm.manageTemplates",
  "Borrar Historial": "admin.perm.deleteHistory",
  "Horarios · Gestionar": "admin.perm.manageSchedules",
  "Editar Compañías": "admin.perm.editCompanies",
  "Recomputar Lookalike": "admin.perm.recomputeLookalike",
  "Generar Tareas": "admin.perm.generateTasks",
  "Borrar Calls": "admin.perm.deleteCalls",
};

/** Nombres del catálogo que se escriben igual en los dos idiomas. */
export const IGUAL_EN_INGLES = new Set([
  "Dashboard", "Messenger", "Cowork", "Meet", "Promolog", "LeadGen", "Closers", "WhatsApp",
  "Telegram", "Tickets", "Chatters", "Scouter Assist", "Agency QA", "HR", "Onboarding",
  "Offboarding", "Info", "Promos", "Promobot", "Evaluator", "Workspace", "Admin", "Home", "Leads",
  "Funnel", "Settings", "Closers QA", "Calls", "Hubstaff", "New QA", "QA History", "QA Chat",
  "Models", "Notifications", "Chatters QA", "Scorecard", "Managers QA", "LLG QA", "Collections",
  "Invoices", "Templates", "Roles", "Drive",
]);

/** Lo que se ve de un nombre del catálogo de permisos. La llave no se toca. */
export function etiquetaPermiso(t: (clave: TranslationKey) => string, nombre: string): string {
  const clave = ETIQUETAS[nombre];
  return clave ? t(clave) : nombre;
}

/** Una sección anidada ("Perfil: Info") se muestra sin el prefijo de su padre. */
export function nombreVisibleDeSeccion(nombre: string): string {
  return nombre.includes(": ") ? nombre.split(": ").slice(1).join(": ") : nombre;
}
