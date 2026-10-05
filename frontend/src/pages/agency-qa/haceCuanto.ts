import type { TranslationKey } from "@/lib/i18n";

type Traductor = (key: TranslationKey, params?: Record<string, string | number>) => string;

/** "hace 5 min" / "5 min ago": hace cuánto se sincronizó Hubstaff por última vez.
 *  Antes cada panel de QA (asistencia, anomalías, esfuerzo, closers, LLG, chatters)
 *  tenía su propia copia en español. Recibe el `t` del componente para que se
 *  vuelva a dibujar al cambiar el idioma. */
export function haceCuanto(iso: string | null, t: Traductor): string {
  if (!iso) return t("agencyQa.sync.never");
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return t("agencyQa.sync.justNow");
  if (min < 60) return t("agencyQa.sync.minAgo", { n: min });
  const h = Math.floor(min / 60);
  if (h < 24) return t("agencyQa.sync.hoursAgo", { n: h });
  return t("agencyQa.sync.daysAgo", { n: Math.floor(h / 24) });
}
