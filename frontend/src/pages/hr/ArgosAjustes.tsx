import { useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import {
  SlidersHorizontal, Play, Square, Volume2, Users, Info, Shield,
  Check, X, ToggleLeft, ToggleRight,
} from "lucide-react";
import translations, { type TranslationKey } from "@/lib/i18n";
import { anunciar } from "@/lib/anunciarVoz";
import { SITUACIONES_AVISO, type SituacionAviso } from "@/lib/coworkAvisos";

// Centro de control de Argos: el único lugar donde se ve y se oye todo.
//
// Argos tiene SU PROPIA lista (las situaciones que él detecta, en granular, no
// las del menú Avisar que las agrupaba): 8 verdes «En el piso» (ya funcionan en
// vivo hoy) + 7 amarillas «Pronto» (entran con el motor). Cada una con su
// interruptor on/off (de momento visual; guardar llega con la edición, candada a
// admin+dueño). Debajo, en rojo, lo que NO puede Argos y manda el supervisor con
// el botón Avisar (ventas, trato, tiempo de respuesta…). Pestaña Ajustes + ruta.

const dict = translations as unknown as Record<string, { es: string; en: string }>;
const fraseEs = (k: TranslationKey): string => dict[k]?.es ?? "";

const VOZ_ARGOS = "aYbngTsp5kp0sibI3Z0T";

// Las situaciones PROPIAS de Argos, granulares. `live` = ya funciona hoy en el
// piso (useFaceNudge / useScreenShareNudge / fin de pausa hablan solos).
const ARGOS_SITS: Array<{ slug: string; label: TranslationKey; voz: TranslationKey; live: boolean }> = [
  { slug: "camara-apagada", label: "hr.monia.cmp.s.camara", voz: "hr.monia.cmp.voz.camara", live: true },
  { slug: "no-frente", label: "hr.monia.cmp.s.rostro", voz: "hr.monia.cmp.voz.rostro", live: true },
  { slug: "fuera-cuadro", label: "hr.monia.cmp.s.cuadro", voz: "hr.monia.cmp.voz.cuadro", live: true },
  { slug: "poca-luz", label: "hr.monia.cmp.s.luz", voz: "hr.monia.cmp.voz.luz", live: true },
  { slug: "sin-pantalla", label: "hr.monia.cmp.s.pantalla", voz: "hr.monia.cmp.voz.pantalla", live: true },
  { slug: "pasado-bano", label: "hr.monia.cmp.s.bano", voz: "hr.monia.cmp.voz.bano", live: true },
  { slug: "pasado-break", label: "hr.monia.cmp.s.break", voz: "hr.monia.cmp.voz.break", live: true },
  { slug: "pasado-almuerzo", label: "hr.monia.cmp.s.almuerzo", voz: "hr.monia.cmp.voz.almuerzo", live: true },
  { slug: "celular", label: "hr.monia.cmp.n.celular", voz: "hr.monia.cmp.voz.celular", live: false },
  { slug: "distraido", label: "hr.monia.cmp.n.distraido", voz: "hr.monia.cmp.voz.distraido", live: false },
  { slug: "fuera-de-lugar", label: "hr.monia.cmp.n.fuera", voz: "hr.monia.cmp.voz.fuera", live: false },
  { slug: "sin-senal", label: "hr.monia.cmp.n.senal", voz: "hr.monia.cmp.voz.senal", live: false },
  { slug: "tarde", label: "hr.monia.cmp.n.tarde", voz: "hr.monia.cmp.voz.tarde", live: false },
  { slug: "inactivo", label: "hr.monia.cmp.n.inactivo", voz: "hr.monia.cmp.voz.inactivo", live: false },
  { slug: "abusa-pausas", label: "hr.monia.cmp.n.pausas", voz: "hr.monia.cmp.voz.pausas", live: false },
];

// Lo que manda el SUPERVISOR con el botón (del catálogo Avisar): lo que Argos no
// puede porque tendría que leer los chats — ventas, trato, tiempo de respuesta,
// charla y general.
const SUP_GRUPOS = new Set(["respuesta", "ventas", "trato", "general"]);
const supList: SituacionAviso[] = SITUACIONES_AVISO.filter(
  (s) => SUP_GRUPOS.has(s.grupo) || s.slug === "foco-charla",
);

const liveN = ARGOS_SITS.filter((s) => s.live).length;

export function ArgosAjustesContenido() {
  const { t } = useLanguage();
  const [sonando, setSonando] = useState<string | null>(null);
  const [off, setOff] = useState<ReadonlySet<string>>(new Set());

  async function tocar(id: string, texto: string) {
    if (sonando === id) { setSonando(null); return; }
    setSonando(id);
    try { await anunciar(texto, { voiceId: VOZ_ARGOS }); } catch { /* cae solo */ }
    setSonando((s) => (s === id ? null : s));
  }

  function alternar(slug: string) {
    setOff((prev) => {
      const n = new Set(prev);
      if (n.has(slug)) n.delete(slug); else n.add(slug);
      return n;
    });
  }

  const Btn = ({ id, texto, grande }: { id: string; texto: string; grande?: boolean }) => {
    const on = sonando === id;
    const tam = grande ? "h-10 px-4 text-sm" : "h-9 w-9";
    return (
      <button
        type="button"
        onClick={() => tocar(id, texto)}
        className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-primary font-semibold text-primary-foreground transition hover:bg-primary/90 ${tam} ${on ? "bg-primary/80" : ""}`}
      >
        {on ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        {grande ? t("hr.argoscentro.vozProbar") : null}
      </button>
    );
  };

  const vozPrueba = fraseEs("hr.monia.cmp.voz.camara");

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
          <p className="mt-1 font-display text-lg font-bold text-success">{t("hr.argoscentro.estadoLive", { n: liveN })}</p>
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
          <Btn id="voz" texto={vozPrueba} grande />
        </div>
        <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("hr.argoscentro.vozRetiradas")}
        </p>
      </div>

      {/* El catálogo: lista de Argos + lista del supervisor. */}
      <div className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold tracking-tight">{t("hr.argoscentro.catTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("hr.argoscentro.catSub")}</p>

        {/* ✓ Lo que hace Argos (su lista granular). */}
        <h3 className="mb-2.5 mt-5 flex items-center gap-2 font-display text-sm font-bold text-success">
          <Check className="h-4 w-4" />
          {t("hr.argoscentro.secArgos")} ({ARGOS_SITS.length})
        </h3>
        <div className="grid gap-2">
          {ARGOS_SITS.map((s, i) => {
            const encendida = !off.has(s.slug);
            return (
              <div
                key={s.slug}
                className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border/60 bg-background/40 px-4 py-3 ${encendida ? "" : "opacity-55"}`}
              >
                <span className="w-6 shrink-0 self-start pt-0.5 text-sm font-semibold text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{t(s.label)}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">&ldquo;{fraseEs(s.voz)}&rdquo;</p>
                </div>
                <span
                  className={`inline-flex shrink-0 items-center gap-1.5 self-start rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.live ? "bg-success/15 text-success" : "bg-warning/15 text-warning"}`}
                >
                  {s.live ? <Check className="h-3.5 w-3.5" /> : <Info className="h-3.5 w-3.5" />}
                  {s.live ? t("hr.argoscentro.enPiso") : t("hr.argoscentro.pronto")}
                </span>
                <button
                  type="button"
                  onClick={() => alternar(s.slug)}
                  className={`shrink-0 self-start transition ${encendida ? "text-primary" : "text-muted-foreground"}`}
                  aria-label={s.slug}
                >
                  {encendida ? <ToggleRight className="h-6 w-6" /> : <ToggleLeft className="h-6 w-6" />}
                </button>
                <Btn id={s.slug} texto={fraseEs(s.voz)} />
              </div>
            );
          })}
        </div>
        <p className="mt-2.5 flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("hr.argoscentro.onoffNota")}
        </p>

        {/* ✗ Lo que manda el supervisor (del botón Avisar). */}
        <h3 className="mb-2.5 mt-6 flex items-center gap-2 font-display text-sm font-bold text-destructive">
          <X className="h-4 w-4" />
          {t("hr.argoscentro.secSup")} ({supList.length})
        </h3>
        <div className="grid gap-2">
          {supList.map((s, i) => (
            <div
              key={s.slug}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border/60 bg-background/40 px-4 py-3"
            >
              <span className="w-6 shrink-0 self-start pt-0.5 text-sm font-semibold text-muted-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{t(s.etiqueta)}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">&ldquo;{s.vozEs}&rdquo;</p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full bg-destructive/15 px-2.5 py-0.5 text-xs font-semibold text-destructive">
                <X className="h-3.5 w-3.5" />
                {t("hr.argoscentro.tagManual")}
              </span>
              <Btn id={s.slug} texto={s.vozEs} />
            </div>
          ))}
        </div>
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
