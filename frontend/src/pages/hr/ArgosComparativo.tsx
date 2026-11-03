import { useLanguage } from "@/hooks/useLanguage";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { GitCompare, Check, Plus } from "lucide-react";
import type { TranslationKey } from "@/lib/i18n";

// Comparativo "Ahora y Argos": el vigilante del coordinador que ya está (de Jhon,
// 8 situaciones, voz robótica, solo al coordinador) frente a Argos (15
// situaciones, voz seria, avisa a todos, editable en Ajustes). Página solo del
// dueño, vive al lado de Argos (/hr/monitor-ia). Todo el texto por t().

const FILAS: Array<{ q: TranslationKey; ahora: TranslationKey; argos: TranslationKey }> = [
  { q: "hr.monia.cmp.rowQue", ahora: "hr.monia.cmp.queAhora", argos: "hr.monia.cmp.queArgos" },
  { q: "hr.monia.cmp.rowCuantas", ahora: "hr.monia.cmp.cuantasAhora", argos: "hr.monia.cmp.cuantasArgos" },
  { q: "hr.monia.cmp.rowVoz", ahora: "hr.monia.cmp.vozAhora", argos: "hr.monia.cmp.vozArgos" },
  { q: "hr.monia.cmp.rowAvisa", ahora: "hr.monia.cmp.avisaAhora", argos: "hr.monia.cmp.avisaArgos" },
  { q: "hr.monia.cmp.rowConfig", ahora: "hr.monia.cmp.configAhora", argos: "hr.monia.cmp.configArgos" },
  { q: "hr.monia.cmp.rowDueno", ahora: "hr.monia.cmp.duenoAhora", argos: "hr.monia.cmp.duenoArgos" },
];

const QUEDAN: TranslationKey[] = [
  "hr.monia.cmp.s.camara", "hr.monia.cmp.s.rostro", "hr.monia.cmp.s.cuadro", "hr.monia.cmp.s.luz",
  "hr.monia.cmp.s.pantalla", "hr.monia.cmp.s.bano", "hr.monia.cmp.s.break", "hr.monia.cmp.s.almuerzo",
];

const NUEVAS: TranslationKey[] = [
  "hr.monia.cmp.n.celular", "hr.monia.cmp.n.distraido", "hr.monia.cmp.n.fuera", "hr.monia.cmp.n.senal",
  "hr.monia.cmp.n.tarde", "hr.monia.cmp.n.inactivo", "hr.monia.cmp.n.pausas",
];

export default function ArgosComparativo() {
  const { t } = useLanguage();

  return (
    <Page>
      <PageHeader
        title={t("hr.monia.cmp.title")}
        subtitle={t("hr.monia.cmp.subtitle")}
        icon={<GitCompare className="h-5 w-5" />}
      />

      {/* Cabeceras: Ahora (Jhon) vs Argos. */}
      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-muted/30 p-5">
          <p className="text-xs font-semibold text-muted-foreground">{t("hr.monia.cmp.ahora")}</p>
          <p className="mt-1.5 text-sm text-muted-foreground">{t("hr.monia.cmp.ahoraDesc")}</p>
        </div>
        <div className="rounded-2xl border border-primary/40 bg-primary/5 p-5">
          <p className="text-xs font-semibold text-primary">{t("hr.monia.cmp.argos")}</p>
          <p className="mt-1.5 text-sm text-foreground">{t("hr.monia.cmp.argosDesc")}</p>
        </div>
      </div>

      {/* Fila por fila. */}
      <div className="mt-3 grid gap-2.5">
        {FILAS.map((f) => (
          <div key={f.q} className="overflow-hidden rounded-2xl border border-border/60 bg-card">
            <p className="px-4 pt-3 text-xs font-semibold text-muted-foreground">{t(f.q)}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2">
              <p className="px-4 pb-4 pt-1.5 text-sm text-muted-foreground">{t(f.ahora)}</p>
              <p className="border-t border-border/60 px-4 pb-4 pt-1.5 text-sm text-foreground sm:border-l sm:border-t-0">
                {t(f.argos)}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Situaciones: de 8 a 15. */}
      <div className="mt-6 rounded-2xl border border-border/60 bg-muted/20 p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold tracking-tight">{t("hr.monia.cmp.sitTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("hr.monia.cmp.sitSub")}</p>
        <div className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div>
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-success">
              <Check className="h-4 w-4" />
              {t("hr.monia.cmp.keepTitle")}
            </p>
            <ul className="grid gap-2">
              {QUEDAN.map((k) => (
                <li key={k} className="flex items-center gap-2 text-sm text-foreground">
                  <span className="text-success">·</span>
                  {t(k)}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p className="mb-3 flex items-center gap-2 text-xs font-semibold text-primary">
              <Plus className="h-4 w-4" />
              {t("hr.monia.cmp.addTitle")}
            </p>
            <ul className="grid gap-2">
              {NUEVAS.map((k) => (
                <li key={k} className="flex items-center gap-2 text-sm text-foreground">
                  <Plus className="h-3 w-3 shrink-0 text-primary" />
                  {t(k)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </Page>
  );
}
