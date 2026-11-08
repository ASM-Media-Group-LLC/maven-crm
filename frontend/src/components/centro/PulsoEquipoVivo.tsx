import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { formatDistanceToNowStrict } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import { Activity, AlertTriangle, CheckCircle2, ChevronRight, Loader2, ShieldAlert, Users, Gauge } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { UserAvatar } from "@/components/UserAvatar";
import { TarjetaKpi } from "@/components/ui/TarjetaKpi";
import { usePulsoEquipo } from "@/hooks/usePulsoEquipo";
import type { EstadoVivo } from "@/hooks/useRondinVivo";
import type { PersonaPulso } from "@/lib/pulsoEquipo";
import type { TranslationKey } from "@/lib/i18n";

// EL PULSO DEL EQUIPO EN VIVO (Centro de operaciones · Alvaro, 05/11). Solo para
// quien vigila (supervisor+). Mismo lenguaje glassy del resto (TarjetaKpi + .vidrio
// compartido). Arriba 2 KPIs — En Cowork y Nota viva —; debajo "Quién la baja"
// como su propia sección y las cajas por equipo. Clic en caja → pop-up con nombres.
// Se refresca solo cada 15 s.

type Tr = (k: TranslationKey, v?: Record<string, string | number>) => string;

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

function tonoBanda(nota: number | null): { texto: string; tono: "primary" | "success" | "warning" | "danger"; glow: string } {
  if (nota == null) return { texto: "text-muted-foreground", tono: "primary", glow: "glow-b" };
  if (nota >= 80) return { texto: "text-success", tono: "success", glow: "glow-g" };
  if (nota >= 60) return { texto: "text-warning", tono: "warning", glow: "glow-a" };
  return { texto: "text-destructive", tono: "danger", glow: "glow-r" };
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

export default function PulsoEquipoVivo({ coworkConectados }: { coworkConectados?: number | null }) {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const { puedeVer, pulso, cargando, error, ultimaRonda } = usePulsoEquipo();

  const ultima = useMemo(() => (ultimaRonda ? hace(ultimaRonda.toISOString(), language) : null), [ultimaRonda, language]);
  const abrir = (id: string) => navigate(`/hr/expediente/${id}`);

  if (!puedeVer) return null;

  const tn = tonoBanda(pulso?.notaViva ?? null);

  return (
    <section className="space-y-3">
      {/* Cabecera del Pulso (solo título + en vivo + aviso) */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-0.5">
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

      {cargando && !pulso ? (
        <div className="vidrio p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : error || !pulso || pulso.total === 0 ? (
        <div className="vidrio p-4"><p className="text-sm text-muted-foreground">{error ? "—" : t("dashboard.pulso.sinEquipo")}</p></div>
      ) : (
        <>
          {/* MISMAS TARJETAS KPI que el resto del dashboard: ícono + etiqueta +
              número grande + detalle. Todo con el lenguaje glassy compartido. */}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <TarjetaKpi
              indice={0}
              icono={Users}
              tono="success"
              etiqueta={t("dashboard.pulso.enCowork")}
              valor={coworkConectados == null ? "–" : coworkConectados}
              detalle={t("dashboard.pulso.conApp", { n: pulso.conectados })}
            />
            <TarjetaKpi
              indice={1}
              icono={Gauge}
              tono={tn.tono}
              etiqueta={t("dashboard.pulso.notaViva")}
              valor={pulso.notaViva ?? "—"}
              detalle={pulso.conectados === 0
                ? t("dashboard.pulso.sinConectados")
                : t("dashboard.pulso.trabajandoProblema", { trabajando: pulso.trabajando, problema: pulso.conProblema })}
            />
            <TarjetaKpi
              indice={2}
              icono={CheckCircle2}
              tono="success"
              etiqueta={t("dashboard.pulso.trabajando")}
              valor={pulso.trabajando}
              detalle={ultima ? t("dashboard.pulso.ultimaRonda", { hace: ultima }) : "—"}
            />
            <TarjetaKpi
              indice={3}
              icono={AlertTriangle}
              tono={pulso.conProblema > 0 ? "danger" : "success"}
              etiqueta={t("dashboard.pulso.conProblema")}
              valor={pulso.conProblema}
              detalle={pulso.conProblema === 0 ? t("dashboard.pulso.todoEnOrden") : t("dashboard.pulso.hazClicProblema")}
            />
          </div>

          {/* "Quién la está bajando" como su propia sección glassy */}
          {pulso.conProblema > 0 && (
            <div className="vidrio vidrio-glow glow-r p-4">
              <div className="v-cont space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                  {t("dashboard.pulso.quienLaBaja")}
                </div>
                <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {pulso.quienLaBaja.slice(0, 9).map((p) => (
                    <FilaPersona key={p.userId} p={p} t={t} lang={language} problema onAbrir={() => abrir(p.userId)} />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* El detalle por equipo YA NO vive en el home (Alvaro, 08/11): era una
              grilla densa de círculos-letra que se pisaba con "Conectados ahora"
              de Argos. El home es el vistazo rápido; el detalle, un clic allá. */}
          <button
            type="button"
            onClick={() => navigate("/hr/monitor-ia?t=equipo")}
            className="vidrio vidrio-glow vidrio-lift glow-b flex w-full items-center gap-3 p-3.5 text-left"
          >
            <span className="v-cont flex w-full items-center gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-panel bg-primary/10 text-primary">
                <Users className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold leading-tight">{t("dashboard.pulso.verEquipo")}</span>
                <span className="block text-[11px] text-muted-foreground leading-tight">{t("dashboard.pulso.verEquipoSub")}</span>
              </span>
              <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/60" />
            </span>
          </button>
        </>
      )}
    </section>
  );
}
