import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle, CalendarDays, ChevronLeft, ChevronRight, ClipboardList, Loader2, RefreshCw, Search, X,
} from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { UserAvatar } from "@/components/UserAvatar";
import { a12 } from "@/lib/horaBogota";
import { horaBogota } from "@/lib/llegadas";
import { hoyEnBogota } from "@/hooks/useHoyDelEquipo";
import { useTurnoTabla } from "@/hooks/useTurnoTabla";
import {
  ordenarPorAtencion, seccionDe, semanaDe, sumarDias, turnosDelDia,
  type FilaTurno, type Motivo, type Nivel, type Seccion,
} from "@/lib/turnoTabla";

// LA TABLA DEL TURNO — la primera pestaña de Argos (Alvaro, 25/11/2026): «poder
// ver esto fácil, al grano, echar el chequeo de los empleados… el equivalente a
// tener un supervisor de personas». Arriba, a quién mirar y por qué; debajo una
// fila por persona con las mismas cinco cosas: llegada/salida, comida, baño,
// avisos de Argos y conexión. Tocar la fila abre su expediente EN ESE DÍA.
//
// Estilo: el de Argos, sin colores nuevos. La cifra va en blanco y el nivel en un
// puntito al lado, siempre con texto que dice lo mismo (el color nunca es la única
// señal). Lo que va bien no lleva puntito.

type Tr = (k: TranslationKey, vars?: Record<string, string | number>) => string;
type Filtro = "todos" | "mirar" | "tarde" | "noEsta" | "pausas";

const PUNTO: Record<Nivel | "ahora", string> = {
  ok: "",
  ambar: "bg-warning",
  rojo: "bg-destructive",
  ahora: "bg-primary",
};

const hora = (msx: number | null | undefined) => (msx == null ? "—" : horaBogota(new Date(msx).toISOString()));
const horaCorta = (msx: number) => hora(msx).replace(/\s?(AM|PM)$/i, "");

function duracion(t: Tr, minutos: number): string {
  if (minutos < 60) return t("hr.turno.min", { n: minutos });
  return t("hr.turno.horas", { h: Math.floor(minutos / 60), m: String(minutos % 60).padStart(2, "0") });
}

/** La frase de Argos para un motivo. */
function frase(t: Tr, m: Motivo): string {
  switch (m.k) {
    case "noVino": return t("hr.turno.motivo.noVino");
    case "noLlega": return t("hr.turno.motivo.noLlega", { d: duracion(t, m.min) });
    case "seFue": return t("hr.turno.motivo.seFue", { d: duracion(t, m.min) });
    case "ignoro": return t(m.n === 1 ? "hr.turno.motivo.ignoro1" : "hr.turno.motivo.ignoro", { n: m.n });
    case "tarde": return t("hr.turno.motivo.tarde", { d: duracion(t, m.min) });
    case "pocoActivo": return t("hr.turno.motivo.pocoActivo", { n: m.pct });
    case "comida": return t("hr.turno.motivo.comida", { n: m.min });
    case "bano": return t("hr.turno.motivo.bano", { n: m.min });
    case "avisos": return t("hr.turno.motivo.avisos", { n: m.n });
    case "cortes": return t("hr.turno.motivo.cortes", { n: m.n });
    case "sinMarca": return t("hr.turno.motivo.sinMarca");
    case "sinCierre": return t("hr.turno.motivo.sinCierre");
  }
}

function Punto({ nivel, etiqueta }: { nivel: Nivel | "ahora"; etiqueta?: string }) {
  if (nivel === "ok") return null;
  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO[nivel]}`} aria-label={etiqueta} role={etiqueta ? "img" : undefined} />;
}

/** Una celda: dato arriba (blanco) y detalle abajo (gris), con el puntito al lado del detalle. */
function Celda({ arriba, abajo, nivel = "ok", tenue = false }: { arriba: string; abajo?: string; nivel?: Nivel | "ahora"; tenue?: boolean }) {
  return (
    <div className="min-w-0">
      <p className={`truncate text-sm tabular-nums ${tenue ? "text-muted-foreground" : "text-foreground"}`}>{arriba}</p>
      {abajo && (
        <p className="flex items-center gap-1.5 truncate text-[11px] text-muted-foreground">
          <Punto nivel={nivel} />
          <span className="truncate">{abajo}</span>
        </p>
      )}
    </div>
  );
}

// ── Lo que dice cada celda ────────────────────────────────────────────────────

function celdaLlegada(t: Tr, f: FilaTurno): { arriba: string; abajo: string; nivel: Nivel | "ahora"; tenue: boolean } {
  if (f.empiezaLuego) return { arriba: t("hr.turno.empieza", { h: a12(f.entrada) ?? "" }), abajo: "", nivel: "ok", tenue: true };
  if (f.noVino) return { arriba: t("hr.turno.noVino"), abajo: t("hr.turno.debia", { h: a12(f.entrada) ?? "" }), nivel: "rojo", tenue: false };
  if (f.llegada == null && f.noLlegaMin != null) {
    return { arriba: t("hr.turno.noLlega"), abajo: t("hr.turno.haceMin", { d: duracion(t, f.noLlegaMin) }), nivel: f.nivelLlegada, tenue: false };
  }
  if (f.llegada == null) return { arriba: "—", abajo: "", nivel: "ok", tenue: true };
  const arriba = hora(f.llegada);
  let abajo: string;
  let nivel: Nivel | "ahora" = "ok";
  if (f.antesMin != null && f.salidaAt != null) {
    abajo = t("hr.turno.seFueAntes", { h: hora(f.salidaAt), d: duracion(t, f.antesMin) });
    nivel = f.nivelLlegada;
  } else if (f.enCurso) {
    abajo = f.tardeMin != null ? t("hr.turno.tardeEnTurno", { d: duracion(t, f.tardeMin) }) : t("hr.turno.enTurno");
    nivel = f.tardeMin != null ? f.nivelLlegada : "ok";
  } else if (f.salidaAt != null) {
    const cierre = f.cierre === "sistema" ? t("hr.turno.cerroSistema") : f.cierre === "olvido" ? t("hr.turno.olvidoCerrar") : "";
    abajo = [f.tardeMin != null ? t("hr.turno.tardeMin", { d: duracion(t, f.tardeMin) }) : null, t("hr.turno.salio", { h: hora(f.salidaAt) }), cierre || null]
      .filter(Boolean).join(" · ");
    nivel = f.nivelLlegada;
  } else {
    abajo = f.tardeMin != null ? t("hr.turno.tardeMin", { d: duracion(t, f.tardeMin) }) : "";
    nivel = f.nivelLlegada;
  }
  if (f.sinMarca) abajo = [abajo, t("hr.turno.soloMarca")].filter(Boolean).join(" · ");
  return { arriba, abajo, nivel, tenue: false };
}

function celdaComida(t: Tr, f: FilaTurno): { arriba: string; abajo: string; nivel: Nivel | "ahora"; tenue: boolean } {
  const tope = t("hr.turno.deTope", { n: f.comidaMin, tope: f.comidaTope });
  if (f.comidaAhora != null) {
    return { arriba: t("hr.turno.fueraDesde", { h: hora(f.comidaAhora) }), abajo: tope, nivel: f.nivelComida === "ok" ? "ahora" : f.nivelComida, tenue: false };
  }
  if (!f.comida.length) {
    if (f.empiezaLuego) return { arriba: "", abajo: "", nivel: "ok", tenue: true };
    if (f.comidaTope === 0) return { arriba: t("hr.turno.sinPlanComida"), abajo: "", nivel: "ok", tenue: true };
    return { arriba: f.enCurso ? t("hr.turno.aunNo") : t("hr.turno.sinRegistro"), abajo: "", nivel: "ok", tenue: true };
  }
  const rangos = f.comida.map((c) => `${horaCorta(c.inicio)}–${c.fin != null ? hora(c.fin) : "…"}`);
  const arriba = rangos.length <= 2 ? rangos.join(", ") : `${horaCorta(f.comida[0].inicio)} … ${hora(f.comida[f.comida.length - 1].fin ?? f.comida[f.comida.length - 1].inicio)}`;
  const abajo = rangos.length > 2 ? `${t("hr.turno.salidas", { n: rangos.length })} · ${tope}` : tope;
  return { arriba, abajo, nivel: f.nivelComida, tenue: false };
}

function celdaBano(t: Tr, f: FilaTurno): { arriba: string; abajo: string; nivel: Nivel | "ahora"; tenue: boolean } {
  if (f.empiezaLuego) return { arriba: "", abajo: "", nivel: "ok", tenue: true };
  if (f.banoAhora != null) return { arriba: t("hr.turno.enBano"), abajo: t("hr.turno.deTope", { n: f.banoMin, tope: f.banoTope }), nivel: f.nivelBano === "ok" ? "ahora" : f.nivelBano, tenue: false };
  if (!f.banos) return { arriba: "0", abajo: "", nivel: "ok", tenue: true };
  return {
    arriba: t(f.banos === 1 ? "hr.turno.idas1" : "hr.turno.idas", { n: f.banos }),
    abajo: t("hr.turno.deTope", { n: f.banoMin, tope: f.banoTope }),
    nivel: f.nivelBano,
    tenue: false,
  };
}

function celdaAvisos(t: Tr, f: FilaTurno): { arriba: string; abajo: string; nivel: Nivel | "ahora"; tenue: boolean } {
  if (f.empiezaLuego) return { arriba: "", abajo: "", nivel: "ok", tenue: true };
  if (f.avisoAbierto) {
    return { arriba: String(f.avisos), abajo: t("hr.turno.avisandoAhora", { que: t(tipoAviso(f.avisoAbierto)) }), nivel: f.nivelAvisos === "ok" ? "ahora" : f.nivelAvisos, tenue: false };
  }
  if (!f.avisos) return { arriba: "0", abajo: "", nivel: "ok", tenue: true };
  const abajo = f.ignorados > 0
    ? t("hr.turno.ignorados", { n: f.ignorados })
    : f.corregidos === f.avisos ? t("hr.turno.corrigioTodos") : resumenTipos(t, f.avisosPorTipo);
  return { arriba: String(f.avisos), abajo, nivel: f.nivelAvisos, tenue: false };
}

function tipoAviso(tipo: string): TranslationKey {
  return tipo === "camara_apagada" ? "hr.turno.aviso.camara" : tipo === "sin_pantalla" ? "hr.turno.aviso.pantalla" : tipo === "fuera_cuadro" ? "hr.turno.aviso.cuadro" : "hr.turno.aviso.otro";
}

function resumenTipos(t: Tr, tipos: Record<string, number>): string {
  return Object.entries(tipos).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${t(tipoAviso(k))} ${n}`).join(" · ");
}

function celdaConexion(t: Tr, f: FilaTurno): { arriba: string; abajo: string; nivel: Nivel | "ahora"; tenue: boolean } {
  if (f.empiezaLuego || (f.conectadoMin === 0 && f.cortes === 0)) return { arriba: f.empiezaLuego ? "" : "—", abajo: "", nivel: "ok", tenue: true };
  const arriba = f.enCurso ? t("hr.turno.hastaAhora", { d: duracion(t, f.conectadoMin) }) : duracion(t, f.conectadoMin);
  const activo = f.conectadoMin > 0 ? Math.round((f.activoMin / f.conectadoMin) * 100) : 0;
  const partes = [t("hr.turno.activo", { n: activo })];
  partes.push(f.cortes ? t(f.cortes === 1 ? "hr.turno.corte1" : "hr.turno.cortes", { n: f.cortes, m: f.cortesMin }) : t("hr.turno.sinCortes"));
  return { arriba, abajo: partes.join(" · "), nivel: f.nivelConexion, tenue: false };
}

// ── La pantalla ───────────────────────────────────────────────────────────────

const TITULO_SECCION: Record<Seccion, TranslationKey> = {
  mirar: "hr.turno.sec.mirar",
  ojo: "hr.turno.sec.ojo",
  bien: "hr.turno.sec.bien",
  luego: "hr.turno.sec.luego",
};

export function TurnoTabla() {
  const { t, language } = useLanguage();
  const navegar = useNavigate();
  const [params, setParams] = useSearchParams();
  const hoy = hoyEnBogota();
  const diaURL = params.get("dia");
  const dia = diaURL && /^\d{4}-\d{2}-\d{2}$/.test(diaURL) && diaURL <= hoy ? diaURL : hoy;
  const esHoy = dia === hoy;
  const irA = (d: string) => setParams((prev) => { const n = new URLSearchParams(prev); n.set("t", "turno"); if (d === hoy) n.delete("dia"); else n.set("dia", d); return n; }, { replace: true });

  const q = useTurnoTabla(dia, esHoy);
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [turno, setTurno] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  const [calAbierto, setCalAbierto] = useState(false);

  const locale = language === "es" ? "es-CO" : language;
  const fmtDia = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T12:00:00-05:00`).toLocaleDateString(locale, { timeZone: "America/Bogota", ...o });

  const filas = useMemo(() => q.data?.filas ?? [], [q.data]);
  const turnos = useMemo(() => turnosDelDia(filas), [filas]);
  const delTurno = useMemo(() => filas.filter((f) => !turno || `${f.entrada}–${f.salida}` === turno), [filas, turno]);
  const pasa = (f: FilaTurno, k: Filtro) =>
    k === "todos" ? true
      : k === "mirar" ? f.nivel !== "ok" && !f.empiezaLuego
        : k === "tarde" ? f.tardeMin != null
          : k === "noEsta" ? f.noVino || f.noLlegaMin != null
            : f.nivelComida !== "ok" || f.nivelBano !== "ok";
  const conteo = useMemo(() => {
    const c: Record<Filtro, number> = { todos: 0, mirar: 0, tarde: 0, noEsta: 0, pausas: 0 };
    for (const f of delTurno) for (const k of Object.keys(c) as Filtro[]) if (pasa(f, k)) c[k]++;
    return c;
  }, [delTurno]);
  const texto = buscar.trim().toLocaleLowerCase();
  const vistas = useMemo(
    () => ordenarPorAtencion(delTurno.filter((f) => pasa(f, filtro) && (!texto || f.nombre.toLocaleLowerCase().includes(texto)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [delTurno, filtro, texto],
  );
  const secciones = useMemo(() => {
    const m: Record<Seccion, FilaTurno[]> = { mirar: [], ojo: [], bien: [], luego: [] };
    for (const f of vistas) m[seccionDe(f)].push(f);
    return m;
  }, [vistas]);
  const paraMirar = useMemo(() => ordenarPorAtencion(delTurno.filter((f) => f.nivel !== "ok" && !f.empiezaLuego)), [delTurno]);
  const ahoraComiendo = delTurno.filter((f) => f.comidaAhora != null).length;
  const ahoraBano = delTurno.filter((f) => f.banoAhora != null).length;
  const ahoraAviso = delTurno.filter((f) => f.avisoAbierto).length;

  const abrir = (f: FilaTurno) =>
    navegar(`/hr/expediente/${f.userId}?dia=${dia}`, { state: { volverA: `/hr/monitor-ia?t=turno${esHoy ? "" : `&dia=${dia}`}` } });

  const semana = semanaDe(dia);

  const ficha = (k: Filtro, etiqueta: string, nivel: Nivel | null) => (
    <button
      key={k}
      type="button"
      onClick={() => setFiltro(k)}
      aria-pressed={filtro === k}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition ${filtro === k ? "border-primary/60 bg-primary/15 text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground"}`}
    >
      {nivel && <Punto nivel={nivel} />}
      {etiqueta}
      <span className="tabular-nums text-muted-foreground">{conteo[k]}</span>
    </button>
  );

  const Fila = ({ f }: { f: FilaTurno }) => {
    const ll = celdaLlegada(t, f), co = celdaComida(t, f), ba = celdaBano(t, f), av = celdaAvisos(t, f), cx = celdaConexion(t, f);
    const foto = q.fotos[f.userId];
    const motivo = f.motivos[0] ? frase(t, f.motivos[0]) : null;
    const mas = f.motivos.length - 1;
    const horario = f.entrada && f.salida ? `${a12(f.entrada)} – ${a12(f.salida)}` : t("hr.turno.sinHorario");
    return (
      <button
        type="button"
        onClick={() => abrir(f)}
        className="group grid w-full grid-cols-1 gap-2 rounded-2xl border border-border/40 bg-card/20 px-3 py-2.5 text-left transition hover:border-border hover:bg-foreground/[0.04] md:grid-cols-[minmax(12rem,1.6fr)_1fr_1.1fr_0.8fr_0.9fr_1fr_1rem] md:items-center md:gap-3 md:rounded-xl md:border-transparent md:bg-transparent md:py-2"
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="relative shrink-0">
            <UserAvatar name={f.nombre} src={foto?.foto} seed={foto?.seed} size="sm" />
            {f.nivel !== "ok" && !f.empiezaLuego && (
              <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${PUNTO[f.nivel]}`} aria-label={t(f.nivel === "rojo" ? "hr.turno.sec.mirar" : "hr.turno.sec.ojo")} role="img" />
            )}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{f.nombre}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {motivo ? <>{motivo}{mas > 0 ? ` · +${mas}` : ""}</> : horario}
            </p>
            {motivo && <p className="truncate text-[11px] text-muted-foreground/70">{horario}</p>}
          </div>
        </div>
        {/* En angosto, las cinco cosas en dos columnas con su etiqueta. */}
        <div className="grid grid-cols-2 gap-x-3 gap-y-2 pl-11 md:contents">
          {[
            [t("hr.turno.col.llegada"), ll], [t("hr.turno.col.comida"), co], [t("hr.turno.col.bano"), ba],
            [t("hr.turno.col.avisos"), av], [t("hr.turno.col.conexion"), cx],
          ].map(([etq, c]) => {
            const x = c as ReturnType<typeof celdaLlegada>;
            return (
              <div key={etq as string} className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70 md:hidden">{etq as string}</p>
                <Celda arriba={x.arriba || " "} abajo={x.abajo} nivel={x.nivel} tenue={x.tenue} />
              </div>
            );
          })}
        </div>
        <ChevronRight className="hidden h-4 w-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-foreground md:block" />
      </button>
    );
  };

  return (
    <section className="vidrio sube p-4 lg:p-5">
      <div className="v-cont flex flex-col gap-4">
        {/* Encabezado + tira de la semana */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-foreground/[0.04] text-foreground/75">
            <ClipboardList className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-bold leading-tight tracking-tight">{t("hr.turno.titulo")}</h2>
            <p className="text-xs capitalize text-muted-foreground">
              {esHoy ? `${t("hr.turno.hoy")} · ` : ""}{fmtDia(dia, { weekday: "long", day: "numeric", month: "long" })}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 overflow-x-auto">
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full" onClick={() => irA(sumarDias(dia, -7))} aria-label={t("hr.turno.semanaAnterior")}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {semana.map((d) => {
            const futuro = d > hoy;
            const activo = d === dia;
            return (
              <button
                key={d}
                type="button"
                disabled={futuro}
                onClick={() => irA(d)}
                aria-current={activo ? "date" : undefined}
                className={`flex min-w-[3.25rem] shrink-0 flex-col items-center rounded-xl px-2 py-1.5 text-xs transition ${activo ? "bg-primary text-primary-foreground shadow-sm" : futuro ? "text-muted-foreground/40" : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"}`}
              >
                <span className="capitalize">{fmtDia(d, { weekday: "short" }).replace(".", "")}</span>
                <span className="text-sm font-semibold tabular-nums">{fmtDia(d, { day: "numeric" })}</span>
                {d === hoy && <span className={`text-[9px] uppercase ${activo ? "" : "text-primary"}`}>{t("hr.turno.hoy")}</span>}
              </button>
            );
          })}
          <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 rounded-full" disabled={sumarDias(semana[0], 7) > hoy} onClick={() => irA(sumarDias(dia, 7) > hoy ? hoy : sumarDias(dia, 7))} aria-label={t("hr.turno.semanaSiguiente")}>
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Popover open={calAbierto} onOpenChange={setCalAbierto}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="ml-1 shrink-0 rounded-full" aria-label={t("hr.turno.elegirDia")}>
                <CalendarDays className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">{t("hr.turno.elegirDia")}</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-0">
              <Calendar
                mode="single"
                selected={new Date(`${dia}T12:00:00`)}
                disabled={(d) => d > new Date(`${hoy}T23:59:59`)}
                onSelect={(d) => {
                  if (!d) return;
                  const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                  irA(s);
                  setCalAbierto(false);
                }}
                initialFocus
              />
            </PopoverContent>
          </Popover>
          {!esHoy && (
            <Button variant="ghost" size="sm" className="shrink-0 rounded-full" onClick={() => irA(hoy)}>{t("hr.turno.irHoy")}</Button>
          )}
        </div>

        {q.isLoading ? (
          <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : q.isError ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
            <span className="min-w-0 flex-1">{t("hr.turno.fallo")}</span>
            <Button variant="outline" size="sm" onClick={() => void q.refetch()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("hr.donde.reintentar")}</Button>
          </div>
        ) : !filas.length ? (
          <p className="rounded-2xl border border-dashed border-border/50 p-6 text-center text-sm text-muted-foreground">{t("hr.turno.vacio")}</p>
        ) : (
          <>
            {/* EL PARTE DE ARGOS: a quién mirar y por qué. */}
            <div className="rounded-2xl border border-border/50 bg-card/30 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Punto nivel={paraMirar.some((f) => f.nivel === "rojo") ? "rojo" : paraMirar.length ? "ambar" : "ok"} />
                {paraMirar.length
                  ? t(paraMirar.length === 1 ? "hr.turno.parte.uno" : "hr.turno.parte.varios", { n: paraMirar.length, total: delTurno.filter((f) => !f.empiezaLuego).length })
                  : t("hr.turno.parte.limpio", { total: delTurno.filter((f) => !f.empiezaLuego).length })}
              </p>
              {esHoy && (ahoraComiendo + ahoraBano + ahoraAviso > 0) && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {[
                    ahoraComiendo ? t("hr.turno.ahora.comiendo", { n: ahoraComiendo }) : null,
                    ahoraBano ? t("hr.turno.ahora.bano", { n: ahoraBano }) : null,
                    ahoraAviso ? t("hr.turno.ahora.aviso", { n: ahoraAviso }) : null,
                  ].filter(Boolean).join(" · ")}
                </p>
              )}
              {paraMirar.length > 0 && (
                <ul className="mt-3 flex flex-col gap-1">
                  {paraMirar.slice(0, 4).map((f) => (
                    <li key={f.userId}>
                      <button type="button" onClick={() => abrir(f)} className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1 text-left transition hover:bg-foreground/[0.05]">
                        <UserAvatar name={f.nombre} src={q.fotos[f.userId]?.foto} seed={q.fotos[f.userId]?.seed} size="xs" />
                        <span className="shrink-0 text-sm font-medium">{f.nombre}</span>
                        <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-muted-foreground">
                          <Punto nivel={f.nivel} />
                          <span className="truncate">{f.motivos.slice(0, 2).map((m) => frase(t, m)).join(" · ")}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                  {paraMirar.length > 4 && (
                    <li>
                      <button type="button" onClick={() => setFiltro("mirar")} className="px-1.5 text-xs font-medium text-primary hover:underline">
                        {t("hr.turno.parte.verTodos", { n: paraMirar.length })}
                      </button>
                    </li>
                  )}
                </ul>
              )}
            </div>

            {/* Filtros, turno y buscador */}
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <div className="flex gap-1.5 overflow-x-auto pb-0.5">
                {ficha("todos", t("hr.turno.f.todos"), null)}
                {ficha("mirar", t("hr.turno.f.mirar"), "rojo")}
                {ficha("tarde", t("hr.turno.f.tarde"), "ambar")}
                {ficha("noEsta", t("hr.turno.f.noEsta"), "rojo")}
                {ficha("pausas", t("hr.turno.f.pausas"), "ambar")}
              </div>
              <div className="flex items-center gap-1.5 lg:ml-auto">
                <select
                  value={turno ?? ""}
                  onChange={(e) => setTurno(e.target.value || null)}
                  aria-label={t("hr.turno.turno")}
                  className="h-8 min-w-0 rounded-md border border-input bg-background/40 px-2 text-sm"
                >
                  <option value="">{t("hr.turno.todosTurnos")}</option>
                  {turnos.map((x) => {
                    const [e, s] = x.split("–");
                    return <option key={x} value={x}>{`${a12(e)} – ${a12(s)}`}</option>;
                  })}
                </select>
                <div className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={buscar}
                    onChange={(e) => setBuscar(e.target.value)}
                    placeholder={t("hr.donde.buscar")}
                    aria-label={t("hr.donde.buscar")}
                    className="h-8 w-full rounded-md border border-input bg-background/40 pl-8 pr-7 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                  {buscar && (
                    <button type="button" onClick={() => setBuscar("")} aria-label={t("hr.donde.verTodos")} className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* LA TABLA */}
            <div className="flex flex-col gap-1">
              <div className="hidden grid-cols-[minmax(12rem,1.6fr)_1fr_1.1fr_0.8fr_0.9fr_1fr_1rem] gap-3 px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80 md:grid">
                <span>{t("hr.turno.col.persona")}</span>
                <span>{t("hr.turno.col.llegada")}</span>
                <span>{t("hr.turno.col.comida")}</span>
                <span>{t("hr.turno.col.bano")}</span>
                <span>{t("hr.turno.col.avisos")}</span>
                <span>{t("hr.turno.col.conexion")}</span>
                <span />
              </div>
              {!vistas.length && (
                <p className="rounded-2xl border border-dashed border-border/50 p-5 text-center text-sm text-muted-foreground">{t("hr.turno.nadieAsi")}</p>
              )}
              {(["mirar", "ojo", "bien"] as Seccion[]).map((s) => secciones[s].length > 0 && (
                <div key={s} className="flex flex-col gap-1.5 md:gap-0">
                  <p className="mt-2 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground md:px-3">
                    {s !== "bien" && <Punto nivel={s === "mirar" ? "rojo" : "ambar"} />}
                    {t(TITULO_SECCION[s])} · {secciones[s].length}
                  </p>
                  <div className="flex flex-col gap-1.5 md:divide-y md:divide-border/30 md:gap-0">
                    {secciones[s].map((f) => <Fila key={f.userId} f={f} />)}
                  </div>
                </div>
              ))}
              {secciones.luego.length > 0 && (
                <details className="mt-2 rounded-2xl border border-dashed border-border/40 bg-card/10 p-3">
                  <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t(TITULO_SECCION.luego)} · {secciones.luego.length}
                  </summary>
                  <div className="mt-2 flex flex-col gap-1.5 md:gap-0 md:divide-y md:divide-border/30">
                    {secciones.luego.map((f) => <Fila key={f.userId} f={f} />)}
                  </div>
                </details>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground">
              {esHoy ? t("hr.turno.actualizado", { h: hora(q.data?.calculadoAt ?? Date.now()) }) : t("hr.turno.diaCerrado")}
              {" · "}{t("hr.turno.comoJuzga")}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
