import { useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { SlidersHorizontal, Play, Square, Volume2, Users, Info, Shield } from "lucide-react";
import translations, { type TranslationKey } from "@/lib/i18n";
import { anunciar } from "@/lib/anunciarVoz";

// Centro de control de Argos: el único lugar donde se ve y se oye todo — la voz
// (Javi, con las viejas retiradas), las 15 situaciones (▶ en la voz de Argos) y
// la mezcla. Se usa como la pestaña "Ajustes" de Argos (ArgosAjustesContenido) y
// también como página propia (/hr/argos-ajustes). Editar/persistir llega después.

const dict = translations as unknown as Record<string, { es: string; en: string }>;
const fraseEs = (k: TranslationKey): string => dict[k]?.es ?? "";

// La voz que se está probando para Argos: Javi Rojas (España).
const VOZ_ARGOS = "aYbngTsp5kp0sibI3Z0T";

// Las 15 situaciones: etiqueta + frase hablada. Las 8 que ya existían y las 7 nuevas.
const SITUACIONES: Array<{ label: TranslationKey; voz: TranslationKey }> = [
  { label: "hr.monia.cmp.s.camara", voz: "hr.monia.cmp.voz.camara" },
  { label: "hr.monia.cmp.s.rostro", voz: "hr.monia.cmp.voz.rostro" },
  { label: "hr.monia.cmp.s.cuadro", voz: "hr.monia.cmp.voz.cuadro" },
  { label: "hr.monia.cmp.s.luz", voz: "hr.monia.cmp.voz.luz" },
  { label: "hr.monia.cmp.s.pantalla", voz: "hr.monia.cmp.voz.pantalla" },
  { label: "hr.monia.cmp.s.bano", voz: "hr.monia.cmp.voz.bano" },
  { label: "hr.monia.cmp.s.break", voz: "hr.monia.cmp.voz.break" },
  { label: "hr.monia.cmp.s.almuerzo", voz: "hr.monia.cmp.voz.almuerzo" },
  { label: "hr.monia.cmp.n.celular", voz: "hr.monia.cmp.voz.celular" },
  { label: "hr.monia.cmp.n.distraido", voz: "hr.monia.cmp.voz.distraido" },
  { label: "hr.monia.cmp.n.fuera", voz: "hr.monia.cmp.voz.fuera" },
  { label: "hr.monia.cmp.n.senal", voz: "hr.monia.cmp.voz.senal" },
  { label: "hr.monia.cmp.n.tarde", voz: "hr.monia.cmp.voz.tarde" },
  { label: "hr.monia.cmp.n.inactivo", voz: "hr.monia.cmp.voz.inactivo" },
  { label: "hr.monia.cmp.n.pausas", voz: "hr.monia.cmp.voz.pausas" },
];

// El contenido del centro de control, sin el armazón de página: se incrusta en
// la pestaña "Ajustes" de Argos (HRMonitorIA) y en la página propia.
export function ArgosAjustesContenido() {
  const { t } = useLanguage();
  const [sonando, setSonando] = useState<string | null>(null);

  async function tocar(id: string, voz: TranslationKey) {
    if (sonando === id) { setSonando(null); return; }
    setSonando(id);
    try { await anunciar(fraseEs(voz), { voiceId: VOZ_ARGOS }); } catch { /* cae solo */ }
    setSonando((s) => (s === id ? null : s));
  }

  const Btn = ({ id, voz, grande }: { id: string; voz: TranslationKey; grande?: boolean }) => {
    const on = sonando === id;
    const tam = grande ? "h-10 px-4 text-sm" : "h-9 w-9";
    return (
      <button
        type="button"
        onClick={() => tocar(id, voz)}
        className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-primary font-semibold text-primary-foreground transition hover:bg-primary/90 ${tam} ${on ? "bg-primary/80" : ""}`}
      >
        {on ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        {grande ? t("hr.argoscentro.vozProbar") : null}
      </button>
    );
  };

  return (
    <div className="grid gap-4">
      {/* Estado, de un vistazo. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground">{t("hr.argoscentro.estado")}</p>
          <p className="mt-1 font-display text-lg font-bold text-primary">{t("hr.argoscentro.estadoVoz")}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground">{t("hr.argoscentro.estado")}</p>
          <p className="mt-1 font-display text-lg font-bold text-success">{t("hr.argoscentro.estadoSit")}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-card p-4">
          <p className="text-xs font-semibold text-muted-foreground">{t("hr.argoscentro.estado")}</p>
          <p className="mt-1 font-display text-base font-bold text-warning">{t("hr.argoscentro.estadoBeta")}</p>
        </div>
      </div>

      {/* La voz. */}
      <div className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold tracking-tight">
          <Volume2 className="h-5 w-5 text-primary" />
          {t("hr.argoscentro.vozTitle")}
        </h2>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-primary/40 bg-primary/5 px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{t("hr.argoscentro.vozJavi")}</p>
            <span className="mt-1 inline-block rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
              {t("hr.argoscentro.vozActiva")}
            </span>
          </div>
          <Btn id="voz" voz="hr.monia.cmp.voz.camara" grande />
        </div>
        <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("hr.argoscentro.vozRetiradas")}
        </p>
      </div>

      {/* Las 15 situaciones. */}
      <div className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold tracking-tight">{t("hr.argoscentro.sitTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("hr.argoscentro.sitSub")}</p>
        <div className="mt-4 grid gap-2.5">
          {SITUACIONES.map((s, i) => (
            <div
              key={s.voz}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border/60 bg-background/40 px-4 py-3"
            >
              <span className="w-6 shrink-0 text-sm font-semibold text-muted-foreground">{i + 1}</span>
              <span className="min-w-0 flex-1 text-sm text-foreground">{t(s.label)}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2.5 py-0.5 text-xs font-semibold text-success">
                {t("hr.argoscentro.sitActiva")}
              </span>
              <Btn id={`s${i}`} voz={s.voz} />
            </div>
          ))}
        </div>
        <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
          <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("hr.argoscentro.editarPronto")}
        </p>
      </div>

      {/* La mezcla + regla anti-falsos. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-muted/20 p-5">
          <h3 className="flex items-center gap-2 font-display text-base font-bold">
            <Users className="h-4 w-4 text-primary" />
            {t("hr.argoscentro.mezclaTitle")}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">{t("hr.argoscentro.mezclaDesc")}</p>
        </div>
        <div className="rounded-2xl border border-border/60 bg-muted/20 p-5">
          <h3 className="flex items-center gap-2 font-display text-base font-bold">
            <Shield className="h-4 w-4 text-success" />
            {t("hr.argoscentro.antifalsos")}
          </h3>
        </div>
      </div>
    </div>
  );
}

export default function ArgosAjustes() {
  const { t } = useLanguage();
  return (
    <Page>
      <PageHeader
        title={t("hr.argoscentro.title")}
        subtitle={t("hr.argoscentro.subtitle")}
        icon={<SlidersHorizontal className="h-5 w-5" />}
      />
      <div className="mt-5">
        <ArgosAjustesContenido />
      </div>
    </Page>
  );
}
