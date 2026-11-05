import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNowStrict } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import { Activity, AlertTriangle, CheckCircle2, ChevronRight, Loader2, ShieldAlert } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { UserAvatar } from "@/components/UserAvatar";
import { usePulsoEquipo } from "@/hooks/usePulsoEquipo";
import type { EstadoVivo } from "@/hooks/useRondinVivo";
import type { CajaEquipo, PersonaPulso } from "@/lib/pulsoEquipo";
import type { TranslationKey } from "@/lib/i18n";

// EL PULSO DEL EQUIPO EN VIVO (Centro de operaciones · Alvaro, 05/11). Arriba del
// todo, solo para quien vigila (supervisor+): la NOTA VIVA del equipo, quién la
// está bajando ahora, y las cajas por equipo con cada persona en tiempo real
// (conectado/en pausa/con problema/offline). Se refresca solo cada 15 s.

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

/** Una persona en la lista de "quién la baja": clic abre su expediente. */
function FilaProblema({ p, t, lang, onAbrir }: { p: PersonaPulso; t: Tr; lang: string; onAbrir: () => void }) {
  const ui = ESTADO_UI[p.estado];
  const desde = hace(p.desde, lang);
  return (
    <button type="button" onClick={onAbrir}
      className="group flex items-center gap-2.5 rounded-panel border border-destructive/20 bg-destructive/5 px-2.5 py-1.5 text-left transition hover:border-destructive/40 hover:bg-destructive/10">
      <UserAvatar name={p.nombre || "·"} src={p.avatarUrl} seed={p.avatarSeed} size="sm" />
      <span className="min-w-0">
        <span className="block truncate text-sm font-semibold leading-tight">{p.nombre || "—"}</span>
        <span className={`block text-[11px] font-medium leading-tight ${ui.texto}`}>
          {t(ESTADO_LBL[p.estado])}{desde && <span className="font-normal text-muted-foreground"> · {desde}</span>}
        </span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50 transition group-hover:translate-x-0.5 group-hover:text-foreground" />
    </button>
  );
}

/** Una caja de equipo: nombre, conectados/total, su nota viva y cada persona
 *  como ficha (letra) coloreada por su estado en vivo. */
function Caja({ caja, t, onAbrir }: { caja: CajaEquipo; t: Tr; onAbrir: (id: string) => void }) {
  const tn = tono(caja.nota);
  return (
    <div className={`flex flex-col gap-2.5 rounded-panel border ${tn.borde} bg-white/50 dark:bg-white/[0.04] p-3`}>
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
            <button key={m.userId} type="button" onClick={() => onAbrir(m.userId)}
              title={`${m.nombre || "—"} · ${t(ESTADO_LBL[m.estado])}`}
              className={`relative flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold transition hover:scale-110 ${
                m.conectado ? "bg-card text-foreground ring-2" : "bg-muted/40 text-muted-foreground/60 ring-1"
              } ${ui.anillo}`}>
              {letra}
              <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-background ${ui.punto} ${m.problema ? "animate-pulse" : ""}`} />
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function PulsoEquipoVivo() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const { puedeVer, pulso, cargando, error, ultimaRonda } = usePulsoEquipo();

  const ultima = useMemo(() => (ultimaRonda ? hace(ultimaRonda.toISOString(), language) : null), [ultimaRonda, language]);
  const abrir = (id: string) => navigate(`/hr/expediente/${id}`);

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
            {/* Nota viva + quién la baja, lado a lado en ancho */}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,260px)_1fr]">
              {/* Nota viva */}
              <div className="flex items-center gap-4 rounded-panel border border-border/40 bg-card/30 p-4">
                <div className={`font-display text-5xl font-bold leading-none tabular-nums ${tn.texto}`}>
                  {pulso.notaViva ?? "—"}
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-muted-foreground">{t("dashboard.pulso.notaViva")}</div>
                  <div className="mt-1 text-[11px] leading-snug text-muted-foreground">
                    {pulso.conectados === 0
                      ? t("dashboard.pulso.sinConectados")
                      : t("dashboard.pulso.deConectados", { trabajando: pulso.trabajando, problema: pulso.conProblema, conectados: pulso.conectados })}
                  </div>
                  {ultima && <div className="mt-1 text-[10px] text-muted-foreground/70">{t("dashboard.pulso.ultimaRonda", { hace: ultima })}</div>}
                </div>
              </div>

              {/* Quién la baja */}
              <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  {pulso.conProblema > 0 ? <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> : <CheckCircle2 className="h-3.5 w-3.5 text-success" />}
                  {t("dashboard.pulso.quienLaBaja")}
                </div>
                {pulso.conProblema === 0 ? (
                  <p className="rounded-panel border border-success/20 bg-success/5 px-3 py-2.5 text-sm font-medium text-success">{t("dashboard.pulso.todoEnOrden")}</p>
                ) : (
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {pulso.quienLaBaja.slice(0, 8).map((p) => (
                      <FilaProblema key={p.userId} p={p} t={t} lang={language} onAbrir={() => abrir(p.userId)} />
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Cajas por equipo */}
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {pulso.cajas.map((caja) => (
                <Caja key={caja.equipo} caja={caja} t={t} onAbrir={abrir} />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
