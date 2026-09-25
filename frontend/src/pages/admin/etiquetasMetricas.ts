import type { TranslationKey } from "@/lib/i18n";
import { admin } from "@/lib/i18n/admin";

// Las métricas de los reportes (hooks/reportMetricsCatalog.ts) traen su `label`
// en español. La `key` es lo que se guarda en report_schedules.metrics y no se
// toca; la etiqueta se dibuja desde el diccionario ("admin.metric.<key>"), y si
// una métrica nueva todavía no tiene clave se ve la del catálogo tal cual.
export function etiquetaMetrica(
  t: (clave: TranslationKey) => string,
  metrica: { key: string; label: string },
): string {
  const clave = `admin.metric.${metrica.key}`;
  return clave in admin ? t(clave as TranslationKey) : metrica.label;
}
