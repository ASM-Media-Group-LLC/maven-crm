import { useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { SlidersHorizontal, Play, Square, Volume2, Users, Info, Shield, Check, X } from "lucide-react";
import { anunciar } from "@/lib/anunciarVoz";
import { SITUACIONES_AVISO, GRUPOS_AVISO, type SituacionAviso } from "@/lib/coworkAvisos";

// Centro de control de Argos: el único lugar donde se ve y se oye todo. El
// catálogo es EL MISMO que el del botón Avisar (lib/coworkAvisos): Argos lo
// absorbe entero. Cada situación va marcada como «Argos solo» (la detecta y la
// dice sin que nadie apriete) o «Supervisor» (la sigue mandando con el botón).
// Se usa como la pestaña "Ajustes" de Argos (ArgosAjustesContenido) y como
// página propia (/hr/argos-ajustes). Editar/persistir llega después.

// La voz que se está probando para Argos: Javi Rojas (España).
const VOZ_ARGOS = "aYbngTsp5kp0sibI3Z0T";

// Lo que Argos puede VER y por tanto dispara solo (cámara, pantalla, pausa y el
// foco que se ve en cámara/pantalla). Lo demás —ventas, trato, tiempo de
// respuesta, charla— requiere leer el chat y lo sigue mandando el supervisor
// (decisión de Alvaro: Argos no lee los chats).
const AUTO: ReadonlySet<string> = new Set([
  "camara-encender", "camara-encuadre", "pantalla-compartir", "pantalla-ajena",
  "pausa-volver", "pausa-avisar",
  "foco-distraccion", "foco-celular", "foco-pestanas", "foco-inactivo",
]);

export function ArgosAjustesContenido() {
  const { t } = useLanguage();
  const [sonando, setSonando] = useState<string | null>(null);

  async function tocar(id: string, texto: string) {
    if (sonando === id) { setSonando(null); return; }
    setSonando(id);
    try { await anunciar(texto, { voiceId: VOZ_ARGOS }); } catch { /* cae solo */ }
    setSonando((s) => (s === id ? null : s));
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

  const porGrupo = (g: string): SituacionAviso[] => SITUACIONES_AVISO.filter((s) => s.grupo === g);
  const total = SITUACIONES_AVISO.length;
  const vozPrueba = SITUACIONES_AVISO.find((s) => s.slug === "camara-encender")?.vozEs ?? "";

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
          <p className="mt-1 font-display text-lg font-bold text-success">{t("hr.argoscentro.estadoSitN", { n: total })}</p>
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

      {/* El catálogo: los 7 grupos del botón Avisar, ahora de Argos. */}
      <div className="rounded-2xl border border-border/60 bg-card p-5 sm:p-6">
        <h2 className="font-display text-lg font-bold tracking-tight">{t("hr.argoscentro.catTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("hr.argoscentro.catSub")}</p>

        <div className="mt-5 grid gap-5">
          {GRUPOS_AVISO.map((g) => (
            <div key={g.grupo}>
              <h3 className="mb-2.5 text-xs font-semibold text-muted-foreground">{t(g.titulo)}</h3>
              <div className="grid gap-2">
                {porGrupo(g.grupo).map((s) => {
                  const auto = AUTO.has(s.slug);
                  return (
                    <div
                      key={s.slug}
                      className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-border/60 bg-background/40 px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-foreground">{t(s.etiqueta)}</p>
                        <p className="mt-0.5 text-sm text-muted-foreground">&ldquo;{s.vozEs}&rdquo;</p>
                      </div>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ${auto ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}
                      >
                        {auto ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                        {auto ? t("hr.argoscentro.tagAuto") : t("hr.argoscentro.tagManual")}
                      </span>
                      <Btn id={s.slug} texto={s.vozEs} />
                    </div>
                  );
                })}
              </div>
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
