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
  CalendarDays, Building2, Briefcase, History, CalendarRange, Gift } from "lucide-react";
import WhatsAppIcon from "@/components/icons/WhatsAppIcon";
import TelegramIcon from "@/components/icons/TelegramIcon";

export type NavSection =
  | "Menú"
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
  { title: "Correo", url: "/correo", icon: Mail, module: "Correo", section: "Menú", keywords: ["email", "mail", "zoho"] },
  { title: "Messenger", url: "/messenger", icon: MessageCircle, module: "Messenger", section: "Menú", keywords: ["chat", "mensajes"] },
  { title: "Cowork", url: "/cowork", icon: Users2, module: "Cowork", section: "Menú", keywords: ["sala", "video"] },
  { title: "Meet", url: "/meet", icon: Video, module: "Meet", section: "Menú", keywords: ["reunión", "videollamada"] },
  { title: "Grabaciones", url: "/grabaciones", icon: Clapperboard, module: "Grabaciones", section: "Menú", keywords: ["recordings", "meet"] },
  { title: "Contactos", i18nKey: "nav.contacts", url: "/contactos", icon: UserPlus, module: "Contactos", section: "Menú", keywords: ["directorio"] },
  { title: "Panel de control", url: "/panel-de-control", icon: Gauge, module: "Panel de control", section: "Menú", keywords: ["control", "kpis"] },

  // ── Creadoras ─────────────────────────────────────────────────────────
  { title: "Creadoras · Dashboard", url: "/creadores/dashboard", icon: Users, module: "Creadores", submodule: "Dashboard", section: "Creadoras" },
  { title: "Creadoras · Listado", url: "/creadores", icon: Users, module: "Creadores", submodule: "Lista", section: "Creadoras", keywords: ["modelos", "roster"] },
  { title: "Creadoras · Onboarding", url: "/creadores/onboarding", icon: ClipboardCheck, module: "Creadores", submodule: "Onboarding", section: "Creadoras" },
  { title: "Creadoras · Offboarding", url: "/creadores/offboarding", icon: ClipboardCheck, module: "Creadores", submodule: "Offboarding", section: "Creadoras" },

  // ── Operaciones ───────────────────────────────────────────────────────
  { title: "Promolog", i18nKey: "nav.promolog", url: "/promolog", icon: Megaphone, module: "Promolog", section: "Operaciones", keywords: ["promos", "historias"] },
  { title: "Parrilla", url: "/parrilla", icon: CalendarRange, module: "Parrilla", section: "Operaciones", keywords: ["parrilla de contenido", "plan semanal", "promocion"] },
  { title: "Personalizados", url: "/personalizados", icon: Gift, module: "Personalizados", section: "Operaciones", keywords: ["custom", "pedidos", "personalizado", "fan", "buster"] },
  { title: "LeadGen", i18nKey: "nav.leadgen", url: "/leadgen", icon: Activity, module: "LeadGen", section: "Operaciones", keywords: ["leads"] },
  { title: "LeadGen · Base de datos", url: "/leadgen/base-datos", icon: Database, module: "LeadGen", section: "Operaciones" },
  { title: "Closers", i18nKey: "nav.closers", url: "/closers", icon: Phone, module: "Closers", section: "Operaciones", keywords: ["pipeline", "operaciones"] },
  { title: "Teléfonos", url: "/telefonos", icon: Smartphone, module: "Telefonos", section: "Operaciones", keywords: ["cloud phones"] },
  { title: "WhatsApp · Bandeja", url: "/inbox", icon: WhatsAppIcon, module: "WhatsApp", submodule: "Bandeja", section: "Operaciones", keywords: ["inbox", "wa"] },
  { title: "WhatsApp · Canales", url: "/inbox/canales", icon: WhatsAppIcon, module: "WhatsApp", submodule: "Canales", section: "Operaciones", keywords: ["líneas"] },
  { title: "WhatsApp · Bots", url: "/inbox/bots", icon: Bot, module: "WhatsApp", submodule: "Canales", section: "Operaciones" },
  { title: "WhatsApp · Analítica", url: "/inbox/analitica", icon: BarChart3, module: "WhatsApp", submodule: "Analítica", section: "Operaciones" },
  { title: "Telegram · Bandeja", url: "/telegram/bandeja", icon: TelegramIcon, module: "Telegram", submodule: "Bandeja", section: "Operaciones", keywords: ["tg"] },
  { title: "Telegram · Cuentas", url: "/telegram", icon: TelegramIcon, module: "Telegram", section: "Operaciones" },
  { title: "Tickets", i18nKey: "nav.tickets", url: "/tickets", icon: Ticket, module: "Tickets", section: "Operaciones", keywords: ["quejas", "solicitudes"] },
  { title: "Chatter Evaluator", url: "/chatter-evaluator", icon: ClipboardCheck, module: "Chatters", submodule: "Evaluator", section: "Operaciones" },
  { title: "Chatter Evaluator · Historial", url: "/chatter-evaluator/history", icon: History, module: "Chatters", submodule: "Evaluator", section: "Operaciones" },
  { title: "Chatter Evaluator · Admin", url: "/chatter-evaluator/admin", icon: UserCog, module: "Chatters", submodule: "Admin", section: "Operaciones" },
  { title: "Chatter Workspace", url: "/chatter-evaluator/workspace", icon: Briefcase, module: "Chatters", submodule: "Workspace", section: "Operaciones" },
  { title: "Chatters · Rendimiento", url: "/chatter-evaluator/rendimiento", icon: Gauge, module: "Chatters", submodule: "Rendimiento", section: "Operaciones", keywords: ["nota", "ventas", "masivos", "blu"] },
  { title: "Chatters · Horarios", url: "/chatters/horarios", icon: CalendarDays, module: "Chatters", submodule: "Horarios", section: "Operaciones", keywords: ["turnos", "descansos", "modelos asignadas", "grupos", "horario"] },
  { title: "Scouter Assist", url: "/scouter-assist", icon: Search, module: "Scouter Assist", section: "Operaciones" },
  { title: "Company QA", url: "/agency-qa", icon: Headphones, module: "Agency QA", section: "Operaciones", keywords: ["llamadas", "calidad"] },

  // ── RRHH ──────────────────────────────────────────────────────────────
  { title: "RRHH · Dashboard", url: "/hr", icon: LayoutDashboard, module: "HR", submodule: "Dashboard", section: "RRHH", keywords: ["recursos humanos"] },
  { title: "RRHH · Personal", url: "/hr/personal", icon: UserCheck, module: "HR", submodule: "Empleados Activos", section: "RRHH" },
  { title: "RRHH · Candidatos", url: "/hr/candidatos", icon: UserPlus, module: "HR", submodule: "Candidatos", section: "RRHH", keywords: ["reclutamiento"] },
  { title: "RRHH · Onboarding", url: "/hr/onboarding", icon: ClipboardCheck, module: "HR", submodule: "Onboarding", section: "RRHH" },
  { title: "RRHH · Empleados Activos", url: "/hr/directorio", icon: Users, module: "HR", submodule: "Empleados Activos", section: "RRHH", keywords: ["directorio"] },
  { title: "RRHH · Offboarding", url: "/hr/offboarding", icon: ClipboardCheck, module: "HR", submodule: "Offboarding", section: "RRHH" },
  { title: "RRHH · Asistencia", url: "/hr/asistencia", icon: Clock, module: "HR", submodule: "Asistencia", section: "RRHH" },
  { title: "RRHH · Horarios y Turnos", url: "/hr/horarios", icon: CalendarDays, module: "HR", submodule: "Horarios", section: "RRHH" },
  { title: "RRHH · Horario del personal", url: "/hr/horarios-personal", icon: CalendarDays, module: "HR", submodule: "Horarios", section: "RRHH" },
  { title: "RRHH · Horarios Chatters", url: "/hr/horarios-chatters", icon: CalendarDays, module: "HR", submodule: "Horarios Chatters", section: "RRHH" },
  { title: "RRHH · Horas Extra", url: "/hr/horarios/horas-extras", icon: Clock, module: "HR", submodule: "Horas Extra", section: "RRHH" },
  { title: "RRHH · Banco de Horas", url: "/hr/horarios/banco-horas", icon: Clock, module: "HR", submodule: "Banco de Horas", section: "RRHH" },
  { title: "RRHH · Vacaciones", url: "/hr/vacaciones", icon: CalendarDays, module: "HR", submodule: "Vacaciones", section: "RRHH", keywords: ["ausencias"] },
  { title: "RRHH · Permisos", url: "/hr/permisos", icon: ListChecks, module: "HR", submodule: "Permisos", section: "RRHH" },
  { title: "RRHH · Monitoreo", url: "/hr/monitoreo", icon: Eye, module: "HR", submodule: "Monitoreo", section: "RRHH", keywords: ["hubstaff"] },
  { title: "RRHH · Incidentes", url: "/hr/incidentes", icon: Shield, module: "HR", submodule: "Incidentes", section: "RRHH" },
  { title: "RRHH · Desempeño", url: "/hr/desempeno", icon: GraduationCap, module: "HR", submodule: "Desempeño", section: "RRHH" },
  { title: "RRHH · Capacitación", url: "/hr/capacitacion", icon: GraduationCap, module: "HR", submodule: "Capacitación", section: "RRHH" },
  { title: "RRHH · Directorio (Organización)", url: "/hr/organizacion/directorio", icon: Building2, module: "HR", submodule: "Directorio", section: "RRHH" },
  { title: "RRHH · Organigrama", url: "/hr/organizacion/organigrama", icon: Map, module: "HR", submodule: "Organigrama", section: "RRHH" },
  { title: "RRHH · Nómina y costo", url: "/hr/nomina", icon: Wallet, module: "HR", submodule: "Deducciones", section: "RRHH", keywords: ["payroll"] },
  { title: "RRHH · Deducciones", url: "/hr/deducciones", icon: Calculator, module: "HR", submodule: "Deducciones", section: "RRHH" },
  { title: "RRHH · Anuncios Internos", url: "/hr/anuncios", icon: Bell, module: "HR", submodule: "Anuncios", section: "RRHH" },

  // ── Finanzas ──────────────────────────────────────────────────────────
  { title: "Finanzas · Dashboard", url: "/finanzas", icon: LayoutDashboard, module: "Finanzas", submodule: "Dashboard", section: "Finanzas" },
  { title: "Finanzas · Collections", url: "/finanzas/collections", icon: DollarSign, module: "Finanzas", submodule: "Collections", section: "Finanzas", keywords: ["cobros"] },
  { title: "Finanzas · Nómina", url: "/finanzas/nomina", icon: Calculator, module: "Finanzas", submodule: "Nómina", section: "Finanzas", keywords: ["payroll"] },
  { title: "Finanzas · Horas & Variables", url: "/finanzas/horas-variables", icon: Clock, module: "Finanzas", submodule: "Horas Variables", section: "Finanzas" },
  { title: "Finanzas · Invoices", url: "/finanzas/facturacion/invoices", icon: FileText, module: "Finanzas", submodule: "Invoices", section: "Finanzas", keywords: ["facturas", "facturación"] },
  { title: "Finanzas · Templates", url: "/finanzas/facturacion/templates", icon: FileText, module: "Finanzas", submodule: "Templates", section: "Finanzas" },
  { title: "Finanzas · Control Financiero", url: "/finanzas/control", icon: Gauge, module: "Finanzas", submodule: "Control Financiero", section: "Finanzas" },
  { title: "Finanzas · Reportes Avanzados", url: "/finanzas/reportes", icon: BarChart3, module: "Finanzas", submodule: "Reportes", section: "Finanzas" },
  { title: "Finanzas · Configuración", url: "/finanzas/configuracion", icon: Settings, module: "Finanzas", submodule: "Configuración", section: "Finanzas" },


  // ── Admin ─────────────────────────────────────────────────────────────
  { title: "Admin · Usuarios", url: "/admin/usuarios", icon: UserCog, adminOnly: true, section: "Admin", keywords: ["roles"] },
  { title: "Admin · Auditoría de Roles", url: "/admin/auditoria", icon: Shield, adminOnly: true, section: "Admin" },

  // ── Sistema (sin gate de permisos: cualquier usuario logueado) ────────
  { title: "Settings", i18nKey: "nav.settings", url: "/settings", icon: Settings, section: "Sistema", keywords: ["ajustes", "configuración", "perfil"] },
  { title: "Notificaciones", url: "/notificaciones", icon: Bell, section: "Sistema" },
  { title: "Preferencias de notificaciones", url: "/ajustes/notificaciones", icon: Bell, section: "Sistema" },
  { title: "Design System", i18nKey: "nav.designSystem", url: "/design-system", icon: Palette, section: "Sistema" },
  { title: "Documentación", i18nKey: "nav.docs", url: "/docs", icon: FileText, section: "Sistema", keywords: ["docs", "ayuda"] },
  { title: "Roadmap", url: "/roadmap", icon: Map, section: "Sistema" },
];

/** Orden estable de secciones para render agrupado en el ⌘K. */
export const NAV_SECTIONS: NavSection[] = [
  "Menú", "Creadoras", "Ventas", "Operaciones", "RRHH", "Finanzas", "Admin", "Sistema",
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
