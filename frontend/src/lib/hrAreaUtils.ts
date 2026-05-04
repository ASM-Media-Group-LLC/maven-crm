// Mapping: department code → color for badges
export const DEPARTMENT_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  TEC: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400", border: "border-blue-500/20" },
  VEN: { bg: "bg-green-500/10", text: "text-green-600 dark:text-green-400", border: "border-green-500/20" },
  MKT: { bg: "bg-pink-500/10", text: "text-pink-600 dark:text-pink-400", border: "border-pink-500/20" },
  RRH: { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400", border: "border-purple-500/20" },
  FIN: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400", border: "border-amber-500/20" },
  OPE: { bg: "bg-cyan-500/10", text: "text-cyan-600 dark:text-cyan-400", border: "border-cyan-500/20" },
  DIR: { bg: "bg-orange-500/10", text: "text-orange-600 dark:text-orange-400", border: "border-orange-500/20" },
  DEFAULT: { bg: "bg-muted", text: "text-muted-foreground", border: "border-border" },
};

export function getDepartmentColors(code: string | null | undefined) {
  if (!code) return DEPARTMENT_COLORS.DEFAULT;
  return DEPARTMENT_COLORS[code.toUpperCase()] ?? DEPARTMENT_COLORS.DEFAULT;
}

export const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  activo: { bg: "bg-green-500/10", text: "text-green-600 dark:text-green-400" },
  inactivo: { bg: "bg-muted", text: "text-muted-foreground" },
  en_licencia: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" },
  suspendido: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400" },
  vacaciones: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400" },
};

export function getStatusColors(status: string | null | undefined) {
  if (!status) return STATUS_COLORS.inactivo;
  return STATUS_COLORS[status] ?? STATUS_COLORS.inactivo;
}

export const SEVERITY_COLORS: Record<string, { bg: string; text: string }> = {
  low: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400" },
  medium: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" },
  high: { bg: "bg-orange-500/10", text: "text-orange-600 dark:text-orange-400" },
  critical: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400" },
};

export const APPLICANT_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  applied: { bg: "bg-blue-500/10", text: "text-blue-600 dark:text-blue-400" },
  reviewing: { bg: "bg-amber-500/10", text: "text-amber-600 dark:text-amber-400" },
  interview: { bg: "bg-purple-500/10", text: "text-purple-600 dark:text-purple-400" },
  offer: { bg: "bg-cyan-500/10", text: "text-cyan-600 dark:text-cyan-400" },
  hired: { bg: "bg-green-500/10", text: "text-green-600 dark:text-green-400" },
  rejected: { bg: "bg-red-500/10", text: "text-red-600 dark:text-red-400" },
};
