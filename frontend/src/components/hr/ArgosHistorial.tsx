import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from "recharts";
import { Clock, Loader2, AlertTriangle, ChevronLeft, ChevronRight, Sunrise, Sun, Moon, Eye } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { UserAvatar } from "@/components/UserAvatar";
import { useHorasDia, type HoraDia } from "@/hooks/useHorasDia";
import { useTurnoPersonas, type PersonaTurno } from "@/hooks/useTurnoPersonas";
import type { TranslationKey } from "@/lib/i18n";

// HISTORIAL del día (Alvaro, 04/11): el día partido en 3 turnos (hora Colombia).
// ARRIBA la gráfica hora por hora (pantalla/cámara/atención del equipo) con el
// fondo dividido en franjas AM/PM/Madrugada; ABAJO 3 cajas, una por turno, con el
// resumen. Así el dueño ve el panorama: cómo estuvo la mañana, la tarde, la noche.

type Tr = (k: TranslationKey, v?: Record<string, string | number>) => string;

const COLOR = { pantalla: "hsl(var(--primary))", camara: "hsl(199 89% 56%)", atencion: "hsl(262 83% 66%)" } as const;

// Turnos (hora Colombia): Madrugada 0-8, AM 8-16, PM 16-24. Se muestran en el
// orden que pidió Alvaro: AM, PM, Madrugada.
const TURNOS = [
  { key: "am", from: 8, to: 16, lbl: "hr.hist.turnoAM" as TranslationKey, icon: Sunrise, color: "hsl(38 92% 55%)" },
  { key: "pm", from: 16, to: 24, lbl: "hr.hist.turnoPM" as TranslationKey, icon: Sun, color: "hsl(199 89% 56%)" },
  { key: "madrugada", from: 0, to: 8, lbl: "hr.hist.turnoMadrugada" as TranslationKey, icon: Moon, color: "hsl(255 70% 62%)" },
];

function sumarDias(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

const prom = (arr: number[]): number | null => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);

function resumenTurno(rows: HoraDia[], from: number, to: number) {
  const within = rows.filter((h) => h.hourNum >= from && h.hourNum < to);
  return {
    pantalla: prom(within.map((h) => h.pantalla).filter((x): x is number => x != null)),
    camara: prom(within.map((h) => h.camara).filter((x): x is number => x != null)),
    atencion: prom(within.map((h) => h.atencion).filter((x): x is number => x != null)),
    personas: within.reduce((a, h) => Math.max(a, h.personas), 0),
    hayDatos: within.some((h) => h.personas > 0),
  };
}

const SEM_NOTA: Record<string, string> = { bien: "text-success", ojo: "text-warning", mal: "text-destructive" };
type Turno = typeof TURNOS[number];

// Las FALLAS de una persona, sacadas de sus factores reales de la nota:
//   atención < 95 → tuvo pantallazos "fuera de lugar" (distraído)
//   cámara   < 80 → cámara apagada / sin cara buena parte del tiempo
//   pantalla < 80 → no compartió pantalla buena parte del tiempo
function fallasDe(p: PersonaTurno, t: Tr): string[] {
  const sub = (c: string) => p.nota.factores.find((x) => x.clave === c)?.sub ?? null;
  const out: string[] = [];
  if ((sub("atencion") ?? 100) < 95) out.push(t("hr.hist.flagFuera"));
  if ((sub("camara") ?? 100) < 80) out.push(t("hr.hist.flagCamara"));
  if ((sub("pantalla") ?? 100) < 80) out.push(t("hr.hist.flagPantalla"));
  return out;
}

// Una persona del turno: cara, nombre, sus 3 factores, las fallas (chips) y la
// nota; clic → su expediente (y sus pantallazos de ese día). Peor → mejor.
function PersonaFilaTurno({ p, t, onClick }: { p: PersonaTurno; t: Tr; onClick: () => void }) {
  const color = p.nota.banda ? SEM_NOTA[p.nota.banda] : "text-muted-foreground";
  const f = (c: string) => p.nota.factores.find((x) => x.clave === c)?.sub ?? null;
  const txt = (v: number | null) => (v == null ? "—" : `${v}%`);
  const fallas = fallasDe(p, t);
  return (
    <button type="button" onClick={onClick} title={t("hr.hist.verExpediente")} className={`group flex w-full items-center gap-3 rounded-xl border bg-card/20 px-3 py-2 text-left transition hover:bg-card/40 ${fallas.length ? "border-warning/40 hover:border-warning/60" : "border-border/40 hover:border-primary/30"}`}>
      <UserAvatar name={p.nombre || t("hr.noName")} src={p.avatarUrl} seed={p.avatarSeed} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium">{p.nombre || t("hr.noName")}</span>
          {fallas.map((fl) => (
            <span key={fl} className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-medium text-warning"><AlertTriangle className="h-2.5 w-2.5" />{fl}</span>
          ))}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-2.5 text-[11px] text-muted-foreground">
          <span>{t("hr.resumen.pantalla")} <span className="tabular-nums">{txt(f("pantalla"))}</span></span>
          <span>{t("hr.resumen.camara")} <span className="tabular-nums">{txt(f("camara"))}</span></span>
          <span>{t("hr.resumen.atencion")} <span className="tabular-nums">{txt(f("atencion"))}</span></span>
        </div>
      </div>
      <span className={`shrink-0 font-display text-base font-bold tabular-nums ${color}`}>{p.nota.valor ?? "—"}</span>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60 transition group-hover:translate-x-0.5 group-hover:text-foreground" />
    </button>
  );
}

// PÁGINA de un turno (antes era pop-up, Alvaro 05/11): botón volver, diagnóstico
// (promedios + en problema), filtro "solo con fallas" y la gente del turno
// (peor → mejor, con chips de falla). Clic en alguien → su expediente.
function TurnoDetalle({ turno, dia, resumen, t, onVolver, onPersona }: {
  turno: Turno; dia: string; resumen: { pantalla: number | null; camara: number | null; atencion: number | null; personas: number };
  t: Tr; onVolver: () => void; onPersona: (id: string) => void;
}) {
  const { personas, cargando } = useTurnoPersonas(dia, turno.from, turno.to, true);
  const [soloFallas, setSoloFallas] = useState(false);
  const conNota = personas.filter((p) => p.nota.valor != null);
  const enProblema = conNota.filter((p) => (p.nota.valor as number) < 60).length;
  const conFallas = personas.filter((p) => fallasDe(p, t).length > 0);
  const mostradas = soloFallas ? conFallas : personas;
  const Icono = turno.icon;
  return (
    <div className="space-y-4">
      {/* Cabecera con volver */}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onVolver} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"><ChevronLeft className="h-4 w-4" />{t("hr.hist.volver")}</button>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: `${turno.color}1f`, color: turno.color }}><Icono className="h-4 w-4" /></span>
          <span className="font-display text-base font-bold">{t(turno.lbl)}</span>
          <span className="text-xs font-normal text-muted-foreground">{t("hr.hist.horario", { a: turno.from, b: turno.to })}</span>
        </div>
      </div>

      {/* Diagnóstico: los 3 promedios + en problema */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          { lbl: t("hr.resumen.pantalla"), v: resumen.pantalla, c: COLOR.pantalla },
          { lbl: t("hr.resumen.camara"), v: resumen.camara, c: COLOR.camara },
          { lbl: t("hr.resumen.atencion"), v: resumen.atencion, c: COLOR.atencion },
        ].map((m) => (
          <div key={m.lbl} className="rounded-xl border border-border/40 bg-card/20 p-2.5 text-center">
            <div className="font-display text-lg font-bold tabular-nums" style={{ color: m.c }}>{m.v == null ? "—" : `${m.v}%`}</div>
            <div className="text-[10px] text-muted-foreground">{m.lbl}</div>
          </div>
        ))}
        <div className={`rounded-xl border p-2.5 text-center ${enProblema > 0 ? "border-destructive/40 bg-destructive/5" : "border-border/40 bg-card/20"}`}>
          <div className={`font-display text-lg font-bold tabular-nums ${enProblema > 0 ? "text-destructive" : ""}`}>{enProblema}</div>
          <div className="text-[10px] text-muted-foreground">{t("hr.hist.enProblemaLbl")}</div>
        </div>
      </div>

      {/* La gente del turno */}
      <div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Eye className="h-3.5 w-3.5" />{t("hr.hist.gente")}</p>
          <button type="button" onClick={() => setSoloFallas((s) => !s)} className={`ml-auto inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition ${soloFallas ? "border-warning/50 bg-warning/15 text-warning" : "border-border/50 text-muted-foreground hover:bg-foreground/5"}`}>
            <AlertTriangle className="h-3 w-3" />{t("hr.hist.soloFallas", { n: conFallas.length })}
          </button>
        </div>
        {cargando ? (
          <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : mostradas.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">{soloFallas ? t("hr.hist.sinFallas") : t("hr.hist.sinGente")}</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {mostradas.map((p) => <PersonaFilaTurno key={p.userId} p={p} t={t} onClick={() => onPersona(p.userId)} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function Metrica({ label, valor, color }: { label: string; valor: number | null; color: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5 text-muted-foreground"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />{label}</span>
      <span className="font-semibold tabular-nums">{valor == null ? "—" : `${valor}%`}</span>
    </div>
  );
}

export function ArgosHistorial() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const hoy = useMemo(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" }), []);
  const [dia, setDia] = useState(hoy);
  const [turnoSel, setTurnoSel] = useState<Turno | null>(null);
  const esHoy = dia === hoy;
  const moverDia = (delta: number) => { const s = sumarDias(dia, delta); if (s <= hoy) setDia(s); };
  const { horas, cargando, error, refrescar } = useHorasDia(dia, true);
  const irAExpediente = (id: string) => navigate(`/hr/expediente/${id}`, { state: { volverA: "/hr/monitor-ia?t=historial" } });

  const data = useMemo(() => horas.map((h) => ({ hourNum: h.hourNum, pantalla: h.pantalla, camara: h.camara, atencion: h.atencion })), [horas]);
  const diaTxt = new Date(dia + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });

  const series: Array<{ key: "pantalla" | "camara" | "atencion"; label: string }> = [
    { key: "pantalla", label: t("hr.resumen.pantalla") },
    { key: "camara", label: t("hr.resumen.camara") },
    { key: "atencion", label: t("hr.resumen.atencion") },
  ];

  return (
    <section className="vidrio sube p-4 lg:p-5">
      <div className="v-cont space-y-5">
        {/* Cabecera + navegación de día */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-panel bg-primary/10 text-primary"><Clock className="h-[18px] w-[18px]" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-bold leading-tight tracking-tight">{t("hr.hist.titulo")}</h2>
            <div className="mt-0.5 flex items-center gap-1">
              <button type="button" onClick={() => moverDia(-1)} aria-label={t("hr.exp.diaAnterior")} className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /></button>
              <span className="min-w-[8.5rem] text-center text-xs capitalize text-muted-foreground">{esHoy ? `${t("hr.panel.hoy")} · ` : ""}{diaTxt}</span>
              <button type="button" onClick={() => moverDia(1)} disabled={esHoy} aria-label={t("hr.exp.diaSiguiente")} className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground disabled:opacity-30"><ChevronRight className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </div>

        {turnoSel ? (
          <TurnoDetalle
            turno={turnoSel}
            dia={dia}
            resumen={resumenTurno(horas, turnoSel.from, turnoSel.to)}
            t={t}
            onVolver={() => setTurnoSel(null)}
            onPersona={irAExpediente}
          />
        ) : error ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground"><AlertTriangle className="h-7 w-7 text-destructive/70" /><button type="button" onClick={() => void refrescar()} className="text-sm text-primary hover:underline">{t("hr.pantallazos.reintentar")}</button></div>
        ) : cargando && horas.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : horas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground"><Clock className="h-7 w-7 opacity-40" /><p className="text-sm">{t("hr.hist.vacio")}</p></div>
        ) : (
          <>
            {/* GRÁFICA por hora con las franjas de turno */}
            <div className="rounded-2xl border border-border/40 bg-card/20 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{t("hr.hist.porHora")}</span>
                <div className="ml-auto flex flex-wrap items-center gap-3">
                  {series.map((s) => (
                    <span key={s.key} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: COLOR[s.key] }} />{s.label}</span>
                  ))}
                </div>
              </div>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
                    {/* Franjas de turno al fondo */}
                    <ReferenceArea x1={0} x2={8} fill="hsl(255 70% 62%)" fillOpacity={0.06} />
                    <ReferenceArea x1={8} x2={16} fill="hsl(38 92% 55%)" fillOpacity={0.06} />
                    <ReferenceArea x1={16} x2={24} fill="hsl(199 89% 56%)" fillOpacity={0.06} />
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="hourNum" type="number" domain={[0, 24]} ticks={[0, 4, 8, 12, 16, 20, 24]} tickFormatter={(h) => `${h}h`} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} />
                    <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} unit="%" width={44} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12, color: "hsl(var(--popover-foreground))" }} labelStyle={{ color: "hsl(var(--muted-foreground))" }} labelFormatter={(h) => `${h}:00`} formatter={(v: number | null, name) => [v == null ? "—" : `${v}%`, name]} />
                    {series.map((s) => (
                      <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={COLOR[s.key]} strokeWidth={2} dot={{ r: 2, strokeWidth: 0, fill: COLOR[s.key] }} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* 3 CAJAS por turno */}
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t("hr.hist.turnos")}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {TURNOS.map((turno) => {
                  const r = resumenTurno(horas, turno.from, turno.to);
                  const Icono = turno.icon;
                  return (
                    <button
                      key={turno.key}
                      type="button"
                      onClick={() => setTurnoSel(turno)}
                      disabled={!r.hayDatos}
                      title={t("hr.hist.gente")}
                      className="rounded-2xl border border-border/40 bg-card/20 p-3.5 text-left transition hover:border-primary/40 hover:bg-card/40 disabled:cursor-default disabled:opacity-70 disabled:hover:border-border/40 disabled:hover:bg-card/20"
                    >
                      <div className="mb-2.5 flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: `${turno.color}1f`, color: turno.color }}><Icono className="h-4 w-4" /></span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold leading-tight">{t(turno.lbl)}</div>
                          <div className="text-[10px] text-muted-foreground">{t("hr.hist.horario", { a: turno.from, b: turno.to })}</div>
                        </div>
                        {r.hayDatos && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />}
                      </div>
                      {r.hayDatos ? (
                        <div className="space-y-1.5">
                          <Metrica label={t("hr.resumen.pantalla")} valor={r.pantalla} color={COLOR.pantalla} />
                          <Metrica label={t("hr.resumen.camara")} valor={r.camara} color={COLOR.camara} />
                          <Metrica label={t("hr.resumen.atencion")} valor={r.atencion} color={COLOR.atencion} />
                          <div className="mt-1.5 border-t border-border/40 pt-1.5 text-[11px] text-muted-foreground">{t("hr.hist.turnoPersonas", { n: r.personas })}</div>
                        </div>
                      ) : (
                        <p className="py-2 text-[11px] text-muted-foreground">{t("hr.hist.turnoSinDatos")}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
