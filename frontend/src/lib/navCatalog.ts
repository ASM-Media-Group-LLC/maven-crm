// ─── Catálogo de navegación de Maven ────────────────────────────────────────
//
// Fuente ÚNICA de "todas las rutas navegables" con título + icono + módulo de
// permisos. Hoy lo consume GlobalSearchCommand (⌘K) para ofrecer navegación
// completa filtrada por rol.
//
// UNIFICACIÓN FUTURA CON EL SIDEBAR: DashboardSidebar mantiene su propia
// estructura porque además de rutas maneja grupos colapsables con estado
// persistido, badges en vivo (useSidebarBadges/useUnreadChatCount), botones de
// mute por canal y jerarquías de 3 niveles (RRHH/Finanzas). Migrarlo a este
// catálogo es un refactor aparte: habría que modelar grupos/subgrupos, badges
// y muteChannel acá. Mientras tanto: TODA RUTA NUEVA debe agregarse en ambos
// lados (sidebar si corresponde + este catálogo, con su module/submodule
// idéntico al PermissionRoute de App.tsx para que el ⌘K nunca ofrezca una
// ruta que el rol no puede abrir).
//
// Quedan fuera a propósito:
//  - Rutas con parámetro (/creadores/:id, /hr/empleado/:id, /call/:roomName…):
//    se llega por búsqueda de entidades o desde sus listas.
//  - Redirects (/oportunidades, /finanzas/facturacion) y rutas públicas
//    (login, /entrar/:code, /chatter/:sessionId).
//  - Formularios "nuevo" secundarios (/hr/incidentes/nuevo, etc.): se llega
//    desde su lista. /creadores/nuevo y /contactos/nuevo viven como Acciones
//    del ⌘K.
//  - /correo/conectar (retorno OAuth) y /credentials (solo dev).

import type { ComponentType } from "react";
import type { TranslationKey } from "@/lib/i18n";
import {
  LayoutDashboard, Users, UserPlus, Settings, BarChart3, Bell,
  Bot, Activity, Megaphone, Phone, Smartphone, Ticket, Palette, FileText,
  ClipboardCheck, Map, Search, Headphones, Video, Users2, MessageCircle,
  Mail, Clapperboard, Gauge, UserCog, UserCheck, Clock, Eye, GraduationCap,
  Wallet, Calculator, DollarSign, Shield, Sparkles, Database, ListChecks,
  CalendarDays, Building2, Briefcase, History, CalendarRange, Gift,
  FileSpreadsheet, Presentation } from "lucide-react";
import WhatsAppIcon from "@/components/icons/WhatsAppIcon";
import TelegramIcon from "@/components/icons/TelegramIcon";

export type NavSection =
  | "Menú"
  | "Oficina"
  | "Creadoras"
  | "Ventas"
  | "Operaciones"
  | "RRHH"
  | "Finanzas"
  | "Admin"
  | "Sistema";

export interface NavCatalogEntry {
  /** Título visible (español neutro). */
  title: string;
  /** Clave i18n opcional — si existe, el consumidor puede traducir con t(). */
  i18nKey?: TranslationKey;
  url: string;
  icon: ComponentType<{ className?: string }>;
  /** Módulo del sistema de permisos (usePermissions.canAccess). Sin módulo = visible para todo usuario logueado. */
  module?: string;
  submodule?: string;
  /** Rutas envueltas en AdminRoute (solo admins). */
  adminOnly?: boolean;
  /** Sección para agrupar en el ⌘K (espeja las secciones del sidebar). */
  section: NavSection;
  /** Sinónimos / términos extra de búsqueda. */
  keywords?: string[];
}

export const NAV_CATALOG: NavCatalogEntry[] = [
  // ── Menú ──────────────────────────────────────────────────────────────
  { title: "Dashboard", i18nKey: "nav.dashboard", url: "/dashboard", icon: LayoutDashboard, module: "Dashboard", section: "Menú", keywords: ["inicio", "home", "ventas", "ingresos", "dashboard v2", "dashboard ventas"] },
  { title: "Correo", i18nKey: "nav.mail", url: "/correo", icon: Mail, module: "Correo", section: "Menú", keywords: ["email", "mail", "zoho"] },
  { title: "Messenger", i18nKey: "nav.messenger", url: "/messenger", icon: MessageCircle, module: "Messenger", section: "Menú", keywords: ["chat", "mensajes"] },
  { title: "Cowork", i18nKey: "nav.cowork", url: "/cowork", icon: Users2, module: "Cowork", section: "Menú", keywords: ["sala", "video"] },
  { title: "Meet", i18nKey: "nav.meet", url: "/meet", icon: Video, module: "Meet", section: "Menú", keywords: ["reunión", "videollamada"] },
  { title: "Grabaciones", i18nKey: "nav.recordings", url: "/grabaciones", icon: Clapperboard, module: "Grabaciones", section: "Menú", keywords: ["recordings", "meet"] },
  { title: "Documentos", i18nKey: "nav.office.docs", url: "/oficina", icon: FileText, module: "Oficina", submodule: "Documentos", section: "Oficina", keywords: ["documentos", "docs", "word", "google docs", "oficina"] },
  { title: "Hojas de cálculo", i18nKey: "nav.office.sheets", url: "/oficina/hojas", icon: FileSpreadsheet, module: "Oficina", submodule: "Hojas de cálculo", section: "Oficina", keywords: ["hojas", "excel", "sheets", "calculo", "planilla", "oficina"] },
  { title: "Presentaciones", i18nKey: "nav.office.slides", url: "/oficina/presentaciones", icon: Presentation, module: "Oficina", submodule: "Presentaciones", section: "Oficina", keywords: ["presentaciones", "powerpoint", "slides", "diapositivas", "oficina"] },
  { title: "Contactos", i18nKey: "nav.contacts", url: "/contactos", icon: UserPlus, module: "Contactos", section: "Menú", keywords: ["directorio"] },
  { title: "Panel de control", i18nKey: "nav.controlPanel", url: "/panel-de-control", icon: Gauge, module: "Panel de control", section: "Menú", keywords: ["control", "kpis"] },

  // ── Creadoras ─────────────────────────────────────────────────────────
  { title: "Creadoras · Dashboard", i18nKey: "nav.cat.creatorsDashboard", url: "/creadores/dashboard", icon: Users, module: "Creadores", submodule: "Dashboard", section: "Creadoras" },
  { title: "Creadoras · Listado", i18nKey: "nav.cat.creatorsList", url: "/creadores", icon: Users, module: "Creadores", submodule: "Lista", section: "Creadoras", keywords: ["modelos", "roster"] },
  { title: "Creadoras · Onboarding", i18nKey: "nav.cat.creatorsOnboarding", url: "/creadores/onboarding", icon: ClipboardCheck, module: "Creadores", submodule: "Onboarding", section: "Creadoras" },
  { title: "Creadoras · Offboarding", i18nKey: "nav.cat.creatorsOffboarding", url: "/creadores/offboarding", icon: ClipboardCheck, module: "Creadores", submodule: "Offboarding", section: "Creadoras" },

  // ── Operaciones ───────────────────────────────────────────────────────
  { title: "Promolog", i18nKey: "nav.promolog", url: "/promolog", icon: Megaphone, module: "Promolog", section: "Operaciones", keywords: ["promos", "historias"] },
  { title: "Parrilla", i18nKey: "nav.contentGrid", url: "/parrilla", icon: CalendarRange, module: "Parrilla", section: "Operaciones", keywords: ["parrilla de contenido", "plan semanal", "promocion"] },
  { title: "Personalizados", i18nKey: "nav.customs", url: "/personalizados", icon: Gift, module: "Personalizados", section: "Operaciones", keywords: ["custom", "pedidos", "personalizado", "fan", "buster"] },
  { title: "LeadGen", i18nKey: "nav.leadgen", url: "/leadgen", icon: Activity, module: "LeadGen", section: "Operaciones", keywords: ["leads"] },
  { title: "LeadGen · Base de datos", i18nKey: "nav.cat.leadgenDb", url: "/leadgen/base-datos", icon: Database, module: "LeadGen", section: "Operaciones" },
  { title: "Closers", i18nKey: "nav.closers", url: "/closers", icon: Phone, module: "Closers", section: "Operaciones", keywords: ["pipeline", "operaciones"] },
  { title: "Teléfonos", i18nKey: "nav.phones", url: "/telefonos", icon: Smartphone, module: "Telefonos", section: "Operaciones", keywords: ["cloud phones"] },
  { title: "WhatsApp · Bandeja", i18nKey: "nav.cat.waInbox", url: "/inbox", icon: WhatsAppIcon, module: "WhatsApp", submodule: "Bandeja", section: "Operaciones", keywords: ["inbox", "wa"] },
  { title: "WhatsApp · Canales", i18nKey: "nav.cat.waChannels", url: "/inbox/canales", icon: WhatsAppIcon, module: "WhatsApp", submodule: "Canales", section: "Operaciones", keywords: ["líneas"] },
  { title: "WhatsApp · Bots", i18nKey: "nav.cat.waBots", url: "/inbox/bots", icon: Bot, module: "WhatsApp", submodule: "Canales", section: "Operaciones" },
  { title: "WhatsApp · Analítica", i18nKey: "nav.cat.waAnalytics", url: "/inbox/analitica", icon: BarChart3, module: "WhatsApp", submodule: "Analítica", section: "Operaciones" },
  { title: "Telegram · Bandeja", i18nKey: "nav.cat.tgInbox", url: "/telegram/bandeja", icon: TelegramIcon, module: "Telegram", submodule: "Bandeja", section: "Operaciones", keywords: ["tg"] },
  { title: "Telegram · Cuentas", i18nKey: "nav.cat.tgAccounts", url: "/telegram", icon: TelegramIcon, module: "Telegram", section: "Operaciones" },
  { title: "Tickets", i18nKey: "nav.tickets", url: "/tickets", icon: Ticket, module: "Tickets", section: "Operaciones", keywords: ["quejas", "solicitudes"] },
  { title: "Chatter Evaluator", i18nKey: "nav.chatterEvaluator", url: "/chatter-evaluator", icon: ClipboardCheck, module: "Chatters", submodule: "Evaluator", section: "Operaciones" },
  { title: "Chatter Evaluator · Historial", i18nKey: "nav.cat.chatterEvalHistory", url: "/chatter-evaluator/history", icon: History, module: "Chatters", submodule: "Evaluator", section: "Operaciones" },
  { title: "Chatter Evaluator · Admin", i18nKey: "nav.cat.chatterEvalAdmin", url: "/chatter-evaluator/admin", icon: UserCog, module: "Chatters", submodule: "Admin", section: "Operaciones" },
  { title: "Chatter Workspace", i18nKey: "nav.cat.chatterWorkspace", url: "/chatter-evaluator/workspace", icon: Briefcase, module: "Chatters", submodule: "Workspace", section: "Operaciones" },
  { title: "Chatters · Rendimiento", i18nKey: "nav.chattersPerformance", url: "/chatter-evaluator/rendimiento", icon: Gauge, module: "Chatters", submodule: "Rendimiento", section: "Operaciones", keywords: ["nota", "ventas", "masivos", "blu"] },
  { title: "Chatters · Horarios", i18nKey: "nav.chattersSchedules", url: "/chatters/horarios", icon: CalendarDays, module: "Chatters", submodule: "Horarios", section: "Operaciones", keywords: ["turnos", "descansos", "modelos asignadas", "grupos", "horario"] },
  { title: "Scouter Assist", i18nKey: "nav.scouterAssist", url: "/scouter-assist", icon: Search, module: "Scouter Assist", section: "Operaciones" },
  { title: "Company QA", i18nKey: "nav.companyQa", url: "/agency-qa", icon: Headphones, module: "Agency QA", section: "Operaciones", keywords: ["llamadas", "calidad"] },

  // ── RRHH ──────────────────────────────────────────────────────────────
  { title: "RRHH · Dashboard", i18nKey: "nav.cat.hrDashboard", url: "/hr", icon: LayoutDashboard, module: "HR", submodule: "Dashboard", section: "RRHH", keywords: ["recursos humanos"] },
  { title: "RRHH · Personal", i18nKey: "nav.cat.hrStaff", url: "/hr/personal", icon: UserCheck, module: "HR", submodule: "Empleados Activos", section: "RRHH" },
  { title: "RRHH · Candidatos", i18nKey: "nav.cat.hrCandidates", url: "/hr/candidatos", icon: UserPlus, module: "HR", submodule: "Candidatos", section: "RRHH", keywords: ["reclutamiento"] },
  { title: "RRHH · Onboarding", i18nKey: "nav.cat.hrOnboarding", url: "/hr/onboarding", icon: ClipboardCheck, module: "HR", submodule: "Onboarding", section: "RRHH" },
  { title: "RRHH · Empleados Activos", i18nKey: "nav.cat.hrActiveEmployees", url: "/hr/directorio", icon: Users, module: "HR", submodule: "Empleados Activos", section: "RRHH", keywords: ["directorio"] },
  { title: "RRHH · Offboarding", i18nKey: "nav.cat.hrOffboarding", url: "/hr/offboarding", icon: ClipboardCheck, module: "HR", submodule: "Offboarding", section: "RRHH" },
  { title: "RRHH · Asistencia", i18nKey: "nav.cat.hrAttendance", url: "/hr/asistencia", icon: Clock, module: "HR", submodule: "Asistencia", section: "RRHH" },
  { title: "RRHH · Horarios y Turnos", i18nKey: "nav.cat.hrSchedules", url: "/hr/horarios", icon: CalendarDays, module: "HR", submodule: "Horarios", section: "RRHH" },
  { title: "RRHH · Horario del personal", i18nKey: "nav.cat.hrStaffSchedule", url: "/hr/horarios-personal", icon: CalendarDays, module: "HR", submodule: "Horarios", section: "RRHH" },
  { title: "RRHH · Horarios Chatters", i18nKey: "nav.cat.hrChatterSchedules", url: "/hr/horarios-chatters", icon: CalendarDays, module: "HR", submodule: "Horarios Chatters", section: "RRHH" },
  { title: "RRHH · Horas Extra", i18nKey: "nav.cat.hrOvertime", url: "/hr/horarios/horas-extras", icon: Clock, module: "HR", submodule: "Horas Extra", section: "RRHH" },
  { title: "RRHH · Banco de Horas", i18nKey: "nav.cat.hrHoursBank", url: "/hr/horarios/banco-horas", icon: Clock, module: "HR", submodule: "Banco de Horas", section: "RRHH" },
  { title: "RRHH · Vacaciones", i18nKey: "nav.cat.hrVacations", url: "/hr/vacaciones", icon: CalendarDays, module: "HR", submodule: "Vacaciones", section: "RRHH", keywords: ["ausencias"] },
  { title: "RRHH · Permisos", i18nKey: "nav.cat.hrLeave", url: "/hr/permisos", icon: ListChecks, module: "HR", submodule: "Permisos", section: "RRHH" },
  { title: "RRHH · Monitoreo", i18nKey: "nav.cat.hrMonitoring", url: "/hr/monitoreo", icon: Eye, module: "HR", submodule: "Monitoreo", section: "RRHH", keywords: ["hubstaff"] },
  { title: "RRHH · Incidentes", i18nKey: "nav.cat.hrIncidents", url: "/hr/incidentes", icon: Shield, module: "HR", submodule: "Incidentes", section: "RRHH" },
  { title: "RRHH · Desempeño", i18nKey: "nav.cat.hrPerformance", url: "/hr/desempeno", icon: GraduationCap, module: "HR", submodule: "Desempeño", section: "RRHH" },
  { title: "RRHH · Capacitación", i18nKey: "nav.cat.hrTraining", url: "/hr/capacitacion", icon: GraduationCap, module: "HR", submodule: "Capacitación", section: "RRHH" },
  { title: "RRHH · Directorio (Organización)", i18nKey: "nav.cat.hrDirectory", url: "/hr/organizacion/directorio", icon: Building2, module: "HR", submodule: "Directorio", section: "RRHH" },
  { title: "RRHH · Organigrama", i18nKey: "nav.cat.hrOrgChart", url: "/hr/organizacion/organigrama", icon: Map, module: "HR", submodule: "Organigrama", section: "RRHH" },
  { title: "RRHH · Nómina y costo", i18nKey: "nav.cat.hrPayroll", url: "/hr/nomina", icon: Wallet, module: "HR", submodule: "Deducciones", section: "RRHH", keywords: ["payroll"] },
  { title: "RRHH · Deducciones", i18nKey: "nav.cat.hrDeductions", url: "/hr/deducciones", icon: Calculator, module: "HR", submodule: "Deducciones", section: "RRHH" },
  { title: "RRHH · Anuncios Internos", i18nKey: "nav.cat.hrAnnouncements", url: "/hr/anuncios", icon: Bell, module: "HR", submodule: "Anuncios", section: "RRHH" },

  // ── Finanzas ──────────────────────────────────────────────────────────
  { title: "Finanzas · Dashboard", i18nKey: "nav.cat.finDashboard", url: "/finanzas", icon: LayoutDashboard, module: "Finanzas", submodule: "Dashboard", section: "Finanzas" },
  { title: "Finanzas · Collections", i18nKey: "nav.cat.finCollections", url: "/finanzas/collections", icon: DollarSign, module: "Finanzas", submodule: "Collections", section: "Finanzas", keywords: ["cobros"] },
  { title: "Finanzas · Nómina", i18nKey: "nav.cat.finPayroll", url: "/finanzas/nomina", icon: Calculator, module: "Finanzas", submodule: "Nómina", section: "Finanzas", keywords: ["payroll"] },
  { title: "Finanzas · Horas & Variables", i18nKey: "nav.cat.finHoursVariables", url: "/finanzas/horas-variables", icon: Clock, module: "Finanzas", submodule: "Horas Variables", section: "Finanzas" },
  { title: "Finanzas · Invoices", i18nKey: "nav.cat.finInvoices", url: "/finanzas/facturacion/invoices", icon: FileText, module: "Finanzas", submodule: "Invoices", section: "Finanzas", keywords: ["facturas", "facturación"] },
  { title: "Finanzas · Templates", i18nKey: "nav.cat.finTemplates", url: "/finanzas/facturacion/templates", icon: FileText, module: "Finanzas", submodule: "Templates", section: "Finanzas" },
  { title: "Finanzas · Control Financiero", i18nKey: "nav.cat.finControl", url: "/finanzas/control", icon: Gauge, module: "Finanzas", submodule: "Control Financiero", section: "Finanzas" },
  { title: "Finanzas · Reportes Avanzados", i18nKey: "nav.cat.finReports", url: "/finanzas/reportes", icon: BarChart3, module: "Finanzas", submodule: "Reportes", section: "Finanzas" },
  { title: "Finanzas · Configuración", i18nKey: "nav.cat.finSettings", url: "/finanzas/configuracion", icon: Settings, module: "Finanzas", submodule: "Configuración", section: "Finanzas" },


  // ── Admin ─────────────────────────────────────────────────────────────
  { title: "Admin · Usuarios", i18nKey: "nav.cat.adminUsers", url: "/admin/usuarios", icon: UserCog, adminOnly: true, section: "Admin", keywords: ["roles"] },
  { title: "Admin · Auditoría de Roles", i18nKey: "nav.cat.adminRolesAudit", url: "/admin/auditoria", icon: Shield, adminOnly: true, section: "Admin" },
  { title: "Admin · Cowork vs Hubstaff", i18nKey: "nav.cat.adminCoworkHubstaff", url: "/admin/cowork-vs-hubstaff", icon: Clock, adminOnly: true, section: "Admin", keywords: ["tiempo", "horas", "reloj"] },

  // ── Sistema (sin gate de permisos: cualquier usuario logueado) ────────
  { title: "Settings", i18nKey: "nav.settings", url: "/settings", icon: Settings, section: "Sistema", keywords: ["ajustes", "configuración", "perfil"] },
  { title: "Notificaciones", i18nKey: "nav.notifications", url: "/notificaciones", icon: Bell, section: "Sistema" },
  { title: "Preferencias de notificaciones", i18nKey: "nav.notificationPrefs", url: "/ajustes/notificaciones", icon: Bell, section: "Sistema" },
  { title: "Design System", i18nKey: "nav.designSystem", url: "/design-system", icon: Palette, section: "Sistema" },
  { title: "Documentación", i18nKey: "nav.docs", url: "/docs", icon: FileText, section: "Sistema", keywords: ["docs", "ayuda"] },
  { title: "Roadmap", i18nKey: "nav.roadmap", url: "/roadmap", icon: Map, section: "Sistema" },
];

/** Clave i18n del encabezado de cada sección en el ⌘K. El nombre de la sección
 *  sigue siendo la llave del agrupado (y el valor en cada entrada); esto solo
 *  traduce lo que se muestra. */
export const NAV_SECTION_KEYS: Record<NavSection, TranslationKey> = {
  "Menú": "nav.section.menu",
  "Oficina": "nav.section.office",
  "Creadoras": "nav.section.creators",
  "Ventas": "nav.section.sales",
  "Operaciones": "nav.section.operations",
  "RRHH": "nav.section.hr",
  "Finanzas": "nav.section.finance",
  "Admin": "nav.section.admin",
  "Sistema": "nav.section.system",
};

/** Orden estable de secciones para render agrupado en el ⌘K. */
export const NAV_SECTIONS: NavSection[] = [
  // ⚠️ Es un array, no un Record: si acá falta una sección tsc NO se queja y el
  // ⌘K simplemente deja de mostrar sus entradas, sin error. Hay guarda en
  // oficinaEnElMenu.test.ts.
  "Menú", "Oficina", "Creadoras", "Ventas", "Operaciones", "RRHH", "Finanzas", "Admin", "Sistema",
];

/**
 * Filtra el catálogo con el MISMO gate que usa el sidebar/PermissionRoute:
 * canAccess(module, submodule) + adminOnly. Entradas sin módulo son visibles
 * para cualquier usuario logueado (igual que sus rutas en App.tsx).
 */
export function filterNavCatalog(
  canAccess: (module: string, submodule?: string) => boolean,
  isAdmin: boolean,
  entries: NavCatalogEntry[] = NAV_CATALOG,
): NavCatalogEntry[] {
  return entries.filter((e) => {
    if (e.adminOnly && !isAdmin) return false;
    if (e.module && !canAccess(e.module, e.submodule)) return false;
    return true;
  });
}
