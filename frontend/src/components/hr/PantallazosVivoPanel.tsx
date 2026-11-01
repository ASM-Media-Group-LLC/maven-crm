import { MonitorPlay, Loader2, AlertTriangle, ScreenShare, Camera, RefreshCw } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { UserAvatar } from "@/components/UserAvatar";
import { useCapturasVivo } from "@/hooks/useCapturasVivo";

// LOS PANTALLAZOS EN VIVO de Argos (modelo Hubstaff): grilla de miniaturas de lo
// que el equipo está haciendo AHORA —pantalla y cámara—, cada una con su URL
// firmada. Se refresca solo. Todo el texto por t(); los datos, de useCapturasVivo.
export function PantallazosVivoPanel() {
  const { t } = useLanguage();
  const { capturas, cargando, error, refrescar } = useCapturasVivo();

  return (
    <section className="vidrio sube p-4 lg:p-5">
      <div className="v-cont">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-panel bg-primary/10 text-primary">
            <MonitorPlay className="h-[18px] w-[18px]" />
            {capturas.length > 0 && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-success shadow-[0_0_6px_hsl(var(--success))]" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-bold leading-tight tracking-tight">{t("hr.pantallazos.title")}</h2>
            <p className="text-xs text-muted-foreground">{t("hr.pantallazos.sub")}</p>
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
        ) : cargando && capturas.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : capturas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <MonitorPlay className="h-7 w-7 opacity-40" />
            <p className="text-sm">{t("hr.pantallazos.vacio")}</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {capturas.map((c) => {
              const nombre = c.nombre || t("hr.noName");
              const min = Math.max(0, Math.round((Date.now() - new Date(c.createdAt).getTime()) / 60000));
              const tipoLabel = c.tipo === "pantalla" ? t("hr.pantallazos.pantalla") : t("hr.pantallazos.camara");
              const TipoIcon = c.tipo === "pantalla" ? ScreenShare : Camera;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { if (c.url) window.open(c.url, "_blank", "noopener"); }}
                  className={`group relative block overflow-hidden rounded-2xl border bg-card/30 text-left transition-colors ${c.fueraDeLugar ? "border-destructive/50" : "border-border/40 hover:border-primary/40"}`}
                  title={`${nombre} · ${tipoLabel}`}
                >
                  <div className="relative aspect-[16/10] w-full bg-muted/40">
                    {c.url ? (
                      <img src={c.url} alt={`${nombre} · ${tipoLabel}`} className="h-full w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>
                    )}
                    <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-control bg-black/55 px-1.5 py-0.5 text-[10px] font-semibold text-white backdrop-blur-sm">
                      <TipoIcon className="h-3 w-3" />{tipoLabel}
                    </span>
                    {c.fueraDeLugar && (
                      <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-1 rounded-control bg-destructive px-1.5 py-0.5 text-[10px] font-semibold text-destructive-foreground">
                        <AlertTriangle className="h-3 w-3" />{t("hr.pantallazos.fueraDeLugar")}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 px-2 py-1.5">
                    <UserAvatar name={nombre} src={c.avatarUrl} seed={c.avatarSeed} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-xs font-medium">{nombre}</span>
                    <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
                      {min < 1 ? t("hr.pantallazos.ahora") : t("hr.pantallazos.hace", { n: min })}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
