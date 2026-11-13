import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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

// Tonos APAGADOS, no neón (Alvaro 09/11: "los colores muy encendidos me hacen
// mierda"). Se bajó la saturación del azul (cámara) y el morado (atención) para
// que el número se insinúe, no grite. Pantalla sigue el primario de la skin.
const COLOR = { pantalla: "hsl(var(--primary))", camara: "hsl(205 42% 62%)", atencion: "hsl(256 30% 66%)" } as const;

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

// INDICADORES (Alvaro, 13/11/2026: «es pobre, chiquito… indicadores… cuando me
// meto a Chatters deberían ser pequeñas tarjetitas donde vea cómo van»).
// Una barra fina por factor: el color insinúa (bien/ojo/mal), la cifra en blanco.
function Barra({ label, valor }: { label: string; valor: number | null }) {
  const v = valor == null ? null : Math.max(0, Math.min(100, valor));
  const color = v == null ? "bg-muted-foreground/30" : v >= 80 ? "bg-success/70" : v >= 60 ? "bg-warning/70" : "bg-destructive/70";
  return (
    <div className="flex items-center gap-2 text-[11px]">
      <span className="w-[4.5rem] shrink-0 truncate text-muted-foreground">{label}</span>
      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-foreground/10">
        <span className={`block h-full rounded-full ${color}`} style={{ width: `${v ?? 0}%` }} />
      </span>
      <span className="w-9 shrink-0 text-right tabular-nums text-foreground/85">{v == null ? "—" : `${Math.round(v)}%`}</span>
    </div>
  );
}
const PUNTO_BANDA: Record<string, string> = { bien: "bg-success", ojo: "bg-warning", mal: "bg-destructive" };

// Una persona como TARJETITA: cara y nombre, su nota grande, sus 3 barras, a qué
// hora entró (y si llegó tarde) y sus fallas con un puntito. Clic → expediente.
function PersonaTarjeta({ p, t, onClick }: { p: PersonaTurno; t: Tr; onClick: () => void }) {
  const f = (c: string) => p.nota.factores.find((x) => x.clave === c)?.sub ?? null;
  const fallas = tiposFallaDe(p);
  const tarde = p.tardeMin != null && p.tardeMin > 0;
  const mala = p.nota.banda === "mal";
  return (
    <button type="button" onClick={onClick} title={t("hr.hist.verExpediente")}
      className={`group flex flex-col gap-3 rounded-[14px] border bg-card/30 p-3.5 text-left transition-colors hover:bg-card/50 ${mala ? "border-destructive/50" : "border-border/50 hover:border-foreground/25"}`}>
      <div className="flex items-center gap-2.5">
        <UserAvatar name={p.nombre || t("hr.noName")} src={p.avatarUrl} seed={p.avatarSeed} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-foreground">{p.nombre || t("hr.noName")}</p>
          <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground tabular-nums">
            {p.entroHHMM ? t("hr.hist.entro", { h: p.entroHHMM }) : t("hr.hist.sinEntrada")}
            {tarde && <span className="inline-flex items-center gap-1 text-foreground/85"><span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden />+{p.tardeMin} min</span>}
            {p.horasTurno > 0 && <span>· {p.horasTurno.toFixed(1)}h</span>}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end">
          <span className="flex items-center gap-1.5 font-display text-2xl font-semibold leading-none tabular-nums text-foreground">
            {p.nota.banda && <span className={`h-1.5 w-1.5 rounded-full ${PUNTO_BANDA[p.nota.banda] ?? "bg-muted-foreground"}`} aria-hidden />}
            {p.nota.valor ?? "—"}
          </span>
          <span className="mt-0.5 text-[10px] text-muted-foreground">{t("hr.hist.nota")}</span>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Barra label={t("hr.resumen.pantalla")} valor={p.pantallaPct ?? f("pantalla")} />
        <Barra label={t("hr.resumen.camara")} valor={p.camaraPct ?? f("camara")} />
        <Barra label={t("hr.resumen.atencion")} valor={p.atencionPct ?? f("atencion")} />
      </div>
      {fallas.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {fallas.map((tf) => (
            <span key={tf} className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-foreground/[0.04] px-2 py-0.5 text-[10px] font-medium text-foreground/80">
              <span className={`h-1.5 w-1.5 rounded-full ${tf === "fuera" ? "bg-destructive" : "bg-warning"}`} aria-hidden />{t(FLAG_LBL[tf])}
            </span>
          ))}
        </div>
      )}
    </button>
  );
}

// Un grupo (departamento o equipo) como tarjeta de INDICADORES: nombre y gente,
// la nota promedio grande, las 3 barras promedio y cuántos con falla / tarde.
function TarjetaGrupo({ nombre, gente, nota, pantalla, camara, atencion, conFallas, conTarde, t, onClick }: {
  nombre: string; gente: number; nota: number | null; pantalla: number | null; camara: number | null; atencion: number | null;
  conFallas: number; conTarde: number; t: Tr; onClick: () => void;
}) {
  const banda = nota == null ? null : nota >= 80 ? "bien" : nota >= 60 ? "ojo" : "mal";
  return (
    <button type="button" onClick={onClick}
      className={`group vidrio vidrio-lift flex flex-col gap-3 p-4 text-left ${banda === "mal" ? "ring-1 ring-destructive/40" : ""}`}>
      <div className="v-cont flex flex-col gap-3">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-semibold text-foreground">{nombre}</p>
            <p className="text-[11px] text-muted-foreground tabular-nums">{t("hr.hist.deptoGente", { n: gente })}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end">
            <span className="flex items-center gap-1.5 font-display text-[28px] font-semibold leading-none tabular-nums text-foreground">
              {banda && <span className={`h-2 w-2 rounded-full ${PUNTO_BANDA[banda]}`} aria-hidden />}
              {nota ?? "—"}
            </span>
            <span className="mt-0.5 text-[10px] text-muted-foreground">{t("hr.hist.notaPromedio")}</span>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <Barra label={t("hr.resumen.pantalla")} valor={pantalla} />
          <Barra label={t("hr.resumen.camara")} valor={camara} />
          <Barra label={t("hr.resumen.atencion")} valor={atencion} />
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/40 pt-2.5 text-[11px] text-muted-foreground">
          {conFallas > 0 ? (
            <span className="inline-flex items-center gap-1.5 text-foreground/85"><span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden />{t("hr.hist.deptoConFallas", { n: conFallas })}</span>
          ) : (
            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />{t("hr.hist.deptoSinFallas")}</span>
          )}
          {conTarde > 0 && (
            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden />{t("hr.hist.deptoTarde", { n: conTarde })}</span>
          )}
          <ChevronRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground/60 transition group-hover:translate-x-0.5 group-hover:text-foreground" />
        </div>
      </div>
    </button>
  );
}
const promedio = (gente: PersonaTurno[], f: (p: PersonaTurno) => number | null) => {
  const v = gente.map(f).filter((x): x is number => x != null);
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
};

// PÁGINA de un turno (antes era pop-up, Alvaro 05/11): botón volver, diagnóstico
// (promedios + en problema), filtro "solo con fallas" y la gente del turno
// (peor → mejor, con chips de falla). Clic en alguien → su expediente.
function TurnoDetalle({ turno, dia, resumen, t, onVolver, onPersona }: {
  turno: Turno; dia: string; resumen: { pantalla: number | null; camara: number | null; atencion: number | null; personas: number };
  t: Tr; onVolver: () => void; onPersona: (id: string) => void;
}) {
  const { personas: todas, cargando } = useTurnoPersonas(dia, turno.from, turno.to, true);
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
          <div key={m.lbl} className="rounded-[12px] border border-border/50 bg-card/30 px-3 py-2.5">
            <div className="text-[11px] font-medium text-muted-foreground">{m.lbl}</div>
            <div className="mt-0.5 font-display text-xl font-semibold tabular-nums text-foreground">{m.v == null ? "—" : `${m.v}%`}</div>
          </div>
        ))}
        <div className={`rounded-[12px] border bg-card/30 px-3 py-2.5 ${enProblema > 0 ? "border-destructive/50" : "border-border/50"}`}>
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
            {enProblema > 0 && <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden />}{t("hr.hist.enProblemaLbl")}
          </div>
          <div className="mt-0.5 font-display text-xl font-semibold tabular-nums text-foreground">{enProblema}</div>
        </div>
      </div>

      {/* Alvaro 08/11: directo a la GENTE del turno (llegó tarde arriba), un clic
          → su expediente. El corte "Por departamento" queda como vista opcional
          (toggle), no un paso obligado que hacía dar vueltas. */}
      <div className="flex items-center justify-end">
        <div className="inline-flex rounded-full border border-border/50 bg-card/20 p-0.5 text-xs">
          <button type="button" onClick={() => setVista("personas")}
            className={`rounded-full px-3 py-1 font-medium transition ${vista === "personas" ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t("hr.hist.vistaPersonas")}
          </button>
          <button type="button" onClick={() => setVista("deptos")}
            className={`rounded-full px-3 py-1 font-medium transition ${vista === "deptos" ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
            {t("hr.hist.vistaDeptos")}
          </button>
        </div>
      </div>
      {vista === "personas"
        ? <PersonasConFiltro personas={personas} cargando={cargando} t={t} onPersona={onPersona} />
        : <DeptosDelTurno personas={personas} cargando={cargando} t={t} onPersona={onPersona} />}

      {/* Apartado aparte: quienes estuvieron activos en esta franja pero NO tienen
          turno asignado. No se mezclan con los del turno. */}
      {!cargando && sinTurno.length > 0 && (
        <details className="rounded-2xl border border-dashed border-border/40 bg-card/10 p-3">
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

// Cajas por departamento dentro de un turno + drill-in (Alvaro 05/11). Peor
// departamento primero (más con problema). Clic → ves solo esa gente.
function DeptosDelTurno({ personas, cargando, t, onPersona }: {
  personas: PersonaTurno[]; cargando: boolean; t: Tr; onPersona: (id: string) => void;
}) {
  const [deptoSel, setDeptoSel] = useState<string | null>(null);
  const deptos = useMemo(() => {
    const m = new Map<string, PersonaTurno[]>();
    for (const p of personas) (m.get(p.equipo) ?? m.set(p.equipo, []).get(p.equipo)!).push(p);
    return [...m.entries()].map(([nombre, gente]) => ({
      nombre,
      gente,
      total: gente.length,
      conFallas: gente.filter((p) => tiposFallaDe(p).length > 0).length,
      conTarde: gente.filter((p) => p.tardeMin != null && p.tardeMin > 0).length,
      notaProm: (() => {
        const con = gente.map((p) => p.nota.valor).filter((n): n is number => n != null);
        return con.length ? Math.round(con.reduce((a, b) => a + b, 0) / con.length) : null;
      })(),
    })).sort((a, b) =>
      // Primero los que tienen problema; luego por peor nota.
      (b.conFallas > 0 ? 1 : 0) - (a.conFallas > 0 ? 1 : 0)
      || (a.notaProm ?? 101) - (b.notaProm ?? 101)
      || a.nombre.localeCompare(b.nombre, "es"),
    );
  }, [personas]);

  if (cargando) return <p className="py-8 text-center text-sm text-muted-foreground">{t("hr.hist.cargando")}</p>;
  if (deptos.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">{t("hr.hist.sinGente")}</p>;

  // Drill: gente del depto seleccionado (con los mismos filtros de tipo).
  if (deptoSel) {
    const d = deptos.find((x) => x.nombre === deptoSel);
    if (!d) { setDeptoSel(null); return null; }
    return (
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button type="button" onClick={() => setDeptoSel(null)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"><ChevronLeft className="h-4 w-4" />{t("hr.hist.volverDeptos")}</button>
          <span className="flex items-center gap-2 text-sm">
            <span className="font-semibold">{d.nombre}</span>
            <span className="text-xs text-muted-foreground">· {t("hr.hist.deptoGente", { n: d.total })}{d.conFallas > 0 ? ` · ${t("hr.hist.deptoConFallas", { n: d.conFallas })}` : ""}</span>
          </span>
        </div>
        <PersonasConFiltro personas={d.gente} cargando={false} t={t} onPersona={onPersona} />
      </div>
    );
  }

  return (
    <div>
      <p className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground"><Eye className="h-3.5 w-3.5" />{t("hr.hist.deptos")}</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {deptos.map((d) => (
          <TarjetaGrupo key={d.nombre} nombre={d.nombre} gente={d.total} nota={d.notaProm}
            pantalla={promedio(d.gente, (p) => p.pantallaPct)} camara={promedio(d.gente, (p) => p.camaraPct)} atencion={promedio(d.gente, (p) => p.atencionPct)}
            conFallas={d.conFallas} conTarde={d.conTarde} t={t} onClick={() => setDeptoSel(d.nombre)} />
        ))}
      </div>
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
  const fila = (p: PersonaTurno) => <PersonaTarjeta key={p.userId} p={p} t={t} onClick={() => onPersona(p.userId)} />;
  const REJILLA = "grid gap-3 sm:grid-cols-2 xl:grid-cols-3";
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <button key={c.k} type="button" onClick={() => setFiltroTipo(c.k)} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${filtroTipo === c.k ? "border-foreground/30 bg-foreground/10 text-foreground" : "border-border/50 text-muted-foreground hover:bg-foreground/5"}`}>
            {c.lbl}
            {c.n != null && c.n > 0 && <span className="rounded-full bg-foreground/10 px-1.5 py-0.5 text-[10px] tabular-nums text-foreground/85">{c.n}</span>}
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
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">{eq} · {gente.length}</p>
              <div className={REJILLA}>{gente.map(fila)}</div>
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
                  <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <Clock className="h-3 w-3 text-warning/70" />{t("hr.hist.secTarde", { n: tarde.length })}
                  </p>
                  <div className={REJILLA}>{tarde.map(fila)}</div>
                </div>
              )}
              {puntuales.length > 0 && (
                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/70">
                    <Clock className="h-3 w-3" />{t("hr.hist.secATiempo", { n: puntuales.length })}
                  </p>
                  <div className={REJILLA}>{puntuales.map(fila)}</div>
                </div>
              )}
            </div>
          );
        })()
      )}
    </div>
  );
}

// VISTA EQUIPOS (Alvaro, 05/11): cajas por equipo (Chatters, PR, Warming,
// Editores, Finanzas…) con su promedio; clic en una caja = la gente de ese
// equipo (con los mismos filtros por tipo de falla). Peor equipo primero.
function EquiposVista({ dia, t, onPersona, equipoInicial }: { dia: string; t: Tr; onPersona: (id: string, eq?: string) => void; equipoInicial?: string | null }) {
  const { personas, cargando } = useTurnoPersonas(dia, 0, 24, true);
  const [equipoSel, setEquipoSel] = useState<string | null>(equipoInicial ?? null);
  const equipos = useMemo(() => {
    const m = new Map<string, PersonaTurno[]>();
    for (const p of personas) (m.get(p.equipo) ?? m.set(p.equipo, []).get(p.equipo)!).push(p);
    const avg = (gente: PersonaTurno[], f: (p: PersonaTurno) => number | null) => {
      const v = gente.map(f).filter((x): x is number => x != null);
      return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
    };
    return [...m.entries()].map(([eq, gente]) => {
      const conNota = gente.filter((p) => p.nota.valor != null);
      return {
        eq, gente,
        nota: conNota.length ? Math.round(conNota.reduce((a, p) => a + (p.nota.valor as number), 0) / conNota.length) : null,
        pantalla: avg(gente, (p) => p.pantallaPct), camara: avg(gente, (p) => p.camaraPct), atencion: avg(gente, (p) => p.atencionPct),
        conFallas: gente.filter((p) => tiposFallaDe(p).length > 0).length,
      };
    }).sort((a, b) => (a.nota ?? 101) - (b.nota ?? 101));
  }, [personas]);

  if (equipoSel) {
    const gente = personas.filter((p) => p.equipo === equipoSel);
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setEquipoSel(null)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground"><ChevronLeft className="h-4 w-4" />{t("hr.hist.volverEquipos")}</button>
          <span className="font-display text-base font-bold">{equipoSel}</span>
          <span className="text-xs text-muted-foreground">· {gente.length}</span>
        </div>
        <PersonasConFiltro personas={gente} cargando={cargando} t={t} onPersona={(id) => onPersona(id, equipoSel ?? undefined)} />
      </div>
    );
  }
  if (cargando) return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (equipos.length === 0) return <p className="py-8 text-center text-sm text-muted-foreground">{t("hr.hist.sinGente")}</p>;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {equipos.map((e) => (
        <TarjetaGrupo key={e.eq} nombre={e.eq} gente={e.gente.length} nota={e.nota}
          pantalla={e.pantalla} camara={e.camara} atencion={e.atencion}
          conFallas={e.conFallas} conTarde={e.gente.filter((p) => p.tardeMin != null && p.tardeMin > 0).length}
          t={t} onClick={() => setEquipoSel(e.eq)} />
      ))}
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
          {/* Toggle: ver por turno (gráfica + turnos) o por EQUIPO (cajas). */}
          <div className="flex shrink-0 items-center gap-1 rounded-xl border border-border/50 bg-card/20 p-1">
            {([["turno", "hr.hist.porTurnoBtn"], ["equipos", "hr.hist.equiposBtn"]] as const).map(([v, k]) => (
              <button key={v} type="button" onClick={() => { setVista(v); setTurnoSel(null); }} className={`rounded-lg px-3 py-1 text-xs font-medium transition ${vista === v ? "bg-primary/15 text-primary" : "text-muted-foreground hover:text-foreground"}`}>
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
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground"><AlertTriangle className="h-7 w-7 text-destructive/70" /><button type="button" onClick={() => void refrescar()} className="text-sm text-primary hover:underline">{t("hr.pantallazos.reintentar")}</button></div>
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

            {/* GRÁFICA por hora — DESPUÉS de los turnos (la única del día). */}
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
          </>
        )}
      </div>
    </section>
  );
}
