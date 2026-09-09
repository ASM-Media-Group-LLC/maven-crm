import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ChevronRight, ChevronDown, Loader2, Timer, Hourglass, Users2, Percent, AlertTriangle } from "lucide-react";
import StatChip from "@/components/StatChip";
import { UserAvatar } from "@/components/UserAvatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { PageHeader } from "@/components/ui/page-header";
import { cn } from "@/lib/utils";
import { horas, porcentaje, type ResumenPersona } from "@/lib/coworkVsHubstaff";
import { useCoworkVsHubstaff, fechaBogota } from "./coworkVsHubstaff/useCoworkVsHubstaff";

// Fase 2 del reemplazo de Hubstaff: el admin ve, persona por persona, cuánto
// del tiempo que Hubstaff registró lo explica el reloj de Cowork (cámara +
// pantalla, presente). Nadie más ve esto todavía: primero se calibra la regla
// con datos, después se le muestra al empleado y al supervisor.

const RANGOS = [
  { label: "7 días", dias: 7 },
  { label: "14 días", dias: 14 },
  { label: "30 días", dias: 30 },
];

const fechaCorta = (iso: string) =>
  new Date(`${iso}T12:00:00-05:00`).toLocaleDateString("es-CO", { weekday: "short", day: "numeric", month: "short" });

/** Colores de la cobertura: cuánto del Hubstaff lo explica Cowork. */
function tonoCobertura(c: number | null): string {
  if (c == null) return "text-muted-foreground";
  if (c >= 0.8) return "text-emerald-600 dark:text-emerald-400";
  if (c >= 0.5) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

export default function CoworkVsHubstaff() {
  const navigate = useNavigate();
  const [dias, setDias] = useState(7);
  const desde = fechaBogota(dias - 1), hasta = fechaBogota(0);
  const { data, cargando, error } = useCoworkVsHubstaff(desde, hasta);
  const [abierta, setAbierta] = useState<string | null>(null);

  return (
    <main className="flex-1 flex flex-col h-full overflow-hidden min-w-0">
      <header className="bg-background/30 backdrop-blur-xl px-6 pt-6 pb-4 border-b border-white/10 shrink-0">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
          <button onClick={() => navigate("/admin/usuarios")} className="hover:text-foreground transition-colors">Administración</button>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="text-foreground">Cowork vs Hubstaff</span>
        </div>
        <PageHeader
          title="Cowork vs Hubstaff"
          subtitle="Cuánto del tiempo que registra Hubstaff lo explica el reloj de Cowork (cámara + pantalla, presente). Solo admins, mientras se calibra la regla."
          actions={
            <div className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/5 p-1">
              {RANGOS.map((r) => (
                <Button key={r.dias} size="sm" variant={dias === r.dias ? "default" : "ghost"} className="h-8 rounded-lg" onClick={() => setDias(r.dias)}>
                  {r.label}
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
            <span>No se pudo cargar la comparación: {error.message}</span>
          </div>
        ) : !data || data.personas.length === 0 ? (
          <EmptyState
            className="rounded-3xl border border-dashed border-border/70"
            seed="empty-cowork-vs-hubstaff"
            title="Todavía no hay nada que comparar"
            description="El reloj de Cowork empieza a contar desde que alguien entra a una sala con esta versión. En cuanto haya latidos, acá aparecen las personas con sus horas de Hubstaff al lado."
          />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatChip label="Personas" value={String(data.totales.personas)} icon={<Users2 className="h-3.5 w-3.5" />} color="bg-primary" />
              <StatChip label="Horas Hubstaff" value={horas(data.totales.hubstaff_seg)} icon={<Hourglass className="h-3.5 w-3.5" />} color="bg-muted-foreground/60" />
              <StatChip label="Horas Cowork (reloj)" value={horas(data.totales.cowork_activo_seg)} icon={<Timer className="h-3.5 w-3.5" />} color="bg-violet-500" />
              <StatChip
                label="Cobertura"
                value={<span className={tonoCobertura(data.totales.cobertura)}>{porcentaje(data.totales.cobertura)}</span>}
                hint={data.totales.sinCowork > 0 ? `${data.totales.sinCowork} con Hubstaff y sin Cowork` : undefined}
                icon={<Percent className="h-3.5 w-3.5" />}
                color="bg-emerald-500"
              />
            </div>

            <div className="flex items-start gap-2 rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-[13px] leading-snug text-amber-700 dark:text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <b>Cobertura</b> = horas del reloj de Cowork ÷ horas de Hubstaff. Menos de 100 % no es "trabajó menos": es tiempo que Hubstaff registró
                fuera de Cowork (reuniones, otras tareas, sala sin cámara o sin pantalla). Los motivos de detención están en cada persona.
              </span>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="hidden sm:grid grid-cols-[minmax(0,2fr)_repeat(4,minmax(0,1fr))_2rem] gap-3 border-b border-border/60 px-4 py-2 text-xs font-semibold text-muted-foreground">
                <span>Persona</span><span className="text-right">Hubstaff</span><span className="text-right">Cowork</span><span className="text-right">En sala</span><span className="text-right">Cobertura</span><span />
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
              {p.diasHubstaff} {p.diasHubstaff === 1 ? "día" : "días"} en Hubstaff · {p.diasCowork} en Cowork
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
            <span className="text-muted-foreground">Cowork (reloj)</span><span className="text-right tabular-nums">{horas(p.cowork_activo_seg)}</span>
            <span className="text-muted-foreground">En sala</span><span className="text-right tabular-nums">{horas(p.cowork_en_sala_seg)}</span>
            <span className="text-muted-foreground">Cobertura</span><span className={cn("text-right tabular-nums", tonoCobertura(p.cobertura))}>{porcentaje(p.cobertura)}</span>
          </div>

          {detenido > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-muted-foreground">Reloj detenido {horas(detenido)}:</span>
              {p.cowork_pausa_seg > 0 && <Chip>pausa {horas(p.cowork_pausa_seg)}</Chip>}
              {p.cowork_sin_camara_seg > 0 && <Chip>sin cámara {horas(p.cowork_sin_camara_seg)}</Chip>}
              {p.cowork_sin_pantalla_seg > 0 && <Chip>sin pantalla {horas(p.cowork_sin_pantalla_seg)}</Chip>}
              {p.cowork_fuera_seg > 0 && <Chip>fuera de cámara {horas(p.cowork_fuera_seg)}</Chip>}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-xs">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="py-1 text-left font-semibold">Día</th>
                  <th className="py-1 text-right font-semibold">Hubstaff</th>
                  <th className="py-1 text-right font-semibold">Actividad</th>
                  <th className="py-1 text-right font-semibold">Cowork</th>
                  <th className="py-1 text-right font-semibold">En sala</th>
                  <th className="py-1 text-right font-semibold">Detenido por</th>
                </tr>
              </thead>
              <tbody>
                {p.dias.map((d) => {
                  const motivos = [
                    d.cowork_pausa_seg > 0 && `pausa ${horas(d.cowork_pausa_seg)}`,
                    d.cowork_sin_camara_seg > 0 && `sin cámara ${horas(d.cowork_sin_camara_seg)}`,
                    d.cowork_sin_pantalla_seg > 0 && `sin pantalla ${horas(d.cowork_sin_pantalla_seg)}`,
                    d.cowork_fuera_seg > 0 && `fuera ${horas(d.cowork_fuera_seg)}`,
                  ].filter(Boolean).join(" · ");
                  return (
                    <tr key={d.dia} className="border-t border-border/30">
                      <td className="py-1.5 capitalize">{fechaCorta(d.dia)}</td>
                      <td className="py-1.5 text-right tabular-nums">{d.hubstaff_seg > 0 ? horas(d.hubstaff_seg) : <span className="text-muted-foreground">—</span>}</td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">{d.hubstaff_actividad != null ? `${d.hubstaff_actividad}%` : "—"}</td>
                      <td className="py-1.5 text-right tabular-nums font-medium text-violet-600 dark:text-violet-400">{d.cowork_en_sala_seg > 0 ? horas(d.cowork_activo_seg) : <span className="font-normal text-muted-foreground">—</span>}</td>
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
