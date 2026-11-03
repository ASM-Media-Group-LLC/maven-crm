import { useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { GitCompare, Check, Plus, Play, Square, Volume2 } from "lucide-react";
import translations, { type TranslationKey } from "@/lib/i18n";
import { hablar } from "@/lib/voz";
import { anunciar } from "@/lib/anunciarVoz";

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

// Las 8 situaciones del coordinador, con su etiqueta y su FRASE hablada. La voz
// siempre va en español (es-419), así que se lee el `.es` del diccionario sin
// importar el idioma de la interfaz.
const OIR: Array<{ label: TranslationKey; voz: TranslationKey }> = [
  { label: "hr.monia.cmp.s.camara", voz: "hr.monia.cmp.voz.camara" },
  { label: "hr.monia.cmp.s.rostro", voz: "hr.monia.cmp.voz.rostro" },
  { label: "hr.monia.cmp.s.cuadro", voz: "hr.monia.cmp.voz.cuadro" },
  { label: "hr.monia.cmp.s.luz", voz: "hr.monia.cmp.voz.luz" },
  { label: "hr.monia.cmp.s.pantalla", voz: "hr.monia.cmp.voz.pantalla" },
  { label: "hr.monia.cmp.s.bano", voz: "hr.monia.cmp.voz.bano" },
  { label: "hr.monia.cmp.s.break", voz: "hr.monia.cmp.voz.break" },
  { label: "hr.monia.cmp.s.almuerzo", voz: "hr.monia.cmp.voz.almuerzo" },
];

const dict = translations as unknown as Record<string, { es: string; en: string }>;
const fraseEs = (k: TranslationKey): string => dict[k]?.es ?? "";

export default function ArgosComparativo() {
  const { t } = useLanguage();
  // `${modo}:${vozKey}` de lo que suena ahora, para marcar el botón.
  const [sonando, setSonando] = useState<string | null>(null);

  // Voz de AHORA: la robótica del navegador (lib/voz → speechSynthesis es-419),
  // la misma que oye el coordinador hoy.
  function playAhora(voz: TranslationKey) {
    const id = `ahora:${voz}`;
    if (sonando === id) { window.speechSynthesis?.cancel(); setSonando(null); return; }
    setSonando(id);
    const ok = hablar(fraseEs(voz), { onFin: () => setSonando((s) => (s === id ? null : s)) });
    if (!ok) setSonando(null);
  }

  // Voz de ARGOS: la del sistema (lib/anunciarVoz → ElevenLabs; hoy Mario). La
  // misma función que ya habla en Maven; cuando cambiemos la voz, suena la nueva.
  async function playArgos(voz: TranslationKey) {
    const id = `argos:${voz}`;
    if (sonando === id) { setSonando(null); return; }
    setSonando(id);
    try { await anunciar(fraseEs(voz)); } catch { /* cae solo a la del navegador */ }
    setSonando((s) => (s === id ? null : s));
  }

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

      {/* Óyelo: cada situación, con la voz de ahora (robótica) y la de Argos. */}
      <div className="mt-6 rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
          <Volume2 className="h-5 w-5 text-primary" />
          {t("hr.monia.cmp.oyeTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("hr.monia.cmp.oyeSub")}</p>
        <div className="mt-4 grid gap-2.5">
          {OIR.map((s) => {
            const ahoraOn = sonando === `ahora:${s.voz}`;
            const argosOn = sonando === `argos:${s.voz}`;
            return (
              <div
                key={s.voz}
                className="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-border/60 bg-background/40 px-4 py-3"
              >
                <span className="min-w-0 flex-1 text-sm text-foreground">{t(s.label)}</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => playAhora(s.voz)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${ahoraOn ? "border-muted-foreground/40 bg-muted text-foreground" : "border-border/60 bg-muted/40 text-muted-foreground hover:text-foreground"}`}
                  >
                    {ahoraOn ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    {t("hr.monia.cmp.playAhora")}
                  </button>
                  <button
                    type="button"
                    onClick={() => playArgos(s.voz)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold text-primary-foreground transition ${argosOn ? "bg-primary/80" : "bg-primary hover:bg-primary/90"}`}
                  >
                    {argosOn ? <Square className="h-3 w-3" /> : <Play className="h-3 w-3" />}
                    {t("hr.monia.cmp.playArgos")}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Page>
  );
}
