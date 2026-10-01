import { conEtiqueta } from "@/lib/etiquetaTraducida";
import { Bell, CheckSquare, Users, Calendar, Briefcase, DollarSign, FileText, UserCheck, ShieldAlert, MessageSquare, ClipboardList, AlertTriangle, Clock, HelpCircle, type LucideIcon, AtSign } from "lucide-react";

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
    creator: `/creadores/${referenceId}`,
    employee: `/hr/empleado/${referenceId}`,
    absence: `/hr/ausencias?id=${referenceId}`,
    ticket: `/tickets?id=${referenceId}`,
    invoice: `/finanzas/facturacion/invoices?id=${referenceId}`,
    contract: `/hr/empleado/${referenceId}#contrato`,
    lead: `/leadgen?id=${referenceId}`,
    deal: `/closers?id=${referenceId}`,
    closer_creator: `/closers?id=${referenceId}`,
    // `c`, no `chat`: es el parámetro que MessengerPage lee (auditoría 15/09).
    conversation: `/messenger?c=${referenceId}`,
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
  chat_mention: AtSign,
  chat_message: MessageSquare,
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
// `value` es notifications.module_origin (dato: "Comunicación" va con tilde
// porque así lo escribe la base). Se traduce solo la etiqueta; ver
// lib/etiquetaTraducida.ts.
export const MODULE_OPTIONS = [
  conEtiqueta({ value: "creadores" }, "int.notif.module.creadores"),
  conEtiqueta({ value: "hr" }, "int.notif.module.hr"),
  conEtiqueta({ value: "finanzas" }, "int.notif.module.finanzas"),
  conEtiqueta({ value: "tickets" }, "int.notif.module.tickets"),
  conEtiqueta({ value: "leadgen" }, "int.notif.module.leadgen"),
  conEtiqueta({ value: "closers" }, "int.notif.module.closers"),
  conEtiqueta({ value: "Comunicación" }, "int.notif.module.comunicacion"),
  conEtiqueta({ value: "messenger" }, "int.notif.module.messenger"),
  conEtiqueta({ value: "admin" }, "int.notif.module.admin"),
] as const;

// Maps module option values to RBAC permission module names (capitalized)
export const MODULE_PERMISSION_MAP: Record<string, string | null> = {
  creadores: "Creadores",
  hr: "HR",
  finanzas: "Finanzas",
  tickets: "Tickets",
  leadgen: "LeadGen",
  closers: "Closers",
  "Comunicación": "HR",
  "chatter-evaluator": "Chatters",
  messenger: null, // universal
  admin: "Administración",
};

export const PRIORITY_OPTIONS = [
  conEtiqueta({ value: "high" }, "int.level.high"),
  conEtiqueta({ value: "medium" }, "int.level.medium"),
  conEtiqueta({ value: "low" }, "int.level.low"),
] as const;

export const STATUS_OPTIONS = [
  conEtiqueta({ value: "new" }, "common.newF"),
  conEtiqueta({ value: "read" }, "int.notif.status.read"),
  conEtiqueta({ value: "archived" }, "int.notif.status.archived"),
] as const;
