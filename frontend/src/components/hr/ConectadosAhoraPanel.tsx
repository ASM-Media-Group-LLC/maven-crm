import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Radio, Loader2, AlertTriangle, RefreshCw, ChevronRight, Sparkles } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { UserAvatar } from "@/components/UserAvatar";
import { useCapturasVivo } from "@/hooks/useCapturasVivo";
import { useNotasEquipo } from "@/hooks/useNotasEquipo";

// CONECTADOS AHORA — la ENTRADA de Argos (Álvaro): solo la gente que está
// trabajando en este momento (manda pantallazos), en lista limpia: su foto
// chica, quién es, qué está haciendo (IA), el MINUTO de su último pantallazo y
// su NOTA de hoy fusionada ahí mismo. Los desconectados no aparecen. Los fuera
// de lugar, arriba y en rojo. Clic → su día. Se refresca solo.
export function ConectadosAhoraPanel() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { personas, cargando, error, refrescar } = useCapturasVivo();
  const { notas } = useNotasEquipo("hoy");

  const notaPor = useMemo(() => new Map(notas.map((n) => [n.userId, n])), [notas]);
  const orden = useMemo(
    () => [...personas].sort((a, b) => (Number(b.fueraDeLugar) - Number(a.fueraDeLugar)) || (a.ultima < b.ultima ? 1 : -1)),
    [personas],
  );
  const horaDe = (iso: string) => new Date(iso).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
  const tonoNota = (v: number | null) => (v == null ? "text-muted-foreground" : v >= 80 ? "text-success" : v >= 60 ? "text-warning" : "text-destructive");
  const barNota = (v: number | null) => (v == null ? "bg-muted-foreground/40" : v >= 80 ? "bg-success" : v >= 60 ? "bg-warning" : "bg-destructive");

  return (
    <section className="vidrio sube p-4 lg:p-5">
      <div className="v-cont">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-panel bg-primary/10 text-primary">
            <Radio className="h-[18px] w-[18px]" />
            {personas.length > 0 && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-success shadow-[0_0_6px_hsl(var(--success))]" />}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-bold leading-tight tracking-tight">{t("hr.conectados.title")}</h2>
            <p className="text-xs text-muted-foreground">
              {personas.length > 0 ? t("hr.conectados.contando", { n: personas.length }) : t("hr.conectados.sub")}
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
          <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : personas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <Radio className="h-7 w-7 opacity-40" />
            <p className="text-sm">{t("hr.conectados.vacio")}</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            {orden.map((p) => {
              const nombre = p.nombre || t("hr.noName");
              const nota = notaPor.get(p.userId)?.nota.valor ?? null;
              return (
                <button
                  key={p.userId}
                  type="button"
                  onClick={() => navigate(`/hr/expediente/${p.userId}`)}
                  title={t("hr.notas.verDia", { nombre })}
                  className={`group flex w-full items-center gap-3 rounded-xl border bg-card/30 px-2.5 py-2 text-left transition-colors hover:bg-card/50 ${p.fueraDeLugar ? "border-destructive/50 hover:border-destructive" : "border-border/40 hover:border-primary/50"}`}
                >
                  <div className="relative h-11 w-[4.5rem] shrink-0 overflow-hidden rounded-md border border-border/40 bg-muted/40">
                    {p.principalUrl ? (
                      <img src={p.principalUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /></div>
                    )}
                  </div>
                  <UserAvatar name={nombre} src={p.avatarUrl} seed={p.avatarSeed} size="sm" status="online" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{nombre}</span>
                      {p.fueraDeLugar && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-destructive px-1 py-0.5 text-[9px] font-semibold text-destructive-foreground">
                          <AlertTriangle className="h-2.5 w-2.5" />{t("hr.pantallazos.fueraDeLugar")}
                        </span>
                      )}
                    </div>
                    <p className={`flex items-center gap-1 truncate text-xs ${p.fueraDeLugar ? "text-destructive" : "text-muted-foreground"}`}>
                      <Sparkles className="h-3 w-3 shrink-0 opacity-60" />{p.veredicto || t("hr.pantallazos.analizando")}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{horaDe(p.ultima)}</span>
                  {/* La nota de hoy, fusionada */}
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`font-display text-lg font-bold leading-none tabular-nums ${tonoNota(nota)}`}>{nota ?? "—"}</span>
                    <span className="block h-1 w-12 overflow-hidden rounded-full bg-primary/15">
                      <span className={`block h-full rounded-full ${barNota(nota)}`} style={{ width: `${nota ?? 0}%` }} />
                    </span>
                  </div>
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
