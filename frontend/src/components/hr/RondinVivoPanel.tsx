import { Radar, Loader2, Video, User, Coffee, Smartphone, Eye, EyeOff, VideoOff, UserX, Moon, AlertTriangle } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { UserAvatar } from "@/components/UserAvatar";
import { useRondinVivo, type EstadoVivo, type PersonaRondin } from "@/hooks/useRondinVivo";
import type { TranslationKey } from "@/lib/i18n";

// El RONDÍN EN VIVO de Argos: qué hace cada quien AHORA (en cámara trabajando,
// presente, en pausa, en el celular, fuera del puesto…). Se refresca solo.
// Todo el texto por t(); los datos vienen de useRondinVivo.

type Tr = (k: TranslationKey, vars?: Record<string, string | number>) => string;

const EST: Record<EstadoVivo, { icon: typeof Video; tone: "success" | "primary" | "warning" | "destructive" | "muted"; status: "online" | "away" | "busy" | null }> = {
  trabajando: { icon: Video, tone: "success", status: "online" },
  presente: { icon: User, tone: "primary", status: "online" },
  pausa: { icon: Coffee, tone: "warning", status: "away" },
  celular: { icon: Smartphone, tone: "destructive", status: "busy" },
  distraido: { icon: Eye, tone: "destructive", status: "busy" },
  no_mira: { icon: EyeOff, tone: "destructive", status: "busy" },
  camara_apagada: { icon: VideoOff, tone: "destructive", status: "busy" },
  se_fue: { icon: UserX, tone: "destructive", status: "busy" },
  ausente: { icon: Moon, tone: "muted", status: "away" },
};
const TONO: Record<string, string> = {
  success: "bg-success/10 text-success",
  primary: "bg-primary/10 text-primary",
  warning: "bg-warning/10 text-warning",
  destructive: "bg-destructive/10 text-destructive",
  muted: "bg-muted/40 text-muted-foreground",
};

function labelEstado(p: PersonaRondin, t: Tr): string {
  if (p.estado === "pausa" && p.pausaKind) return t(`hr.rondin.estado.pausa.${p.pausaKind}` as TranslationKey);
  return t(`hr.rondin.estado.${p.estado}` as TranslationKey);
}

export function RondinVivoPanel() {
  const { t } = useLanguage();
  const { personas, resumen, cargando, error } = useRondinVivo();

  const textoUltima = (() => {
    if (!resumen.ultimaRonda) return t("hr.rondin.sinRonda");
    const min = Math.max(0, Math.round((Date.now() - resumen.ultimaRonda.getTime()) / 60000));
    return `${t("hr.rondin.ultima")}: ${min < 1 ? t("hr.rondin.reciente") : t("hr.rondin.hace", { n: min })}`;
  })();

  return (
    <section className="vidrio sube p-4 lg:p-5">
      <div className="v-cont">
        {/* Cabecera */}
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-panel bg-primary/10 text-primary">
            <Radar className="h-[18px] w-[18px]" />
            {resumen.total > 0 && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-success shadow-[0_0_6px_hsl(var(--success))]" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-bold leading-tight tracking-tight">{t("hr.rondin.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("hr.rondin.sub")}</p>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums">{textoUltima}</span>
        </div>

        {/* Resumen */}
        {resumen.total > 0 && (
          <div className="mb-4 grid grid-cols-3 gap-2.5">
            <div className="rounded-panel border border-success/20 bg-success/5 px-3 py-2">
              <div className="font-display text-xl font-bold tabular-nums text-success">{resumen.trabajando}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("hr.rondin.kpiTrabajando")}</div>
            </div>
            <div className="rounded-panel border border-warning/20 bg-warning/5 px-3 py-2">
              <div className="font-display text-xl font-bold tabular-nums text-warning">{resumen.enPausa}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("hr.rondin.kpiPausa")}</div>
            </div>
            <div className="rounded-panel border border-destructive/20 bg-destructive/5 px-3 py-2">
              <div className="font-display text-xl font-bold tabular-nums text-destructive">{resumen.conProblema}</div>
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("hr.rondin.kpiProblema")}</div>
            </div>
          </div>
        )}

        {/* Personas */}
        {error ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <AlertTriangle className="h-7 w-7 text-destructive/70" />
            <p className="text-sm">{t("hr.rondin.error")}</p>
          </div>
        ) : cargando ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : personas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <Radar className="h-7 w-7 opacity-40" />
            <p className="text-sm">{t("hr.rondin.vacio")}</p>
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {personas.map((p) => {
              const est = EST[p.estado];
              const Icono = est.icon;
              const nombre = p.nombre || t("hr.noName");
              const min = Math.max(0, Math.round((Date.now() - new Date(p.desde).getTime()) / 60000));
              return (
                <div key={p.userId} className="flex items-center gap-3 rounded-2xl border border-border/40 bg-card/30 px-3 py-2.5">
                  <UserAvatar name={nombre} src={p.avatarUrl} seed={p.avatarSeed} size="sm" status={est.status} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{nombre}</p>
                    <span className={`mt-0.5 inline-flex items-center gap-1 rounded-control px-1.5 py-0.5 text-[11px] font-semibold ${TONO[est.tone]}`}>
                      <Icono className="h-3 w-3" />
                      {labelEstado(p, t)}
                    </span>
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{t("hr.rondin.desdeHace", { n: min })}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
