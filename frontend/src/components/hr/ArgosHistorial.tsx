import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceArea } from "recharts";
import { Clock, Loader2, AlertTriangle, ChevronLeft, ChevronRight, Sunrise, Sun, Moon, Eye } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { LetraAvatar } from "@/components/vigilancia/piezas";
import { useHorasDia, type HoraDia } from "@/hooks/useHorasDia";
import { turnoDeEntrada, useTurnoPersonas, type PersonaTurno } from "@/hooks/useTurnoPersonas";
import { useDondeEsta } from "@/hooks/useDondeEsta";
import { armarDeptosDelDia, type MiembroRoster } from "@/lib/argosEquipo";
import { DetalleDepto, TarjetasDeDeptos } from "@/components/argos/Departamentos";
import type { TranslationKey } from "@/lib/i18n";

// HISTORIAL del día (Alvaro, 04/11): el día partido en 3 turnos (hora Colombia).
// ARRIBA la gráfica hora por hora (pantalla/cámara/atención del equipo) con el
// fondo dividido en franjas AM/PM/Madrugada; ABAJO 3 cajas, una por turno, con el
// resumen. Así el dueño ve el panorama: cómo estuvo la mañana, la tarde, la noche.
//
// 11/11 (Alvaro: «los cuadritos casi no se logran ver» y «las ⚠ parecen
// emojis»): las mismas tarjetas, con más contraste, radios chicos parejos y la
// misma altura; las fallas van en texto simple, sin el triángulo.

type Tr = (k: TranslationKey, v?: Record<string, string | number>) => string;

// Tonos APAGADOS, no neón (Alvaro 09/11: "los colores muy encendidos me hacen
// mierda"). Se bajó la saturación del azul (cámara) y el morado (atención) para
// que el número se insinúe, no grite. Pantalla sigue el primario de la skin.
// Diseño serio (Alvaro, 11/11): las tres líneas en tinta, distinguidas por el trazo.
const COLOR = { pantalla: "hsl(var(--foreground) / 0.85)", camara: "hsl(var(--foreground) / 0.55)", atencion: "hsl(var(--foreground) / 0.35)" } as const;
const TRAZO = { pantalla: undefined, camara: "6 4", atencion: "2 4" } as const;

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

type Turno = typeof TURNOS[number];

// Las FALLAS de una persona, sacadas de sus factores reales de la nota:
//   atención < 95 → tuvo pantallazos "fuera de lugar" (distraído)
//   cámara   < 80 → cámara apagada / sin cara buena parte del tiempo
//   pantalla < 80 → no compartió pantalla buena parte del tiempo
type TipoFalla = "fuera" | "camara" | "pantalla";
function tiposFallaDe(p: PersonaTurno): TipoFalla[] {
  const sub = (c: string) => p.nota.factores.find((x) => x.clave === c)?.sub ?? null;
  const out: TipoFalla[] = [];
  if ((sub("atencion") ?? 100) < 95) out.push("fuera");
  if ((sub("camara") ?? 100) < 80) out.push("camara");
  if ((sub("pantalla") ?? 100) < 80) out.push("pantalla");
  return out;
}
const FLAG_LBL: Record<TipoFalla, TranslationKey> = { fuera: "hr.hist.flagFuera", camara: "hr.hist.flagCamara", pantalla: "hr.hist.flagPantalla" };
function fallasDe(p: PersonaTurno, t: Tr): string[] {
  return tiposFallaDe(p).map((tf) => t(FLAG_LBL[tf]));
}

// Una persona del turno: cara, nombre, sus 3 factores, las fallas (chips) y la
// nota; clic → su expediente (y sus pantallazos de ese día). Peor → mejor.
// Nota como TILE de color TENUE (Alvaro 08/11: "vida con glow, tono apagado, no
// neón"). El color se insinúa, no grita.
function PersonaFilaTurno({ p, t, onClick }: { p: PersonaTurno; t: Tr; onClick: () => void }) {
  const f = (c: string) => p.nota.factores.find((x) => x.clave === c)?.sub ?? null;
  const txt = (v: number | null) => (v == null ? "—" : `${Math.round(v)}%`);
  const fallas = fallasDe(p, t);
  const notaTile = p.nota.valor != null && p.nota.valor < 60 ? "text-destructive" : "text-foreground";
  return (
    <button type="button" onClick={onClick} title={t("hr.hist.verExpediente")} className="group flex w-full items-center gap-4 rounded-control border border-border bg-background px-4 py-3 text-left transition hover:border-foreground/40">
      <LetraAvatar nombre={p.nombre || t("hr.noName")} tamano="md" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="truncate text-sm font-medium">{p.nombre || t("hr.noName")}</span>
          {/* Las fallas en texto simple (sin ⚠ ni pastillas). */}
          {fallas.length > 0 && <span className="text-xs font-medium text-destructive">{fallas.join(" · ")}</span>}
        </div>
        <div className="mt-0.5 flex flex-wrap gap-x-2.5 text-[11px] text-foreground/70">
          <span>{t("hr.resumen.pantalla")} <span className="tabular-nums">{txt(f("pantalla"))}</span></span>
          <span>{t("hr.resumen.camara")} <span className="tabular-nums">{txt(f("camara"))}</span></span>
          <span>{t("hr.resumen.atencion")} <span className="tabular-nums">{txt(f("atencion"))}</span></span>
        </div>
        {/* Horas trabajadas en el turno + entró/salió (Alvaro 05/11: "¿a qué horas?"). */}
        {(p.horasTurno > 0 || p.entroHHMM) && (
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-[11px] text-muted-foreground">
            <span className="tabular-nums font-semibold text-foreground/70">{p.horasTurno.toFixed(1)}h</span>
            {p.entroHHMM && (
              <span className="tabular-nums">
                · entró {p.entroHHMM}
                {p.tardeMin != null && p.tardeMin > 0 && <span className="ml-1 text-destructive">(+{p.tardeMin}m)</span>}
              </span>
            )}
            {p.salioHHMM && <span className="tabular-nums">· salió {p.salioHHMM}</span>}
          </div>
        )}
      </div>
      <span className={`shrink-0 font-display text-xl font-semibold tabular-nums ${notaTile}`}>{p.nota.valor ?? "—"}</span>
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
  const { personas: todas, cargando, error } = useTurnoPersonas(dia, turno.from, turno.to, true);
  // Solo la gente ASIGNADA a este turno por su horario (Alvaro, 08/11): Eric es
  // de madrugada y seguía conectado a las 8 → NO aparece en AM. Los que no tienen
  // horario asignado van a un apartado "Sin turno asignado", no se mezclan.
  const personas = todas.filter((p) => p.turnoAsignado === turno.key);
  const sinTurno = todas.filter((p) => p.turnoAsignado === null);
  const enProblema = personas.filter((p) => p.nota.valor != null && (p.nota.valor as number) < 60).length;
  const [vista, setVista] = useState<"personas" | "deptos">("deptos");
  const Icono = turno.icon;
  return (
    <div className="space-y-4">
      {/* Cabecera con volver */}
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onVolver} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"><ChevronLeft className="h-4 w-4" />{t("hr.hist.volver")}</button>
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: "hsl(var(--foreground) / 0.06)", color: "hsl(var(--muted-foreground))" }}><Icono className="h-4 w-4" /></span>
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
          <div key={m.lbl} className="flex min-h-[5.5rem] flex-col justify-center gap-1 rounded-control border border-border bg-background p-3 text-center">
            <div className={`font-display text-2xl font-semibold tabular-nums ${m.v != null && m.v < 60 ? "text-destructive" : ""}`}>{m.v == null ? "—" : `${m.v}%`}</div>
            <div className="text-[11px] font-medium text-foreground/75">{m.lbl}</div>
          </div>
        ))}
        <div className={`flex min-h-[5.5rem] flex-col justify-center gap-1 rounded-control border p-3 text-center bg-background ${enProblema > 0 ? "border-destructive/60" : "border-border"}`}>
          <div className={`font-display text-xl font-bold tabular-nums ${enProblema > 0 ? "text-destructive" : ""}`}>{enProblema}</div>
          <div className="text-[11px] font-medium text-foreground/75">{t("hr.hist.enProblemaLbl")}</div>
        </div>
      </div>

      {/* Alvaro 08/11: directo a la GENTE del turno (llegó tarde arriba), un clic
          → su expediente. El corte "Por departamento" queda como vista opcional
          (toggle), no un paso obligado que hacía dar vueltas. */}
      <div className="flex items-center justify-end">
        <div className="inline-flex rounded-control border border-border/60 bg-card/30 p-0.5 text-xs">
          <button type="button" onClick={() => setVista("personas")}
            className={`rounded-[6px] px-3 py-1 font-medium transition ${vista === "personas" ? "bg-foreground/[0.09] text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t("hr.hist.vistaPersonas")}
          </button>
          <button type="button" onClick={() => setVista("deptos")}
            className={`rounded-[6px] px-3 py-1 font-medium transition ${vista === "deptos" ? "bg-foreground/[0.09] text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t("hr.hist.vistaDeptos")}
          </button>
        </div>
      </div>
      {/* Un fallo se dice como fallo, nunca como «nadie trabajó». */}
      {error ? <p role="alert" className="py-6 text-center text-sm text-destructive">{t("argos.hist.fallo")}</p>
        : vista === "personas"
        ? <PersonasConFiltro personas={personas} cargando={cargando} t={t} onPersona={onPersona} />
        : <DeptosDelTurno personas={personas} cargando={cargando} t={t} onPersona={onPersona} turnoKey={turno.key} horas={turno.to - turno.from} />}

      {/* Apartado aparte: quienes estuvieron activos en esta franja pero NO tienen
          turno asignado. No se mezclan con los del turno. */}
      {!cargando && !error && sinTurno.length > 0 && (
        <details className="rounded-control border border-border bg-background p-4">
          <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground">
            {t("hr.hist.sinTurnoAsignado", { n: sinTurno.length })}
          </summary>
          <div className="mt-3">
            <PersonasConFiltro personas={sinTurno} cargando={false} t={t} onPersona={onPersona} />
          </div>
        </details>
      )}
    </div>
  );
}

// Los DEPARTAMENTOS de un turno (Alvaro 05/11; 11/11: «solo un 89 no me dice
// nada»): cada tarjeta dice cuántos vinieron, cuántos fueron bien, cuántos mal y
// quién no vino, y QUIÉN fue mal y por qué en minutos. Al tocarla, su gente:
// primero quien fue mal, luego quien fue bien, luego quien no vino.
/** La gente que DEBÍA estar (hoy en su horario): para decir quién no vino. */
function useRoster(filtro: (entrada: string | null) => boolean): MiembroRoster[] {
  const donde = useDondeEsta();
  return useMemo(() => (donde.data ?? [])
    .filter((f) => f.entrada && f.salida && filtro(f.entrada))
    .map((f) => {
      const [eh, em] = (f.entrada ?? "0:0").split(":").map(Number);
      const [sh, sm] = (f.salida ?? "0:0").split(":").map(Number);
      let min = sh * 60 + sm - (eh * 60 + em);
      if (min <= 0) min += 24 * 60;
      return { userId: f.user_id, nombre: f.nombre ?? "", equipo: f.equipo ?? "Otros", jornadaHoras: min / 60 };
    }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [donde.data]);
}

function DeptosDelTurno({ personas, cargando, t, onPersona, turnoKey, horas }: {
  personas: PersonaTurno[]; cargando: boolean; t: Tr; onPersona: (id: string) => void; turnoKey: string; horas: number;
}) {
  const [deptoSel, setDeptoSel] = useState<string | null>(null);
  const roster = useRoster((entrada) => turnoDeEntrada(entrada) === turnoKey);
  const armado = useMemo(() => armarDeptosDelDia(personas, roster, horas), [personas, roster, horas]);

  if (cargando) return <p className="py-8 text-center text-sm text-muted-foreground">{t("hr.hist.cargando")}</p>;
  if (armado.deptos.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">{t("hr.hist.sinGente")}</p>;
  const d = deptoSel ? armado.deptos.find((x) => x.nombre === deptoSel) ?? null : null;
  if (d) return <DetalleDepto d={d} vivo={false} regla={t("argos.equipo.reglaDia")} onVolver={() => setDeptoSel(null)} onPersona={onPersona} t={t} />;

  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Eye className="h-3.5 w-3.5" />{t("hr.hist.deptos")}</p>
      <TarjetasDeDeptos deptos={armado.deptos} onAbrir={setDeptoSel} t={t} vivo={false} />
    </div>
  );
}

// La LISTA de personas con filtros por tipo de falla, reutilizable (turno y
// equipo). Opcionalmente agrupada por equipo (subtítulos). Evita duplicar el
// filtro en dos lugares (barrido de coherencia, Alvaro 05/11).
function PersonasConFiltro({ personas, cargando, t, onPersona, agruparPorEquipo = false }: {
  personas: PersonaTurno[]; cargando: boolean; t: Tr; onPersona: (id: string) => void; agruparPorEquipo?: boolean;
}) {
  const [filtroTipo, setFiltroTipo] = useState<"todos" | TipoFalla>("todos");
  const conteos = {
    fuera: personas.filter((p) => tiposFallaDe(p).includes("fuera")).length,
    camara: personas.filter((p) => tiposFallaDe(p).includes("camara")).length,
    pantalla: personas.filter((p) => tiposFallaDe(p).includes("pantalla")).length,
  };
  // Alvaro 05/11: por defecto ORDENADAS POR HORA DE ENTRADA (los que llegaron
  // primero arriba). Los que no tengan entró quedan al final.
  const base = filtroTipo === "todos" ? personas : personas.filter((p) => tiposFallaDe(p).includes(filtroTipo));
  const mostradas = [...base].sort((a, b) => {
    const ea = a.entroHHMM ?? "99:99";
    const eb = b.entroHHMM ?? "99:99";
    return ea.localeCompare(eb) || a.nombre.localeCompare(b.nombre, "es");
  });
  const chips: Array<{ k: "todos" | TipoFalla; lbl: string; n?: number }> = [
    { k: "todos", lbl: t("hr.hist.filtroTodos") },
    { k: "fuera", lbl: t("hr.hist.filtroFuera"), n: conteos.fuera },
    { k: "camara", lbl: t("hr.hist.filtroCamara"), n: conteos.camara },
    { k: "pantalla", lbl: t("hr.hist.filtroPantalla"), n: conteos.pantalla },
  ];
  const grupos = agruparPorEquipo
    ? [...mostradas.reduce((m, p) => { (m.get(p.equipo) ?? m.set(p.equipo, []).get(p.equipo)!).push(p); return m; }, new Map<string, PersonaTurno[]>())].sort((a, b) => a[0].localeCompare(b[0], "es"))
    : null;
  const fila = (p: PersonaTurno) => <PersonaFilaTurno key={p.userId} p={p} t={t} onClick={() => onPersona(p.userId)} />;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <button key={c.k} type="button" onClick={() => setFiltroTipo(c.k)} className={`inline-flex items-center gap-1.5 rounded-control border px-3 py-1 text-xs font-medium transition ${filtroTipo === c.k ? "border-foreground/60 bg-foreground/[0.06] text-foreground" : "border-border text-muted-foreground hover:bg-foreground/5"}`}>
            {c.lbl}
            {c.n != null && c.n > 0 && <span className={`text-[11px] font-semibold tabular-nums ${filtroTipo === c.k ? "" : "text-destructive"}`}>{c.n}</span>}
          </button>
        ))}
      </div>
      {cargando ? (
        <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : mostradas.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted-foreground">{filtroTipo === "todos" ? t("hr.hist.sinGente") : t("hr.hist.sinFallas")}</p>
      ) : grupos ? (
        <div className="flex flex-col gap-4">
          {grupos.map(([eq, gente]) => (
            <div key={eq}>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">{eq} · {gente.length}</p>
              <div className="flex flex-col gap-1.5">{gente.map(fila)}</div>
            </div>
          ))}
        </div>
      ) : (
        // Alvaro 05/11: dentro del depto, separar en "Llegó tarde" arriba (rojo)
        // y "A tiempo" abajo. "Tarde" = pasó la tolerancia del rol/persona.
        (() => {
          const tarde = mostradas.filter((p) => p.tardeMin != null && p.tardeMin > 0);
          const puntuales = mostradas.filter((p) => !(p.tardeMin != null && p.tardeMin > 0));
          return (
            <div className="flex flex-col gap-4">
              {tarde.length > 0 && (
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <Clock className="h-3 w-3" />{t("hr.hist.secTarde", { n: tarde.length })}
                  </p>
                  <div className="flex flex-col gap-1.5">{tarde.map(fila)}</div>
                </div>
              )}
              {puntuales.length > 0 && (
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                    <Clock className="h-3 w-3" />{t("hr.hist.secATiempo", { n: puntuales.length })}
                  </p>
                  <div className="flex flex-col gap-1.5">{puntuales.map(fila)}</div>
                </div>
              )}
            </div>
          );
        })()
      )}
    </div>
  );
}

// VISTA EQUIPOS (Alvaro, 05/11; 11/11): el día entero, una tarjeta por equipo con
// cuántos vinieron, fueron bien, fueron mal y no vinieron, y quién fue mal y por
// qué. Al tocarla, su gente en ese orden.
function EquiposVista({ dia, t, onPersona, equipoInicial }: { dia: string; t: Tr; onPersona: (id: string, eq?: string) => void; equipoInicial?: string | null }) {
  const { personas, cargando, error } = useTurnoPersonas(dia, 0, 24, true);
  const [equipoSel, setEquipoSel] = useState<string | null>(equipoInicial ?? null);
  const roster = useRoster(() => true);
  const armado = useMemo(() => armarDeptosDelDia(personas, roster, 8), [personas, roster]);

  if (cargando) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (error) return <p role="alert" className="py-8 text-center text-sm text-destructive">{t("argos.hist.fallo")}</p>;
  if (armado.deptos.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">{t("hr.hist.sinGente")}</p>;
  const d = equipoSel ? armado.deptos.find((x) => x.nombre === equipoSel) ?? null : null;
  if (d) return <DetalleDepto d={d} vivo={false} regla={t("argos.equipo.reglaDia")} onVolver={() => setEquipoSel(null)} onPersona={(id) => onPersona(id, d.nombre)} t={t} />;
  return <TarjetasDeDeptos deptos={armado.deptos} onAbrir={setEquipoSel} t={t} vivo={false} />;
}

function Metrica({ label, valor, color }: { label: string; valor: number | null; color: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="flex items-center gap-1.5 text-foreground/75"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden />{label}</span>
      <span className={`font-semibold tabular-nums ${valor != null && valor < 60 ? "text-destructive" : ""}`}>{valor == null ? "—" : `${valor}%`}</span>
    </div>
  );
}

export function ArgosHistorial() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const hoy = useMemo(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" }), []);
  // Para que el "volver" desde el expediente regrese al MISMO lugar (equipo),
  // la vista y el equipo abierto viajan en la URL (Alvaro, 05/11).
  const [params] = useSearchParams();
  const [dia, setDia] = useState(hoy);
  const [turnoSel, setTurnoSel] = useState<Turno | null>(null);
  const [vista, setVista] = useState<"turno" | "equipos">(params.get("vista") === "equipos" ? "equipos" : "turno");
  const eqInicial = params.get("eq");
  const esHoy = dia === hoy;
  const moverDia = (delta: number) => { const s = sumarDias(dia, delta); if (s <= hoy) setDia(s); };
  const { horas, cargando, error, refrescar } = useHorasDia(dia, true);
  const irAExpediente = (id: string, eq?: string) => {
    const volverA = `/hr/monitor-ia?t=dia${eq ? `&vista=equipos&eq=${encodeURIComponent(eq)}` : ""}`;
    navigate(`/hr/expediente/${id}`, { state: { volverA } });
  };

  const data = useMemo(() => horas.map((h) => ({ hourNum: h.hourNum, pantalla: h.pantalla, camara: h.camara, atencion: h.atencion })), [horas]);
  const diaTxt = new Date(dia + "T12:00:00").toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });

  const series: Array<{ key: "pantalla" | "camara" | "atencion"; label: string }> = [
    { key: "pantalla", label: t("hr.resumen.pantalla") },
    { key: "camara", label: t("hr.resumen.camara") },
    { key: "atencion", label: t("hr.resumen.atencion") },
  ];

  return (
    <section className="rounded-control border border-border bg-card p-5 sm:p-6">
      <div className="v-cont space-y-5">
        {/* Cabecera + navegación de día */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control border border-border text-muted-foreground"><Clock className="h-[18px] w-[18px]" /></span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-bold leading-tight tracking-tight">{t("hr.hist.titulo")}</h2>
            <div className="mt-0.5 flex items-center gap-1">
              <button type="button" onClick={() => moverDia(-1)} aria-label={t("hr.exp.diaAnterior")} className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"><ChevronLeft className="h-3.5 w-3.5" /></button>
              <span className="min-w-[8.5rem] text-center text-xs capitalize text-muted-foreground">{esHoy ? `${t("hr.panel.hoy")} · ` : ""}{diaTxt}</span>
              <button type="button" onClick={() => moverDia(1)} disabled={esHoy} aria-label={t("hr.exp.diaSiguiente")} className="flex h-6 w-6 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground disabled:opacity-30"><ChevronRight className="h-3.5 w-3.5" /></button>
            </div>
          </div>
          {/* Toggle: ver por turno (gráfica + turnos) o por EQUIPO (cajas). */}
          <div className="flex shrink-0 items-center gap-1 rounded-control border border-border/60 bg-card/30 p-1">
            {([["turno", "hr.hist.porTurnoBtn"], ["equipos", "hr.hist.equiposBtn"]] as const).map(([v, k]) => (
              <button key={v} type="button" onClick={() => { setVista(v); setTurnoSel(null); }} className={`rounded-[6px] px-3 py-1 text-xs font-medium transition ${vista === v ? "bg-foreground/[0.09] text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {t(k)}
              </button>
            ))}
          </div>
        </div>

        {vista === "equipos" ? (
          <EquiposVista dia={dia} t={t} onPersona={irAExpediente} equipoInicial={eqInicial} />
        ) : turnoSel ? (
          <TurnoDetalle
            turno={turnoSel}
            dia={dia}
            resumen={resumenTurno(horas, turnoSel.from, turnoSel.to)}
            t={t}
            onVolver={() => setTurnoSel(null)}
            onPersona={irAExpediente}
          />
        ) : error ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground"><AlertTriangle className="h-7 w-7 text-destructive/70" /><button type="button" onClick={() => void refrescar()} className="text-sm text-foreground underline-offset-2 hover:underline">{t("hr.pantallazos.reintentar")}</button></div>
        ) : cargando && horas.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : horas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground"><Clock className="h-7 w-7 opacity-40" /><p className="text-sm">{t("hr.hist.vacio")}</p></div>
        ) : (
          <>
            {/* 3 CAJAS por turno — PRIMERO (Alvaro, 08/11): lo primero al entrar
                a "El día" es cómo va cada turno, no la gráfica. */}
            <div>
              <p className="mb-2 text-xs font-medium text-muted-foreground">{t("hr.hist.turnos")}</p>
              <div className="grid auto-rows-fr gap-3 sm:grid-cols-3">
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
                      className="flex h-full flex-col rounded-control border border-border bg-background p-5 text-left transition hover:border-foreground/40 disabled:cursor-default disabled:opacity-70"
                    >
                      <div className="mb-2.5 flex items-center gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full" style={{ background: "hsl(var(--foreground) / 0.06)", color: "hsl(var(--muted-foreground))" }}><Icono className="h-4 w-4" /></span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold leading-tight">{t(turno.lbl)}</div>
                          <div className="text-[11px] text-foreground/70">{t("hr.hist.horario", { a: turno.from, b: turno.to })}</div>
                        </div>
                        {r.hayDatos && <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" />}
                      </div>
                      {r.hayDatos ? (
                        <div className="space-y-1.5">
                          <Metrica label={t("hr.resumen.pantalla")} valor={r.pantalla} color={COLOR.pantalla} />
                          <Metrica label={t("hr.resumen.camara")} valor={r.camara} color={COLOR.camara} />
                          <Metrica label={t("hr.resumen.atencion")} valor={r.atencion} color={COLOR.atencion} />
                          <div className="mt-1.5 border-t border-border/50 pt-1.5 text-xs text-foreground/70">{t("hr.hist.turnoPersonas", { n: r.personas })}</div>
                        </div>
                      ) : (
                        <p className="py-2 text-[11px] text-muted-foreground">{t("hr.hist.turnoSinDatos")}</p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* GRÁFICA por hora — DESPUÉS de los turnos (la única del día). */}
            <div className="rounded-control border border-border bg-background p-5">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{t("hr.hist.porHora")}</span>
                <div className="ml-auto flex flex-wrap items-center gap-3">
                  {series.map((s) => (
                    <span key={s.key} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"><svg width="18" height="6" aria-hidden><line x1="0" y1="3" x2="18" y2="3" stroke={COLOR[s.key]} strokeWidth="2" strokeDasharray={TRAZO[s.key]} /></svg>{s.label}</span>
                  ))}
                </div>
              </div>
              <div className="h-60 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 6, right: 10, left: 0, bottom: 0 }}>
                    <ReferenceArea x1={8} x2={16} fill="hsl(var(--foreground))" fillOpacity={0.03} />
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                    <XAxis dataKey="hourNum" type="number" domain={[0, 24]} ticks={[0, 4, 8, 12, 16, 20, 24]} tickFormatter={(h) => `${h}h`} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} />
                    <YAxis domain={[0, 100]} ticks={[0, 25, 50, 75, 100]} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} axisLine={false} unit="%" width={44} />
                    <Tooltip contentStyle={{ background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 12, fontSize: 12, color: "hsl(var(--popover-foreground))" }} labelStyle={{ color: "hsl(var(--muted-foreground))" }} labelFormatter={(h) => `${h}:00`} formatter={(v: number | null, name) => [v == null ? "—" : `${v}%`, name]} />
                    {series.map((s) => (
                      <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={COLOR[s.key]} strokeWidth={2} strokeDasharray={TRAZO[s.key]} dot={{ r: 2, strokeWidth: 0, fill: COLOR[s.key] }} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
