import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { CalendarCheck, Loader2, AlertTriangle, RefreshCw, ChevronRight, ScreenShare, Camera, Sparkles, TrendingDown, CheckCircle2 } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { UserAvatar } from "@/components/UserAvatar";
import { useResumenDia, type PersonaResumen, type BajonDia } from "@/hooks/useResumenDia";
import type { TranslationKey } from "@/lib/i18n";

// RESUMEN DEL DÍA (Argos): quién va mejor o peor HOY, en dos grupos —problema
// arriba, bien abajo— con la película del día: nota, barras de pantalla/cámara/
// atención y los bajones (momentos malos) con hora y duración. Así se distingue
// un bache puntual de ir mal todo el día. Clic → su expediente. Todo por t().

type Tr = (k: TranslationKey, v?: Record<string, string | number>) => string;

// El nombre legible de cada bajón.
const LBL_BAJON: Record<string, TranslationKey> = {
  sin_pantalla: "hr.sem.sinPantalla",
  camara_apagada: "hr.resumen.bajon.camara",
  camara_tapada: "hr.resumen.bajon.camara",
  fuera_de_lugar: "hr.sem.problema",
  se_fue: "hr.resumen.bajon.seFue",
  sin_senal: "hr.resumen.bajon.sinSenal",
  pausa_de_mas: "hr.resumen.bajon.pausa",
};

function horaDe(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
}

function Barra({ label, pct, icon: Icon }: { label: string; pct: number | null; icon: typeof ScreenShare }) {
  const v = pct ?? 0;
  const tono = pct == null ? "bg-muted-foreground/40" : v >= 80 ? "bg-success" : v >= 50 ? "bg-warning" : "bg-destructive";
  return (
    <div className="flex items-center gap-1.5" title={`${label}: ${pct == null ? "—" : `${v}%`}`}>
      <Icon className="h-3 w-3 shrink-0 text-muted-foreground" />
      <span className="h-1.5 w-10 overflow-hidden rounded-full bg-foreground/10">
        <span className={`block h-full rounded-full ${tono}`} style={{ width: `${v}%` }} />
      </span>
      <span className="w-7 shrink-0 text-[10px] tabular-nums text-muted-foreground">{pct == null ? "—" : `${v}%`}</span>
    </div>
  );
}

function Fila({ p, t, onClick }: { p: PersonaResumen; t: Tr; onClick: () => void }) {
  const nombre = p.nombre || t("hr.noName");
  const valor = p.nota.valor;
  const tono = valor == null ? "text-muted-foreground" : valor >= 80 ? "text-success" : valor >= 60 ? "text-warning" : "text-destructive";
  // La película en palabras: los bajones del día, de más largo a más corto.
  const bajonTxt = (b: BajonDia) => {
    const lbl = LBL_BAJON[b.tipo] ? t(LBL_BAJON[b.tipo]) : b.tipo;
    return `${lbl} · ${horaDe(b.desdeISO)} · ${t("hr.resumen.min", { n: b.minutos })}${b.abierto ? " ·" : ""}`;
  };
  return (
    <button
      type="button"
      onClick={onClick}
      title={t("hr.atencion.verExpediente")}
      className="group flex w-full items-start gap-3 rounded-2xl border border-border/40 bg-card/30 px-3 py-2.5 text-left transition-colors hover:bg-card/50 hover:border-primary/40"
    >
      <span className={`mt-0.5 font-display text-2xl font-bold leading-none tabular-nums ${tono}`}>{valor ?? "—"}</span>
      <UserAvatar name={nombre} src={p.avatarUrl} seed={p.avatarSeed} size="sm" />
      <div className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{nombre}</span>
        {/* Las barras de los tres factores que mandan */}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          <Barra label={t("hr.resumen.pantalla")} pct={p.pantallaPct} icon={ScreenShare} />
          <Barra label={t("hr.resumen.camara")} pct={p.camaraPct} icon={Camera} />
          <Barra label={t("hr.resumen.atencion")} pct={p.atencionPct} icon={Sparkles} />
        </div>
        {/* La película: los bajones del día */}
        {p.bajones.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {p.bajones.slice(0, 4).map((b, i) => (
              <span key={i} className={`inline-flex items-center gap-1 rounded-control border px-1.5 py-0.5 text-[10px] font-medium ${b.abierto ? "border-destructive/50 bg-destructive/10 text-destructive" : "border-warning/40 bg-warning/10 text-warning"}`}>
                <TrendingDown className="h-2.5 w-2.5" />{bajonTxt(b)}
              </span>
            ))}
            {p.bajones.length > 4 && <span className="text-[10px] text-muted-foreground">+{p.bajones.length - 4}</span>}
          </div>
        )}
      </div>
      <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
    </button>
  );
}

export function ResumenDiaPanel() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { personas, cargando, error, refrescar } = useResumenDia(new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" }));

  // Dos grupos: problema (nota < 60 o con bajón abierto) y bien (≥60). Sin nota → bien (aún sin datos).
  const { problema, bien } = useMemo(() => {
    const prob: PersonaResumen[] = [];
    const ok: PersonaResumen[] = [];
    for (const p of personas) {
      const malo = (p.nota.valor != null && p.nota.valor < 60) || p.bajones.some((b) => b.abierto);
      (malo ? prob : ok).push(p);
    }
    return { problema: prob, bien: ok };
  }, [personas]);

  const irA = (id: string) => navigate(`/hr/expediente/${id}`, { state: { volverA: "/hr/monitor-ia?t=resumen" } });

  return (
    <section className="vidrio sube p-4 lg:p-5">
      <div className="v-cont">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-panel bg-primary/10 text-primary">
            <CalendarCheck className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-bold leading-tight tracking-tight">{t("hr.resumen.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("hr.resumen.sub")}</p>
          </div>
          <button type="button" onClick={() => void refrescar()} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground" title={t("hr.pantallazos.reintentar")} aria-label={t("hr.pantallazos.reintentar")}>
            <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} />
          </button>
        </div>

        {error ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground"><AlertTriangle className="h-7 w-7 text-destructive/70" /><p className="text-sm">{t("hr.resumen.error")}</p></div>
        ) : cargando && personas.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : personas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground"><CalendarCheck className="h-7 w-7 opacity-40" /><p className="text-sm">{t("hr.resumen.vacio")}</p></div>
        ) : (
          <div className="flex flex-col gap-4">
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />{t("hr.resumen.grupoProblema", { n: problema.length })}
              </p>
              {problema.length > 0 ? (
                <div className="flex flex-col gap-2">{problema.map((p) => <Fila key={p.userId} p={p} t={t} onClick={() => irA(p.userId)} />)}</div>
              ) : (
                <div className="flex items-center gap-2 rounded-2xl border border-success/25 bg-success/5 px-3 py-2.5 text-sm font-medium text-success"><CheckCircle2 className="h-4 w-4 shrink-0" />{t("hr.resumen.sinProblema")}</div>
              )}
            </div>
            {bien.length > 0 && (
              <div>
                <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-success">
                  <CheckCircle2 className="h-3.5 w-3.5" />{t("hr.resumen.grupoBien", { n: bien.length })}
                </p>
                <div className="flex flex-col gap-2">{bien.map((p) => <Fila key={p.userId} p={p} t={t} onClick={() => irA(p.userId)} />)}</div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
