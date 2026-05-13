// Catálogo de métricas disponibles para los reportes programados.
// Cada métrica declara:
//   · key: identificador único (persistido en report_schedules.metrics)
//   · label: texto que ve el admin en el checkbox
//   · module: módulo de reporte al que pertenece (llg/closers/chatters)
//   · requires: lista de (module, submodule) en role_permissions que el
//     rol debe tener para que la métrica aparezca como disponible. Si
//     submodule es null, basta con tener el módulo entero.
//
// Si un rol NO tiene permiso para ninguna métrica del módulo elegido,
// el dropdown del modal aparece vacío — y se le avisa al admin.

import type { ReportModule } from "./useReportSchedules";

export interface MetricRequirement {
  module: string;
  submodule: string | null;
}

export interface MetricDef {
  key: string;
  label: string;
  module: ReportModule;
  requires: MetricRequirement[];
}

export const METRICS_CATALOG: MetricDef[] = [
  // ─── LLG ────────────────────────────────────────────────────────────
  {
    key: "llg.nuevos",
    label: "Leads Nuevos",
    module: "llg",
    requires: [{ module: "LeadGen", submodule: null }],
  },
  {
    key: "llg.recuperacion",
    label: "Leads Recuperación",
    module: "llg",
    requires: [{ module: "LeadGen", submodule: null }],
  },
  {
    key: "llg.total",
    label: "Total Leads (nuevos + recuperación)",
    module: "llg",
    requires: [{ module: "LeadGen", submodule: null }],
  },
  {
    key: "llg.numeros",
    label: "Números obtenidos",
    module: "llg",
    requires: [{ module: "LeadGen", submodule: null }],
  },
  {
    key: "llg.conversion",
    label: "% Conversión (números / total)",
    module: "llg",
    requires: [{ module: "LeadGen", submodule: null }],
  },

  // ─── Closers ────────────────────────────────────────────────────────
  {
    key: "closer.asignadas",
    label: "Asignadas",
    module: "closers",
    requires: [{ module: "Closers", submodule: null }],
  },
  {
    key: "closer.confirmadas",
    label: "Confirmadas",
    module: "closers",
    requires: [{ module: "Closers", submodule: null }],
  },
  {
    key: "closer.completadas",
    label: "Completadas",
    module: "closers",
    requires: [{ module: "Closers", submodule: null }],
  },
  {
    key: "closer.llamadas",
    label: "Llamadas realizadas",
    module: "closers",
    requires: [{ module: "Agency QA", submodule: null }],
  },
  {
    key: "closer.qa_avg",
    label: "Nota QA promedio",
    module: "closers",
    requires: [{ module: "Agency QA", submodule: null }],
  },
  {
    key: "closer.cerradas",
    label: "Cerradas (call_outcome=cerro)",
    module: "closers",
    requires: [{ module: "Agency QA", submodule: null }],
  },
  {
    key: "closer.no_cerradas",
    label: "No cerradas (en_espera + no_cerro)",
    module: "closers",
    requires: [{ module: "Agency QA", submodule: null }],
  },

  // ─── Chatters ───────────────────────────────────────────────────────
  {
    key: "chatter.evaluadas",
    label: "Personas evaluadas",
    module: "chatters",
    requires: [{ module: "Chatters", submodule: null }],
  },
  {
    key: "chatter.aprobadas",
    label: "Aprobadas",
    module: "chatters",
    requires: [{ module: "Chatters", submodule: null }],
  },
  {
    key: "chatter.reprobadas",
    label: "Reprobadas",
    module: "chatters",
    requires: [{ module: "Chatters", submodule: null }],
  },
  {
    key: "chatter.exito",
    label: "% éxito (aprobadas / total)",
    module: "chatters",
    requires: [{ module: "Chatters", submodule: null }],
  },
  {
    key: "chatter.score_avg",
    label: "Score promedio",
    module: "chatters",
    requires: [{ module: "Chatters", submodule: null }],
  },
];

// Default por módulo cuando schedule.metrics es NULL (backward compat).
export const DEFAULT_METRICS_BY_MODULE: Record<ReportModule, string[]> = {
  llg: ["llg.nuevos", "llg.recuperacion", "llg.total", "llg.numeros", "llg.conversion"],
  closers: [
    "closer.asignadas",
    "closer.confirmadas",
    "closer.completadas",
    "closer.llamadas",
    "closer.qa_avg",
    "closer.cerradas",
    "closer.no_cerradas",
  ],
  chatters: [
    "chatter.evaluadas",
    "chatter.aprobadas",
    "chatter.reprobadas",
    "chatter.exito",
    "chatter.score_avg",
  ],
};

// Dada una lista de (module, submodule) accesibles para el rol, devuelve
// qué métricas del catálogo están disponibles. Si el rol tiene acceso a
// CUALQUIER submodule del module declarado en `requires`, basta.
export function filterMetricsByPermissions(
  module: ReportModule,
  permissions: Array<{ module: string; submodule: string | null }>,
): MetricDef[] {
  const accessibleModules = new Set(
    permissions.filter((p) => p).map((p) => p.module),
  );
  return METRICS_CATALOG.filter((m) => {
    if (m.module !== module) return false;
    // Para que la métrica aparezca, el rol debe tener acceso a TODOS los
    // requires (en este catálogo son singulares, pero estructuralmente
    // soportamos AND).
    return m.requires.every((r) => accessibleModules.has(r.module));
  });
}
