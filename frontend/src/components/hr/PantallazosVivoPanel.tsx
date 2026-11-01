import { MonitorPlay, Loader2, AlertTriangle, ScreenShare, RefreshCw, Sparkles } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { UserAvatar } from "@/components/UserAvatar";
import { useCapturasVivo } from "@/hooks/useCapturasVivo";

// LA MURALLA EN VIVO de Argos (modelo Hubstaff): una tarjeta por persona con lo
// que pasa en los últimos minutos —su pantalla grande, su cámara en inset, quién
// es, hace cuánto y la línea de la IA—. Se refresca solo. Todo el texto por t().
export function PantallazosVivoPanel() {
  const { t } = useLanguage();
  const { personas, cargando, error, refrescar } = useCapturasVivo();

  return (
    <section className="vidrio sube p-4 lg:p-5">
      <div className="v-cont">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-panel bg-primary/10 text-primary">
            <MonitorPlay className="h-[18px] w-[18px]" />
            {personas.length > 0 && (
              <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-success shadow-[0_0_6px_hsl(var(--success))]" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-bold leading-tight tracking-tight">{t("hr.pantallazos.title")}</h2>
            <p className="text-xs text-muted-foreground">
              {personas.length > 0 ? t("hr.pantallazos.contando", { n: personas.length }) : t("hr.pantallazos.sub")}
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
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <AlertTriangle className="h-7 w-7 text-destructive/70" />
            <p className="text-sm">{t("hr.pantallazos.error")}</p>
          </div>
        ) : cargando && personas.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : personas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <MonitorPlay className="h-7 w-7 opacity-40" />
            <p className="text-sm">{t("hr.pantallazos.vacio")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {personas.map((p) => {
              const nombre = p.nombre || t("hr.noName");
              const min = Math.max(0, Math.round((Date.now() - new Date(p.ultima).getTime()) / 60000));
              return (
                <div
                  key={p.userId}
                  className={`group relative overflow-hidden rounded-2xl border bg-card/30 transition-colors ${
                    p.fueraDeLugar ? "border-destructive/60" : "border-border/40 hover:border-primary/40"
                  }`}
                >
                  {/* La pantalla (lo que hace), grande */}
                  <div className="relative aspect-[16/10] w-full bg-muted/40">
                    {p.principalUrl ? (
                      <img
                        src={p.principalUrl}
                        alt={nombre}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                        <Loader2 className="h-5 w-5 animate-spin" />
                      </div>
                    )}

                    {/* Marca de tipo: si lo grande es la pantalla */}
                    {p.tienePantalla && (
                      <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-control bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                        <ScreenShare className="h-3 w-3" />
                        {t("hr.pantallazos.pantalla")}
                      </span>
                    )}

                    {/* Fuera de lugar */}
                    {p.fueraDeLugar && (
                      <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-control bg-destructive px-1.5 py-0.5 text-[10px] font-semibold text-destructive-foreground">
                        <AlertTriangle className="h-3 w-3" />
                        {t("hr.pantallazos.fueraDeLugar")}
                      </span>
                    )}

                    {/* La cámara (que esté), en inset */}
                    {p.camaraUrl && p.tienePantalla && (
                      <img
                        src={p.camaraUrl}
                        alt={nombre}
                        loading="lazy"
                        className="absolute bottom-1.5 right-1.5 h-14 w-20 rounded-lg border-2 border-background/80 object-cover shadow-md"
                      />
                    )}
                  </div>

                  {/* Quién es + hace cuánto */}
                  <div className="flex items-center gap-2 px-2.5 py-2">
                    <UserAvatar name={nombre} src={p.avatarUrl} seed={p.avatarSeed} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold">{nombre}</span>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      {min < 1 ? t("hr.pantallazos.ahora") : t("hr.pantallazos.hace", { n: min })}
                    </span>
                  </div>

                  {/* La línea de la IA: qué está haciendo */}
                  <div
                    className={`flex items-start gap-1.5 border-t border-border/40 px-2.5 py-2 text-xs ${
                      p.fueraDeLugar ? "text-destructive" : "text-muted-foreground"
                    }`}
                  >
                    <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-70" />
                    <span className="min-w-0 flex-1 leading-snug">
                      {p.veredicto || t("hr.pantallazos.analizando")}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
