import { useNavigate } from "react-router-dom";
import { Siren, CheckCircle2, Loader2, AlertTriangle, RefreshCw, ChevronRight, ScreenShare } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { UserAvatar } from "@/components/UserAvatar";
import { useAtencionAhora, type TipoAlerta } from "@/hooks/useAtencionAhora";
import { LABEL_FALTA, type FaltaTipo } from "@/lib/monitorFaltas";
import type { TranslationKey } from "@/lib/i18n";

// ATENCIÓN AHORA: lo PRIMERO al entrar a Argos. Solo las personas con problema en
// este momento, de peor a mejor, cada una con sus alertas, la frase de Argos y
// su pantallazo. Si nadie tiene problema: «todo en orden». Al tocar a alguien,
// su expediente. Todo el texto por t(); los datos, de useAtencionAhora.

type Tr = (k: TranslationKey, vars?: Record<string, string | number>) => string;

function labelTipo(tipo: TipoAlerta, t: Tr): string {
  if (tipo === "fuera_de_lugar" || tipo === "sin_senal" || tipo === "pausa_de_mas") {
    return t(`hr.atencion.tipo.${tipo}` as TranslationKey);
  }
  const k = LABEL_FALTA[tipo as FaltaTipo];
  return k ? t(k) : tipo;
}

const TONO_GRAVEDAD: Record<number, string> = {
  3: "border-destructive/60 bg-destructive/10 text-destructive",
  2: "border-warning/50 bg-warning/10 text-warning",
  1: "border-border/50 bg-muted/40 text-muted-foreground",
};

export function AtencionAhoraPanel() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { personas, cargando, error, refrescar } = useAtencionAhora();

  const hayProblema = personas.length > 0;

  return (
    <section className={`vidrio sube p-4 lg:p-5 ${hayProblema ? "ring-1 ring-destructive/30" : ""}`}>
      <div className="v-cont">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className={`relative flex h-9 w-9 shrink-0 items-center justify-center rounded-panel ${hayProblema ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success"}`}>
            {hayProblema ? <Siren className="h-[18px] w-[18px]" /> : <CheckCircle2 className="h-[18px] w-[18px]" />}
            {hayProblema && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 animate-pulse rounded-full bg-destructive shadow-[0_0_6px_hsl(var(--destructive))]" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-bold leading-tight tracking-tight">{t("hr.atencion.title")}</h2>
            <p className="text-xs text-muted-foreground">
              {hayProblema
                ? (personas.length === 1 ? t("hr.atencion.contandoUna") : t("hr.atencion.contando", { n: personas.length }))
                : t("hr.atencion.sub")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void refrescar()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
            title={t("hr.pantallazos.reintentar")}
            aria-label={t("hr.pantallazos.reintentar")}
          >
            <RefreshCw className={`h-4 w-4 ${cargando ? "animate-spin" : ""}`} />
          </button>
        </div>

        {error ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center text-muted-foreground">
            <AlertTriangle className="h-7 w-7 text-destructive/70" />
            <p className="text-sm">{t("hr.atencion.error")}</p>
          </div>
        ) : cargando && personas.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : !hayProblema ? (
          <div className="flex items-center gap-3 rounded-2xl border border-success/25 bg-success/5 px-4 py-3">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-success" />
            <p className="text-sm font-medium text-success">{t("hr.atencion.todoBien")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {personas.map((p) => {
              const nombre = p.nombre || t("hr.noName");
              const min = Math.max(0, Math.round((Date.now() - Date.parse(p.abiertaAt)) / 60000));
              const frase = p.alertas.find((a) => a.detalle)?.detalle ?? null;
              return (
                <button
                  key={p.userId}
                  type="button"
                  onClick={() => navigate(`/hr/expediente/${p.userId}`)}
                  title={t("hr.atencion.verExpediente")}
                  className={`group flex w-full items-center gap-3 rounded-2xl border bg-card/30 px-3 py-2.5 text-left transition-colors hover:bg-card/50 ${
                    p.gravedad >= 3 ? "border-destructive/50 hover:border-destructive" : "border-warning/40 hover:border-warning"
                  }`}
                >
                  <UserAvatar name={nombre} src={p.avatarUrl} seed={p.avatarSeed} size="md" status="busy" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{nombre}</span>
                      {p.alertas.map((a) => (
                        <span key={a.id} className={`inline-flex items-center rounded-control border px-1.5 py-0.5 text-[10px] font-semibold ${TONO_GRAVEDAD[a.gravedad] ?? TONO_GRAVEDAD[2]}`}>
                          {labelTipo(a.tipo, t)}
                        </span>
                      ))}
                    </div>
                    {frase && <p className="mt-0.5 truncate text-xs text-muted-foreground">{frase}</p>}
                    <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">{t("hr.rondin.desdeHace", { n: min })}</p>
                  </div>
                  {p.capturaUrl ? (
                    <img src={p.capturaUrl} alt={nombre} loading="lazy" className="hidden h-14 w-24 shrink-0 rounded-lg border border-border/40 object-cover sm:block" />
                  ) : (
                    <span className="hidden h-14 w-24 shrink-0 items-center justify-center rounded-lg border border-border/40 bg-muted/40 text-muted-foreground sm:flex"><ScreenShare className="h-4 w-4 opacity-50" /></span>
                  )}
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
