import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNowStrict } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import { Activity, AlertTriangle, CheckCircle2, ChevronRight, Loader2, ShieldAlert, Users } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { UserAvatar } from "@/components/UserAvatar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { usePulsoEquipo } from "@/hooks/usePulsoEquipo";
import type { EstadoVivo } from "@/hooks/useRondinVivo";
import type { CajaEquipo, PersonaPulso } from "@/lib/pulsoEquipo";
import type { TranslationKey } from "@/lib/i18n";

// EL PULSO DEL EQUIPO EN VIVO (Centro de operaciones · Alvaro, 05/11). Solo para
// quien vigila (supervisor+): arriba, CONECTADOS AHORA y la NOTA VIVA; quién la
// está bajando; y las cajas por equipo con cada persona en tiempo real. Clic en
// una caja → pop-up con los NOMBRES (quién está detrás de cada letra) y su estado.
// Se refresca solo cada 15 s.

type Tr = (k: TranslationKey, v?: Record<string, string | number>) => string;

// Color por estado en vivo (semáforo): verde trabajando, ámbar pausa, rojo
// problema, gris offline. Sin morado en fondos (atmósfera neutra fría del sistema).
const ESTADO_UI: Record<EstadoVivo, { punto: string; anillo: string; texto: string }> = {
  trabajando:     { punto: "bg-success",     anillo: "ring-success/40",     texto: "text-success" },
  presente:       { punto: "bg-success/70",  anillo: "ring-success/30",     texto: "text-success" },
  pausa:          { punto: "bg-warning",     anillo: "ring-warning/40",     texto: "text-warning" },
  celular:        { punto: "bg-destructive", anillo: "ring-destructive/50", texto: "text-destructive" },
  distraido:      { punto: "bg-destructive", anillo: "ring-destructive/50", texto: "text-destructive" },
  no_mira:        { punto: "bg-destructive", anillo: "ring-destructive/50", texto: "text-destructive" },
  camara_apagada: { punto: "bg-destructive", anillo: "ring-destructive/50", texto: "text-destructive" },
  se_fue:         { punto: "bg-destructive", anillo: "ring-destructive/50", texto: "text-destructive" },
  ausente:        { punto: "bg-muted-foreground/30", anillo: "ring-transparent", texto: "text-muted-foreground" },
};
const ESTADO_LBL: Record<EstadoVivo, TranslationKey> = {
  trabajando: "dashboard.pulso.estado.trabajando", presente: "dashboard.pulso.estado.presente",
  pausa: "dashboard.pulso.estado.pausa", celular: "dashboard.pulso.estado.celular",
  distraido: "dashboard.pulso.estado.distraido", no_mira: "dashboard.pulso.estado.no_mira",
  camara_apagada: "dashboard.pulso.estado.camara_apagada", se_fue: "dashboard.pulso.estado.se_fue",
  ausente: "dashboard.pulso.estado.ausente",
};

function tono(nota: number | null): { texto: string; borde: string; glow: string } {
  if (nota == null) return { texto: "text-muted-foreground", borde: "border-border/40", glow: "" };
  if (nota >= 80) return { texto: "text-success", borde: "border-success/30", glow: "glow-g" };
  if (nota >= 60) return { texto: "text-warning", borde: "border-warning/30", glow: "glow-a" };
  return { texto: "text-destructive", borde: "border-destructive/30", glow: "glow-r" };
}

function hace(iso: string | null, lang: string): string | null {
  if (!iso) return null;
  try {
    return formatDistanceToNowStrict(new Date(iso), { addSuffix: false, locale: lang === "es" ? esLocale : undefined });
  } catch { return null; }
}

/** Una persona como fila: avatar, nombre, estado en vivo y "hace X". Clic → expediente. */
function FilaPersona({ p, t, lang, onAbrir, problema }: { p: PersonaPulso; t: Tr; lang: string; onAbrir: () => void; problema?: boolean }) {
  const ui = ESTADO_UI[p.estado];
  const desde = hace(p.desde, lang);
  return (
    <button type="button" onClick={onAbrir}
      className={`group flex items-center gap-2.5 rounded-panel border px-2.5 py-1.5 text-left transition ${
        problema ? "border-destructive/20 bg-destructive/5 hover:border-destructive/40 hover:bg-destructive/10"
                 : "border-border/40 bg-card/30 hover:border-primary/30 hover:bg-card/50"
      }`}>
      <span className="relative shrink-0">
        <UserAvatar name={p.nombre || "·"} src={p.avatarUrl} seed={p.avatarSeed} size="sm" />
        <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background ${ui.punto}`} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold leading-tight">{p.nombre || "—"}</span>
        <span className={`block text-[11px] font-medium leading-tight ${ui.texto}`}>
          {t(ESTADO_LBL[p.estado])}{desde && <span className="font-normal text-muted-foreground"> · {desde}</span>}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition group-hover:translate-x-0.5 group-hover:text-foreground" />
    </button>
  );
}

/** Una caja de equipo (clic → pop-up con los nombres): conectados/total, su nota
 *  viva y cada persona como ficha (letra) coloreada por su estado en vivo. */
function Caja({ caja, t, onVer }: { caja: CajaEquipo; t: Tr; onVer: () => void }) {
  const tn = tono(caja.nota);
  return (
    <button type="button" onClick={onVer}
      className={`flex flex-col gap-2.5 rounded-panel border ${tn.borde} bg-white/50 dark:bg-white/[0.04] p-3 text-left transition hover:border-primary/40 hover:bg-white/70 dark:hover:bg-white/[0.07]`}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-sm font-semibold">{caja.equipo}</span>
        <span className="flex shrink-0 items-center gap-2">
          <span className="text-[11px] font-medium text-muted-foreground tabular-nums">
            {t("dashboard.pulso.conectadosCaja", { conectados: caja.conectados, total: caja.total })}
          </span>
          <span className={`font-display text-base font-bold tabular-nums ${tn.texto}`}>{caja.nota ?? "—"}</span>
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {caja.miembros.map((m) => {
          const ui = ESTADO_UI[m.estado];
          const letra = (m.nombre || "·").trim().charAt(0).toUpperCase() || "·";
          return (
            <span key={m.userId} title={`${m.nombre || "—"} · ${t(ESTADO_LBL[m.estado])}`}
              className={`relative flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold ${
                m.conectado ? "bg-card text-foreground ring-2" : "bg-muted/40 text-muted-foreground/60 ring-1"
              } ${ui.anillo}`}>
              {letra}
              <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background ${ui.punto} ${m.problema ? "animate-pulse" : ""}`} />
            </span>
          );
        })}
      </div>
      <span className="flex items-center gap-1 text-[11px] font-medium text-primary/80">
        <Users className="h-3 w-3" />{t("dashboard.pulso.verQuienes")}
      </span>
    </button>
  );
}

/** Un número grande con su etiqueta (Conectados ahora / Nota viva). */
function Tile({ valor, etiqueta, tono: tn, children }: { valor: ReactNode; etiqueta: string; tono?: string; children?: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-panel border border-border/40 bg-card/30 p-4">
      <div className={`font-display text-5xl font-bold leading-none tabular-nums ${tn ?? "text-foreground"}`}>{valor}</div>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-muted-foreground">{etiqueta}</div>
        {children}
      </div>
    </div>
  );
}

export default function PulsoEquipoVivo() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const { puedeVer, pulso, cargando, error, ultimaRonda } = usePulsoEquipo();
  const [equipoAbierto, setEquipoAbierto] = useState<string | null>(null);

  const ultima = useMemo(() => (ultimaRonda ? hace(ultimaRonda.toISOString(), language) : null), [ultimaRonda, language]);
  const abrir = (id: string) => navigate(`/hr/expediente/${id}`);
  // La caja abierta se re-deriva en cada refresco (los estados cambian en vivo).
  const cajaAbierta = equipoAbierto ? pulso?.cajas.find((c) => c.equipo === equipoAbierto) ?? null : null;

  if (!puedeVer) return null;

  const tn = tono(pulso?.notaViva ?? null);

  return (
    <section className={`vidrio vidrio-glow sube ${tn.glow} p-4`} style={{ animationDelay: "0.04s" }}>
      <div className="v-cont space-y-4">
        {/* Cabecera */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-panel bg-primary/10 text-primary"><Activity className="h-4 w-4" /></span>
            {t("dashboard.pulso.titulo")}
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-success">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
              </span>
              {t("dashboard.pulso.enVivo")}
            </span>
          </h2>
          <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5" />{t("dashboard.pulso.soloVigilancia")}
          </span>
        </div>

        {error ? (
          <p className="text-sm text-muted-foreground">—</p>
        ) : cargando && !pulso ? (
          <div className="flex items-center gap-2 py-6 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : !pulso || pulso.total === 0 ? (
          <p className="py-4 text-sm text-muted-foreground">{t("dashboard.pulso.sinEquipo")}</p>
        ) : (
          <>
            {/* Arriba del todo: CONECTADOS AHORA + NOTA VIVA, en grande. */}
            <div className="grid gap-3 lg:grid-cols-[auto_auto_1fr]">
              <Tile valor={pulso.conectados} etiqueta={t("dashboard.pulso.conectadosAhora")} tono="text-success">
                <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">{t("dashboard.pulso.deTotal", { total: pulso.total })}</div>
              </Tile>
              <Tile valor={pulso.notaViva ?? "—"} etiqueta={t("dashboard.pulso.notaViva")} tono={tn.texto}>
                <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {pulso.conectados === 0
                    ? t("dashboard.pulso.sinConectados")
                    : t("dashboard.pulso.trabajandoProblema", { trabajando: pulso.trabajando, problema: pulso.conProblema })}
                </div>
                {ultima && <div className="mt-0.5 text-[10px] text-muted-foreground/70">{t("dashboard.pulso.ultimaRonda", { hace: ultima })}</div>}
              </Tile>

              {/* Quién la baja */}
              <div className="min-w-0">
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  {pulso.conProblema > 0 ? <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> : <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
                  {t("dashboard.pulso.quienLaBaja")}
                </div>
                {pulso.conProblema === 0 ? (
                  <p className="rounded-panel border border-success/20 bg-success/5 px-3 py-2.5 text-sm font-medium text-success">{t("dashboard.pulso.todoEnOrden")}</p>
                ) : (
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {pulso.quienLaBaja.slice(0, 6).map((p) => (
                      <FilaPersona key={p.userId} p={p} t={t} lang={language} problema onAbrir={() => abrir(p.userId)} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Cajas por equipo (clic → nombres) */}
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {pulso.cajas.map((caja) => (
                <Caja key={caja.equipo} caja={caja} t={t} onVer={() => setEquipoAbierto(caja.equipo)} />
              ))}
            </div>
          </>
        )}
      </div>

      {/* Pop-up: QUIÉNES están detrás de la caja (nombres + estado). */}
      <Dialog open={!!cajaAbierta} onOpenChange={(o) => { if (!o) setEquipoAbierto(null); }}>
        <DialogContent className="max-w-md">
          {cajaAbierta && (
            <>
              <DialogTitle className="flex items-center justify-between gap-2 pr-6">
                <span>{cajaAbierta.equipo}</span>
                <span className="text-xs font-normal text-muted-foreground tabular-nums">
                  {t("dashboard.pulso.conectadosCaja", { conectados: cajaAbierta.conectados, total: cajaAbierta.total })}
                </span>
              </DialogTitle>
              <div className="mt-2 flex max-h-[60vh] flex-col gap-1.5 overflow-y-auto pr-1">
                {cajaAbierta.miembros.map((m) => (
                  <FilaPersona key={m.userId} p={m} t={t} lang={language} problema={m.problema} onAbrir={() => { setEquipoAbierto(null); abrir(m.userId); }} />
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
