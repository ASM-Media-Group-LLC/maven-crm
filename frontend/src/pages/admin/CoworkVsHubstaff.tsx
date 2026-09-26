import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, ChevronDown, Loader2, Timer, Hourglass, Users2, Percent, AlertTriangle } from "lucide-react";
import StatChip from "@/components/StatChip";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { useFormato } from "@/hooks/useFormato";
import { useLanguage } from "@/hooks/useLanguage";
import { ConFormato } from "./ConFormato";
import type { Formato } from "@/lib/formato";
import { horas, porcentaje, type ResumenPersona } from "@/lib/coworkVsHubstaff";
import { useCoworkVsHubstaff, fechaBogota } from "./coworkVsHubstaff/useCoworkVsHubstaff";

// Fase 2 del reemplazo de Hubstaff: el admin ve, persona por persona, cuánto
// del tiempo que Hubstaff registró lo explica el reloj de Cowork (cámara +
// pantalla, presente). Nadie más ve esto todavía: primero se calibra la regla
// con datos, después se le muestra al empleado y al supervisor.

const RANGOS = [7, 14, 30];

const fechaCorta = (iso: string, f: Formato) =>
  new Date(`${iso}T12:00:00-05:00`).toLocaleDateString(f.intl("es-CO"), { weekday: "short", day: "numeric", month: "short" });

/** Colores de la cobertura: cuánto del Hubstaff lo explica Cowork. */
function tonoCobertura(c: number | null): string {
  if (c == null) return "text-muted-foreground";
  if (c >= 0.8) return "text-success";
  if (c >= 0.5) return "text-warning";
  return "text-destructive";
}

export default function CoworkVsHubstaff() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [dias, setDias] = useState(7);
  const desde = fechaBogota(dias - 1), hasta = fechaBogota(0);
  const { data, cargando, error } = useCoworkVsHubstaff(desde, hasta);
  const [abierta, setAbierta] = useState<string | null>(null);

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <header className="bg-background/30 backdrop-blur-xl px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <button onClick={() => navigate("/admin/usuarios")} className="hover:text-foreground transition-colors">{t("admin.administration")}</button>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground">Cowork vs Hubstaff</span>
        </div>
        <PageHeader
          title="Cowork vs Hubstaff"
          subtitle={t("admin.cvh.subtitle")}
          actions={
            <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
              {RANGOS.map((n) => (
                <Button key={n} size="sm" variant={dias === n ? "default" : "ghost"} className="h-8 rounded-lg" onClick={() => setDias(n)}>
                  {t("admin.nDays", { n })}
                </Button>
              ))}
            </div>
          }
        />
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
        {cargando ? (
          <div className="flex justify-center py-12"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>
        ) : error ? (
          <div className="flex items-start gap-2 rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{t("admin.cvh.loadError", { error: error.message })}</span>
          </div>
        ) : !data || data.personas.length === 0 ? (
          <EmptyState
            className="rounded-3xl border border-dashed border-border/70"
            seed="empty-cowork-vs-hubstaff"
            title={t("admin.cvh.emptyTitle")}
            description={t("admin.cvh.emptyBody")}
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatChip label={t("admin.cvh.people")} value={String(data.totales.personas)} icon={<Users2 className="h-3.5 w-3.5" />} color="bg-primary" />
              <StatChip label={t("admin.cvh.hubstaffHours")} value={horas(data.totales.hubstaff_seg)} icon={<Hourglass className="h-3.5 w-3.5" />} color="bg-muted-foreground/60" />
              <StatChip label={t("admin.cvh.coworkHours")} value={horas(data.totales.cowork_activo_seg)} icon={<Timer className="h-3.5 w-3.5" />} color="bg-violet-500" />
              <StatChip
                label={t("admin.cvh.coverage")}
                value={<span className={tonoCobertura(data.totales.cobertura)}>{porcentaje(data.totales.cobertura)}</span>}
                hint={data.totales.sinCowork > 0 ? t("admin.cvh.withoutCowork", { n: data.totales.sinCowork }) : undefined}
                icon={<Percent className="h-3.5 w-3.5" />}
                color="bg-success"
              />
            </div>

            <div className="flex items-start gap-2 rounded-2xl border border-warning/25 bg-warning/10 px-4 py-3 text-[13px] leading-snug text-warning">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <ConFormato texto={t("admin.cvh.coverageExplainer")} />
              </span>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="hidden sm:grid grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_2rem] gap-3 border-b border-border/60 px-4 py-2 text-xs font-semibold text-muted-foreground">
                <span>{t("admin.person")}</span><span className="text-right">Hubstaff</span><span className="text-right">Cowork</span><span className="text-right">{t("admin.cvh.inRoom")}</span><span className="text-right">{t("admin.cvh.coverage")}</span><span />
              </div>
              {data.personas.map((p) => (
                <FilaPersona key={p.profile_id} p={p} abierta={abierta === p.profile_id} onToggle={() => setAbierta(abierta === p.profile_id ? null : p.profile_id)} />
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function FilaPersona({ p, abierta, onToggle }: { p: ResumenPersona; abierta: boolean; onToggle: () => void }) {
  const f = useFormato();
  const { t } = useLanguage();
  const detenido = p.cowork_en_sala_seg - p.cowork_activo_seg;
  return (
    <div className="border-b border-border/40 last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="grid w-full grid-cols-[minmax(0,1fr)_2rem] items-center gap-3 px-4 py-3 text-left hover:bg-muted/40 sm:grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_2rem]"
        aria-expanded={abierta}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <UserAvatar name={p.nombre} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground">{p.nombre}</span>
            <span className="block text-[11px] text-muted-foreground">
              {t("admin.cvh.daysLine", {
                hubstaff: p.diasHubstaff === 1 ? t("admin.oneDay") : t("admin.nDays", { n: p.diasHubstaff }),
                cowork: p.diasCowork,
              })}
            </span>
          </span>
        </span>
        <span className="hidden text-right text-sm tabular-nums sm:block">{horas(p.hubstaff_seg)}</span>
        <span className="hidden text-right text-sm font-semibold tabular-nums text-violet-600 dark:text-violet-400 sm:block">{horas(p.cowork_activo_seg)}</span>
        <span className="hidden text-right text-sm tabular-nums text-muted-foreground sm:block">{horas(p.cowork_en_sala_seg)}</span>
        <span className={cn("hidden text-right text-sm font-semibold tabular-nums sm:block", tonoCobertura(p.cobertura))}>{porcentaje(p.cobertura)}</span>
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", abierta && "rotate-180")} />
      </button>

      {abierta && (
        <div className="space-y-3 border-t border-border/40 bg-muted/20 px-4 py-3">
          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:hidden">
            <span className="text-muted-foreground">Hubstaff</span><span className="text-right tabular-nums">{horas(p.hubstaff_seg)}</span>
            <span className="text-muted-foreground">{t("admin.cvh.coworkClock")}</span><span className="text-right tabular-nums">{horas(p.cowork_activo_seg)}</span>
            <span className="text-muted-foreground">{t("admin.cvh.inRoom")}</span><span className="text-right tabular-nums">{horas(p.cowork_en_sala_seg)}</span>
            <span className="text-muted-foreground">{t("admin.cvh.coverage")}</span><span className={cn("text-right tabular-nums", tonoCobertura(p.cobertura))}>{porcentaje(p.cobertura)}</span>
          </div>

          {detenido > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-muted-foreground">{t("admin.cvh.clockStopped", { h: horas(detenido) })}</span>
              {p.cowork_pausa_seg > 0 && <Chip>{t("admin.cvh.pause", { h: horas(p.cowork_pausa_seg) })}</Chip>}
              {p.cowork_sin_camara_seg > 0 && <Chip>{t("admin.cvh.noCamera", { h: horas(p.cowork_sin_camara_seg) })}</Chip>}
              {p.cowork_sin_pantalla_seg > 0 && <Chip>{t("admin.cvh.noScreen", { h: horas(p.cowork_sin_pantalla_seg) })}</Chip>}
              {p.cowork_fuera_seg > 0 && <Chip>{t("admin.cvh.offCamera", { h: horas(p.cowork_fuera_seg) })}</Chip>}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="tabla-movil w-full min-w-[420px] text-xs">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 text-left font-semibold">{t("common.day")}</th>
                  <th className="py-1 text-right font-semibold">Hubstaff</th>
                  <th className="py-1 text-right font-semibold">{t("admin.activity")}</th>
                  <th className="py-1 text-right font-semibold">Cowork</th>
                  <th className="py-1 text-right font-semibold">{t("admin.cvh.inRoom")}</th>
                  <th className="py-1 text-right font-semibold">{t("admin.cvh.stoppedBy")}</th>
                </tr>
              </thead>
              <tbody>
                {p.dias.map((d) => {
                  // En las celdas, el guion va primero en el ternario (vacía ? guion : horas):
                  // al revés, el detector de español lee la llamada a horas() como texto.
                  const motivos = [
                    d.cowork_pausa_seg > 0 && t("admin.cvh.pause", { h: horas(d.cowork_pausa_seg) }),
                    d.cowork_sin_camara_seg > 0 && t("admin.cvh.noCamera", { h: horas(d.cowork_sin_camara_seg) }),
                    d.cowork_sin_pantalla_seg > 0 && t("admin.cvh.noScreen", { h: horas(d.cowork_sin_pantalla_seg) }),
                    d.cowork_fuera_seg > 0 && t("admin.cvh.away", { h: horas(d.cowork_fuera_seg) }),
                  ].filter(Boolean).join(" · ");
                  return (
                    <tr key={d.dia} className="border-t border-border/30">
                      <td className="py-1.5 capitalize">{fechaCorta(d.dia, f)}</td>
                      <td className="py-1.5 text-right tabular-nums">{d.hubstaff_seg <= 0 ? <span className="text-muted-foreground">—</span> : horas(d.hubstaff_seg)}</td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">{d.hubstaff_actividad != null ? `${d.hubstaff_actividad}%` : "—"}</td>
                      <td className="py-1.5 text-right tabular-nums font-medium text-violet-600 dark:text-violet-400">{d.cowork_en_sala_seg <= 0 ? <span className="font-normal text-muted-foreground">—</span> : horas(d.cowork_activo_seg)}</td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">{d.cowork_en_sala_seg > 0 ? horas(d.cowork_en_sala_seg) : "—"}</td>
                      <td className="py-1.5 text-right text-muted-foreground">{motivos || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{children}</span>;
}
