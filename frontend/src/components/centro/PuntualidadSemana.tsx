import { useState } from "react";
import { Link } from "react-router-dom";
import { AlarmClock } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { UserAvatar } from "@/components/UserAvatar";
import { usePuntualidadSemana } from "@/hooks/usePuntualidadSemana";
import { useFotosDe } from "@/hooks/useHoyDelEquipo";
import { useEsDueno } from "@/hooks/useEsDueno";
import { useEsRh } from "@/hooks/useEsRh";
import { horaBogota } from "@/lib/llegadas";

// PUNTUALIDAD DE LA SEMANA (Alvaro, 18/11/2026: la gráfica de horas totales
// «no tiene ningún sentido» → cuántos llegaron tarde cada día, con el número a
// la vista; tocas un día y debajo salen quiénes, con a qué hora entraron).
// Una sola serie: barras finas con su cifra encima, hoy resaltado, sin leyenda.

const nombreDia = (dia: string, idioma: string, largo = false) =>
  new Intl.DateTimeFormat(idioma === "es" ? "es" : "en", { weekday: largo ? "long" : "short", timeZone: "UTC" })
    .format(new Date(`${dia}T12:00:00Z`))
    .replace(".", "");

export function PuntualidadSemana() {
  const { t, language } = useLanguage();
  const { dias, cargando, fallo, reintentar } = usePuntualidadSemana(true);
  const [elegido, setElegido] = useState<string | null>(null);
  const { esDueno } = useEsDueno();
  const { esRh } = useEsRh();
  const puedeAbrir = esDueno === true || esRh === true;

  const dia = dias.find((d) => d.dia === elegido) ?? dias[dias.length - 1];
  const fotos = useFotosDe(dia ? dia.tarde.map((p) => p.userId) : []).data ?? {};
  const max = Math.max(1, ...dias.map((d) => d.tarde.length));
  const total = dias.reduce((s, d) => s + d.tarde.length, 0);

  return (
    <section className="vidrio sube p-4" style={{ animationDelay: "0.2s" }}>
      <div className="mb-4 flex items-start gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-warning/[0.08] text-warning/90 ring-1 ring-warning/20"><AlarmClock className="h-4 w-4" /></span>
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{t("dashboard.puntualidad.titulo")}</h2>
          <p className="text-[11px] text-muted-foreground">{t("dashboard.puntualidad.sub")}</p>
        </div>
      </div>

      {fallo ? (
        <p className="text-sm text-muted-foreground">
          {t("dashboard.centro.fallo")}
          <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={reintentar}>{t("dashboard.centro.reintentar")}</button>
        </p>
      ) : cargando ? (
        <div className="flex h-36 items-end gap-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="flex-1 animate-pulse rounded-t-md bg-muted" style={{ height: `${25 + ((i * 37) % 50)}%` }} />
          ))}
        </div>
      ) : (
        <>
          <div className="flex h-36 items-end gap-2 sm:gap-3" role="group" aria-label={t("dashboard.puntualidad.titulo")}>
            {dias.map((d) => {
              const activo = dia?.dia === d.dia;
              const n = d.tarde.length;
              return (
                <button
                  key={d.dia}
                  type="button"
                  onClick={() => setElegido(d.dia)}
                  aria-pressed={activo}
                  aria-label={t("dashboard.puntualidad.verDia", { dia: nombreDia(d.dia, language, true) })}
                  className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5 rounded-lg pt-1 outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <span className={`text-sm font-semibold tabular-nums ${activo ? "text-foreground" : "text-foreground/70"}`}>{n}</span>
                  <span
                    className={`w-full max-w-[34px] rounded-t-md transition-colors ${
                      n === 0 ? "bg-foreground/10" : activo ? "bg-warning" : "bg-warning/45 group-hover:bg-warning/70"
                    }`}
                    style={{ height: n === 0 ? "3px" : `${Math.max(8, (n / max) * 100)}%` }}
                  />
                  <span className={`text-[11px] font-semibold ${activo ? "text-foreground" : d.esHoy ? "text-primary" : "text-muted-foreground"}`}>
                    {nombreDia(d.dia, language)}
                  </span>
                  <span className="-mt-1 text-[10px] tabular-nums text-muted-foreground">{t("dashboard.puntualidad.deLlegaron", { n: d.llegaron })}</span>
                </button>
              );
            })}
          </div>

          {/* Quiénes, del día elegido (por defecto hoy). */}
          {dia && (
            <div className="mt-4 border-t border-border/40 pt-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {dia.esHoy ? t("dashboard.puntualidad.hoy") : t("dashboard.puntualidad.elDia", { dia: nombreDia(dia.dia, language, true) })} · {dia.tarde.length}
              </p>
              {dia.tarde.length === 0 ? (
                <p className="text-xs text-muted-foreground">{total === 0 ? t("dashboard.puntualidad.semanaLimpia") : t("dashboard.puntualidad.nadie")}</p>
              ) : (
                <ul className="grid gap-x-4 sm:grid-cols-2">
                  {dia.tarde.map((p) => {
                    const foto = fotos[p.userId];
                    const cuerpo = (
                      <>
                        <UserAvatar name={p.nombre} src={foto?.foto} seed={foto?.seed} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">{p.nombre}</span>
                          <span className="block truncate text-[11px] tabular-nums text-muted-foreground">
                            {t("dashboard.puntualidad.entroDebia", { h: horaBogota(p.llegoAt), e: p.entrada })}
                          </span>
                        </span>
                        <span className="shrink-0 text-xs font-semibold tabular-nums text-warning">
                          +{p.tardeMin < 60 ? t("dashboard.atajos.min", { n: p.tardeMin }) : t("dashboard.atajos.horas", { h: Math.floor(p.tardeMin / 60), m: String(p.tardeMin % 60).padStart(2, "0") })}
                        </span>
                      </>
                    );
                    return (
                      <li key={p.userId}>
                        {puedeAbrir ? (
                          <Link to={`/hr/expediente/${p.userId}?dia=${dia.dia}`} state={{ volverA: "/dashboard" }}
                            className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-foreground/[0.05]">
                            {cuerpo}
                          </Link>
                        ) : (
                          <div className="flex items-center gap-2.5 px-2 py-1.5">{cuerpo}</div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
