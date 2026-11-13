import { useEffect, useState } from "react";
import { useLanguage } from "@/hooks/useLanguage";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  SlidersHorizontal, Play, Square, Volume2, Users, Info, Shield,
  Check, X, ToggleLeft, ToggleRight, Eye,
} from "lucide-react";
import translations, { type TranslationKey } from "@/lib/i18n";
import { supabase } from "@/integrations/supabase/client";
import { anunciar } from "@/lib/anunciarVoz";
import { SITUACIONES_AVISO, type SituacionAviso } from "@/lib/coworkAvisos";

// Centro de control de Argos: el único lugar donde se ve y se oye todo. Argos
// tiene SU PROPIA lista granular (8 verdes «En el piso», 7 amarillas «Pronto»);
// debajo, en rojo, lo que manda el supervisor. Cada situación de Argos muestra
// CUÁNTAS VECES se aplicó hoy (de argos_alertas, dato real) y un botón que abre
// a QUIÉN y a qué hora. On/off por situación (visual). Pestaña Ajustes + ruta.

const dict = translations as unknown as Record<string, { es: string; en: string }>;
const fraseEs = (k: TranslationKey): string => dict[k]?.es ?? "";

const VOZ_ARGOS = "aYbngTsp5kp0sibI3Z0T";

// Las situaciones PROPIAS de Argos, granulares. `live` = ya funciona hoy. `tipo`
// = cómo se llama en argos_alertas (para contar). Sin `tipo` = aún sin registro.
const ARGOS_SITS: Array<{ slug: string; label: TranslationKey; voz: TranslationKey; live: boolean; tipo?: string }> = [
  { slug: "camara-apagada", label: "hr.monia.cmp.s.camara", voz: "hr.monia.cmp.voz.camara", live: true },
  { slug: "no-frente", label: "hr.monia.cmp.s.rostro", voz: "hr.monia.cmp.voz.rostro", live: true },
  { slug: "fuera-cuadro", label: "hr.monia.cmp.s.cuadro", voz: "hr.monia.cmp.voz.cuadro", live: true },
  { slug: "poca-luz", label: "hr.monia.cmp.s.luz", voz: "hr.monia.cmp.voz.luz", live: true },
  { slug: "sin-pantalla", label: "hr.monia.cmp.s.pantalla", voz: "hr.monia.cmp.voz.pantalla", live: true, tipo: "sin_pantalla" },
  { slug: "pasado-bano", label: "hr.monia.cmp.s.bano", voz: "hr.monia.cmp.voz.bano", live: true },
  { slug: "pasado-break", label: "hr.monia.cmp.s.break", voz: "hr.monia.cmp.voz.break", live: true },
  { slug: "pasado-almuerzo", label: "hr.monia.cmp.s.almuerzo", voz: "hr.monia.cmp.voz.almuerzo", live: true },
  { slug: "celular", label: "hr.monia.cmp.n.celular", voz: "hr.monia.cmp.voz.celular", live: false },
  { slug: "distraido", label: "hr.monia.cmp.n.distraido", voz: "hr.monia.cmp.voz.distraido", live: false },
  { slug: "fuera-de-lugar", label: "hr.monia.cmp.n.fuera", voz: "hr.monia.cmp.voz.fuera", live: false, tipo: "fuera_de_lugar" },
  { slug: "sin-senal", label: "hr.monia.cmp.n.senal", voz: "hr.monia.cmp.voz.senal", live: false, tipo: "sin_senal" },
  { slug: "tarde", label: "hr.monia.cmp.n.tarde", voz: "hr.monia.cmp.voz.tarde", live: false },
  { slug: "inactivo", label: "hr.monia.cmp.n.inactivo", voz: "hr.monia.cmp.voz.inactivo", live: false },
  { slug: "abusa-pausas", label: "hr.monia.cmp.n.pausas", voz: "hr.monia.cmp.voz.pausas", live: false, tipo: "pausa_de_mas" },
];

const SUP_GRUPOS = new Set(["respuesta", "ventas", "trato", "general"]);
const supList: SituacionAviso[] = SITUACIONES_AVISO.filter(
  (s) => SUP_GRUPOS.has(s.grupo) || s.slug === "foco-charla",
);

const liveN = ARGOS_SITS.filter((s) => s.live).length;

type Aplicacion = { nombre: string; hora: string };
type Conteo = Record<string, { total: number; gente: Aplicacion[] }>;

export function ArgosAjustesContenido() {
  const { t } = useLanguage();
  const [sonando, setSonando] = useState<string | null>(null);
  const [off, setOff] = useState<ReadonlySet<string>>(new Set());
  const [conteo, setConteo] = useState<Conteo | null>(null);
  const [verQuien, setVerQuien] = useState<{ sit: string; gente: Aplicacion[] } | null>(null);

  // El chequeo de hoy: cuántas veces se aplicó cada situación y a quién (de
  // argos_alertas, lo que de verdad se registra). Como dueño, la RLS lo permite.
  useEffect(() => {
    let vivo = true;
    void (async () => {
      try {
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        const { data: alertas } = await supabase
          .from("argos_alertas")
          .select("tipo, user_id, abierta_at")
          .gte("abierta_at", hoy.toISOString());
        const filas = (alertas ?? []) as Array<{ tipo: string; user_id: string; abierta_at: string }>;
        const ids = [...new Set(filas.map((a) => a.user_id))];
        const nombre = new Map<string, string>();
        if (ids.length) {
          const { data: profs } = await supabase.from("profiles").select("id, full_name").in("id", ids);
          for (const p of (profs ?? []) as Array<{ id: string; full_name: string | null }>) {
            nombre.set(p.id, p.full_name ?? "—");
          }
        }
        const map: Conteo = {};
        for (const a of filas) {
          if (!map[a.tipo]) map[a.tipo] = { total: 0, gente: [] };
          map[a.tipo].total++;
          map[a.tipo].gente.push({
            nombre: nombre.get(a.user_id) ?? "—",
            hora: new Date(a.abierta_at).toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" }),
          });
        }
        if (vivo) setConteo(map);
      } catch {
        if (vivo) setConteo({});
      }
    })();
    return () => { vivo = false; };
  }, []);

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
        <div className="vidrio p-4">
          <p className="text-xs font-semibold text-muted-foreground">{t("hr.argoscentro.estado")}</p>
          <p className="mt-1 font-display text-lg font-semibold text-foreground">{t("hr.argoscentro.estadoVoz")}</p>
        </div>
        <div className="vidrio p-4">
          <p className="text-xs font-semibold text-muted-foreground">{t("hr.argoscentro.estado")}</p>
          <p className="mt-1 flex items-center gap-2 font-display text-lg font-semibold text-foreground"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" aria-hidden />{t("hr.argoscentro.estadoLive", { n: liveN })}</p>
        </div>
        <div className="vidrio p-4">
          <p className="text-xs font-semibold text-muted-foreground">{t("hr.argoscentro.estado")}</p>
          <p className="mt-1 flex items-center gap-2 font-display text-base font-bold text-foreground"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warning" aria-hidden />{t("hr.argoscentro.estadoBeta")}</p>
        </div>
      </div>

      {/* La voz. */}
      <div className="vidrio p-5 sm:p-6">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold tracking-tight">
          <Volume2 className="h-5 w-5 text-foreground/75" />
          {t("hr.argoscentro.vozTitle")}
        </h2>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-2xl border border-border/60 bg-foreground/[0.03] px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground">{t("hr.argoscentro.vozJavi")}</p>
            <span className="mt-1 inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-foreground/[0.04] px-2.5 py-0.5 text-xs font-medium text-foreground/85">
              <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />{t("hr.argoscentro.vozActiva")}
            </span>
          </div>
          <Btn id="voz" texto={vozPrueba} grande />
        </div>
        <p className="mt-3 flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {t("hr.argoscentro.vozRetiradas")}
        </p>
      </div>

      {/* El catálogo: lista de Argos (con chequeo de hoy) + lista del supervisor. */}
      <div className="vidrio p-5 sm:p-6">
        <h2 className="font-display text-lg font-semibold tracking-tight">{t("hr.argoscentro.catTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("hr.argoscentro.catSub")}</p>

        {/* ✓ Lo que hace Argos (su lista granular, con el chequeo de hoy). */}
        <h3 className="mb-2.5 mt-5 flex items-center gap-2 font-display text-sm font-bold text-foreground">
          <Check className="h-4 w-4 text-muted-foreground" />
          {t("hr.argoscentro.secArgos")} ({ARGOS_SITS.length})
        </h3>
        <div className="grid gap-2">
          {ARGOS_SITS.map((s, i) => {
            const encendida = !off.has(s.slug);
            const datos = s.tipo && conteo ? conteo[s.tipo] : undefined;
            return (
              <div
                key={s.slug}
                className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] border border-border/50 bg-card/30 px-4 py-3 ${encendida ? "" : "opacity-55"}`}
              >
                <span className="w-6 shrink-0 self-start pt-0.5 text-sm font-semibold text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{t(s.label)}</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">&ldquo;{fraseEs(s.voz)}&rdquo;</p>
                </div>

                {/* Chequeo de hoy: cuántas veces + a quién. */}
                {s.tipo ? (
                  conteo === null ? null : (
                    <div className="flex shrink-0 items-center gap-2 self-start">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold tabular-nums ${datos?.total ? "border border-border/60 bg-foreground/[0.04] text-foreground" : "bg-muted text-muted-foreground"}`}>
                        {t("hr.argoscentro.vecesHoy", { n: datos?.total ?? 0 })}
                      </span>
                      <button
                        type="button"
                        onClick={() => setVerQuien({ sit: t(s.label), gente: datos?.gente ?? [] })}
                        className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-muted/40 px-2.5 py-1 text-xs font-semibold text-muted-foreground transition hover:text-foreground"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        {t("hr.argoscentro.verQuien")}
                      </button>
                    </div>
                  )
                ) : (
                  <span className="shrink-0 self-start rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    {t("hr.argoscentro.sinRegistro")}
                  </span>
                )}

                <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-border/60 bg-foreground/[0.04] px-2.5 py-0.5 text-xs font-medium text-foreground/85">
                  <span className={`h-1.5 w-1.5 rounded-full ${s.live ? "bg-success" : "bg-warning"}`} aria-hidden />
                  {s.live ? t("hr.argoscentro.enPiso") : t("hr.argoscentro.pronto")}
                </span>
                <button
                  type="button"
                  onClick={() => alternar(s.slug)}
                  className={`shrink-0 self-start transition ${encendida ? "text-foreground" : "text-muted-foreground/60"}`}
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

        {/* ✗ Lo que manda el supervisor. */}
        <h3 className="mb-2.5 mt-6 flex items-center gap-2 font-display text-sm font-bold text-foreground">
          <X className="h-4 w-4 text-muted-foreground" />
          {t("hr.argoscentro.secSup")} ({supList.length})
        </h3>
        <div className="grid gap-2">
          {supList.map((s, i) => (
            <div
              key={s.slug}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-[12px] border border-border/50 bg-card/30 px-4 py-3"
            >
              <span className="w-6 shrink-0 self-start pt-0.5 text-sm font-semibold text-muted-foreground">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground">{t(s.etiqueta)}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">&ldquo;{s.vozEs}&rdquo;</p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-full border border-border/60 bg-foreground/[0.04] px-2.5 py-0.5 text-xs font-medium text-foreground/85">
                <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground" aria-hidden />
                {t("hr.argoscentro.tagManual")}
              </span>
              <Btn id={s.slug} texto={s.vozEs} />
            </div>
          ))}
        </div>
      </div>

      {/* La mezcla + regla anti-falsos. */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="vidrio p-5">
          <h3 className="flex items-center gap-2 font-display text-base font-bold">
            <Users className="h-4 w-4 text-muted-foreground" />
            {t("hr.argoscentro.mezclaTitle")}
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">{t("hr.argoscentro.mezclaDesc")}</p>
        </div>
        <div className="vidrio p-5">
          <h3 className="flex items-center gap-2 font-display text-base font-bold">
            <Shield className="h-4 w-4 text-muted-foreground" />
            {t("hr.argoscentro.antifalsos")}
          </h3>
        </div>
      </div>

      {/* Pop-up: a quién le aplicó hoy esta situación. */}
      <Dialog open={!!verQuien} onOpenChange={(o) => { if (!o) setVerQuien(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("hr.argoscentro.quienTitle")}</DialogTitle>
          </DialogHeader>
          {verQuien && (
            <div>
              <p className="mb-3 text-sm font-semibold text-foreground">{verQuien.sit}</p>
              {verQuien.gente.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("hr.argoscentro.nadieHoy")}</p>
              ) : (
                <div className="grid max-h-80 gap-1.5 overflow-y-auto">
                  {verQuien.gente.map((g, i) => (
                    <div key={i} className="flex items-center justify-between rounded-[10px] border border-border/50 bg-card/30 px-3 py-2 text-sm">
                      <span className="min-w-0 truncate text-foreground">{g.nombre}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{g.hora}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
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
