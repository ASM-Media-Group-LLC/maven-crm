import {
  Bell, CheckSquare, Users, Calendar, Briefcase, DollarSign,
  FileText, UserCheck, ShieldAlert, MessageSquare, ClipboardList,
  AlertTriangle, Clock, HelpCircle, type LucideIcon,
} from "lucide-react";

// ─── Deep link resolver ────────────────────────────────────────────
export function resolveDeepLink(
  referenceType: string | null,
  referenceId: string | null,
  deepLinkUrl: string | null,
): string {
  // Prefer explicit deep_link_url if stored
  if (deepLinkUrl) return deepLinkUrl;
  if (!referenceType || !referenceId) return "/dashboard";

  const routes: Record<string, string> = {
    task: `/tareas?taskId=${referenceId}`,
    project: `/tareas?projectId=${referenceId}`,
    creator: `/creadores/${referenceId}`,
    event: `/eventos/${referenceId}`,
    employee: `/hr/empleado/${referenceId}`,
    absence: `/hr/ausencias?id=${referenceId}`,
    ticket: `/tickets?id=${referenceId}`,
    invoice: `/finanzas/facturacion/invoices?id=${referenceId}`,
    contract: `/hr/empleado/${referenceId}#contrato`,
    lead: `/leadgen?id=${referenceId}`,
    deal: `/closers?id=${referenceId}`,
    closer_creator: `/closers?id=${referenceId}`,
    conversation: `/messenger?chat=${referenceId}`,
    announcement: `/hr/anuncios?id=${referenceId}`,
  };

  return routes[referenceType] || "/dashboard";
}

// ─── Module icon mapper ────────────────────────────────────────────
const MODULE_ICONS: Record<string, LucideIcon> = {
  creadores: Users,
  tareas: CheckSquare,
  eventos: Calendar,
  hr: Briefcase,
  finanzas: DollarSign,
  tickets: ClipboardList,
  leadgen: FileText,
  closers: DollarSign,
  messenger: MessageSquare,
  admin: ShieldAlert,
  "Comunicación": MessageSquare,
  comunicacion: MessageSquare,
};

export function getModuleIcon(moduleOrigin: string | null): LucideIcon {
  if (!moduleOrigin) return Bell;
  return MODULE_ICONS[moduleOrigin.toLowerCase()] || Bell;
}

// ─── Type icon mapper (fallback) ──────────────────────────────────
const TYPE_ICONS: Record<string, LucideIcon> = {
  onboarding_complete: UserCheck,
  onboarding_inactivity: AlertTriangle,
  verification_approved: UserCheck,
  verification_rejected: ShieldAlert,
  task_assignment: CheckSquare,
  project_assignment: ClipboardList,
  closer_assigned: UserCheck,
  closer_contact_overdue: AlertTriangle,
  closer_contact_decision: HelpCircle,
};

export function getTypeIcon(type: string): LucideIcon {
  return TYPE_ICONS[type] || Bell;
}

// ─── Priority helpers ──────────────────────────────────────────────
export function getPriorityColor(priority: string | null): string {
  switch (priority) {
    case "high":
      return "text-destructive";
    case "medium":
      return "text-warning";
    case "low":
      return "text-muted-foreground";
    default:
      return "text-muted-foreground";
  }
}

export function getPriorityDotClass(priority: string | null): string {
  switch (priority) {
    case "high":
      return "bg-destructive";
    case "medium":
      return "bg-warning";
    default:
      return "bg-muted-foreground";
  }
}

// ─── Module label for filters ─────────────────────────────────────
export const MODULE_OPTIONS = [
  { value: "creadores", label: "Creadores" },
  { value: "tareas", label: "Tareas" },
  { value: "eventos", label: "Eventos" },
  { value: "hr", label: "RRHH" },
  { value: "finanzas", label: "Finanzas" },
  { value: "tickets", label: "Tickets" },
  { value: "leadgen", label: "LeadGen" },
  { value: "closers", label: "Closers" },
  { value: "Comunicación", label: "Comunicación" },
  { value: "messenger", label: "Messenger" },
  { value: "admin", label: "Admin" },
] as const;

// Maps module option values to RBAC permission module names (capitalized)
export const MODULE_PERMISSION_MAP: Record<string, string | null> = {
  creadores: "Creadores",
  tareas: "Tareas",
  eventos: "Eventos",
  hr: "HR",
  finanzas: "Finanzas",
  tickets: "Tickets",
  leadgen: "LeadGen",
  closers: "Closers",
  "Comunicación": "HR",
  messenger: null, // universal
  admin: "Administración",
};

export const PRIORITY_OPTIONS = [
  { value: "high", label: "Alta" },
  { value: "medium", label: "Media" },
  { value: "low", label: "Baja" },
] as const;

export const STATUS_OPTIONS = [
  { value: "new", label: "Nueva" },
  { value: "read", label: "Leída" },
  { value: "archived", label: "Archivada" },
] as const;

// ─── Notification types by module (for preferences) ───────────
export const NOTIFICATION_TYPES_BY_MODULE: Record<string, { type: string; label: string }[]> = {
  Creadores: [
    { type: "onboarding_complete", label: "Onboarding completado" },
    { type: "verification_pending", label: "Verificación pendiente" },
    { type: "document_missing", label: "Documento faltante" },
    { type: "onboarding_inactivity", label: "Inactividad en onboarding" },
    { type: "verification_approved", label: "Verificación aprobada" },
    { type: "verification_rejected", label: "Verificación rechazada" },
  ],
  Tareas: [
    { type: "task_assignment", label: "Tarea asignada" },
    { type: "task_due_soon", label: "Tarea próxima a vencer" },
    { type: "task_completed", label: "Tarea completada" },
    { type: "task_overdue", label: "Tarea vencida" },
    { type: "task_stale", label: "Tarea sin actividad" },
    { type: "project_assignment", label: "Proyecto asignado" },
  ],
  HR: [
    { type: "absence_request", label: "Solicitud de ausencia" },
    { type: "contract_expiring", label: "Contrato por vencer" },
    { type: "incident_created", label: "Incidente creado" },
  ],
  Finanzas: [
    { type: "invoice_created", label: "Factura creada" },
    { type: "payment_pending", label: "Pago pendiente" },
    { type: "payroll_ready", label: "Nómina lista" },
  ],
  Eventos: [
    { type: "event_created", label: "Evento creado" },
    { type: "event_reminder", label: "Recordatorio de evento" },
    { type: "guest_confirmed", label: "Invitado confirmado" },
  ],
  Tickets: [
    { type: "ticket_assigned", label: "Ticket asignado" },
    { type: "ticket_escalated", label: "Ticket escalado" },
  ],
  Closers: [
    { type: "closer_assigned", label: "Lead asignada" },
    { type: "closer_contact_overdue", label: "Contacto vencido" },
    { type: "closer_contact_decision", label: "Decisión pendiente (6 contactos hechos)" },
  ],
  Comunicación: [
    { type: "announcement", label: "Anuncio publicado" },
  ],
};
