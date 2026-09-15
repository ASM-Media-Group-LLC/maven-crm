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
