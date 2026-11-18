import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Check, ChevronDown, ChevronLeft, ChevronRight, Loader2, PhoneOff, RefreshCw, Search, X } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { horaUI, usaReloj24 } from "@/lib/formatoHora";
import {
  type CorteDelDia, type FilaLlamadas, type Semaforo, type TipoCorte, cortesPorHora, estimacionConSentido, horasAVer,
  resumirCortes, semaforoInternet, tonoNC, useCortesHoy, useLlamadasHoy,
} from "@/hooks/useLlamadasHoy";

// ARGOS › LLAMADAS (Alvaro, 13/11/2026; rehecha el 18/11/2026 con preguntas y
// respuestas: «menos tecnicismo: por qué, qué pasó, cuántos minutos se le cayó
// y cuánto tardó en regresar», «no tan scrolleado», «filtros y paginación»).
//   · Arriba, los números del día y la gráfica por hora, en una franja.
//   · Filtros: buscar a alguien (A–Z), por equipo, por razón y «solo a quien se
//     le cayó la llamada». 10 personas por página.
//   · Cada persona en un renglón: «Se le cortó 21 veces · 4 min sin llamada ·
//     volvía en unos 10 s», la razón en palabras y el internet como semáforo.
//   · Al abrirla: cada corte (hora · qué pasó · cuánto tardó en volver), qué
//     hacer, y los números técnicos chiquitos al final.

const CAUSA: Record<string, TranslationKey> = {
  computador: "hr.llamadas.causa.computador",
  internet_subida: "hr.llamadas.causa.internet_subida",
  internet_inestable: "hr.llamadas.causa.internet_inestable",
  pestana_dormida: "hr.llamadas.causa.pestana_dormida",
  recargas: "hr.llamadas.causa.recargas",
  sin_datos: "hr.llamadas.causa.sin_datos",
  sin_causa_clara: "hr.llamadas.causa.sin_causa_clara",
};
const CONSEJO: Record<string, TranslationKey> = {
  computador: "hr.llamadas.consejo.computador",
  internet_subida: "hr.llamadas.consejo.internet_subida",
  internet_inestable: "hr.llamadas.consejo.internet_inestable",
  pestana_dormida: "hr.llamadas.consejo.pestana_dormida",
  recargas: "hr.llamadas.consejo.recargas",
  sin_datos: "hr.llamadas.consejo.sin_datos",
  sin_causa_clara: "hr.llamadas.consejo.sin_causa_clara",
};
const NC: Record<string, TranslationKey> = {
  fuerte: "hr.llamadas.nc.fuerte",
  activa: "hr.llamadas.nc.activa",
  solo_puerta: "hr.llamadas.nc.solo_puerta",
  fallo: "hr.llamadas.nc.fallo",
  no_soportada: "hr.llamadas.nc.no_soportada",
  sin_micro: "hr.llamadas.nc.sin_micro",
};
const TIPO: Record<TipoCorte, TranslationKey> = {
  internet: "hr.llamadas.tipo.internet",
  caida: "hr.llamadas.tipo.caida",
  no_volvio: "hr.llamadas.tipo.no_volvio",
  recarga: "hr.llamadas.tipo.recarga",
};
const SEMAFORO: Record<Semaforo, { k: TranslationKey; punto: string }> = {
  bueno: { k: "hr.llamadas.internet.bueno", punto: "bg-success" },
  flojo: { k: "hr.llamadas.internet.flojo", punto: "bg-warning" },
  malo: { k: "hr.llamadas.internet.malo", punto: "bg-destructive" },
  sin_medir: { k: "hr.llamadas.internet.sinMedir", punto: "bg-muted-foreground/50" },
};
// Qué causas son de la conexión o del equipo (punto ámbar) y cuáles no dicen nada todavía.
const CAUSA_CON_PUNTO = new Set(["computador", "internet_subida", "internet_inestable", "pestana_dormida", "recargas"]);
const POR_PAGINA = 10;

// La hora como la eligió el dueño para toda la empresa (AM/PM por defecto;
// lib/formatoHora.ts, 18/11/2026).
const horaBogota = (iso: string) => horaUI(iso);
/** «3 PM» (o «15» con reloj militar) para el eje de la gráfica. */
const horaCorta = (h: number) => (usaReloj24() ? String(h).padStart(2, "0") : `${h % 12 === 0 ? 12 : h % 12} ${h < 12 ? "AM" : "PM"}`);
const horaActualBogota = () => Number(new Date().toLocaleString("en-US", { timeZone: "America/Bogota", hour: "2-digit", hour12: false })) % 24;
const mbps = (n: number) => (n >= 10 ? Math.round(n).toString() : n.toFixed(1));
const FICHA = (activa: boolean) =>
  `inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
    activa ? "border-foreground/30 bg-foreground/10 text-foreground" : "border-border/40 bg-card/30 text-muted-foreground hover:bg-card/50"
  }`;

type Tr = (k: TranslationKey, p?: Record<string, string | number>) => string;
/** «12 s», «4 min», «1 h 05 min». */
export function duracionLegible(seg: number, t: Tr): string {
  if (seg < 60) return t("hr.llamadas.dur.s", { n: Math.max(1, Math.round(seg)) });
  const min = Math.round(seg / 60);
  if (min < 60) return t("hr.llamadas.dur.min", { n: min });
  return t("hr.llamadas.dur.h", { h: Math.floor(min / 60), m: String(min % 60).padStart(2, "0") });
}

export function LlamadasPanel() {
  const { t } = useLanguage();
  const q = useLlamadasHoy();
  const cortesQ = useCortesHoy();
  const filas = useMemo(() => q.data ?? [], [q.data]);
  const totalHoras = useMemo(() => cortesPorHora(filas), [filas]);
  const resumen = useMemo(() => ({
    cortes: filas.reduce((s, f) => s + f.cortes, 0),
    graves: filas.reduce((s, f) => s + f.graves, 0),
    personas: filas.length,
    sinNC: filas.filter((f) => tonoNC(f.nc) === "flojo").length,
  }), [filas]);

  // Filtros (Alvaro, 18/11/2026): persona, equipo, razón y solo caídas de verdad.
  const [elegido, setElegido] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [equipo, setEquipo] = useState<string | null>(null);
  const [razon, setRazon] = useState<string | null>(null);
  const [soloCaidas, setSoloCaidas] = useState(false);
  const [pagina, setPagina] = useState(0);

  const equipos = useMemo(() => contar(filas.map((f) => f.equipo ?? "—")), [filas]);
  const razones = useMemo(() => contar(filas.map((f) => f.causa ?? "sin_datos")), [filas]);
  const alfabetico = useMemo(() => [...filas].sort((a, b) => (a.nombre ?? "").localeCompare(b.nombre ?? "", "es", { sensitivity: "base" })), [filas]);
  const vistas = useMemo(() => {
    if (elegido) return filas.filter((f) => f.user_id === elegido);
    return filas.filter((f) =>
      (!equipo || (f.equipo ?? "—") === equipo)
      && (!razon || (f.causa ?? "sin_datos") === razon)
      && (!soloCaidas || f.graves > 0));
  }, [filas, elegido, equipo, razon, soloCaidas]);
  const paginas = Math.max(1, Math.ceil(vistas.length / POR_PAGINA));
  const paginaVigente = Math.min(pagina, paginas - 1);
  const enPagina = vistas.slice(paginaVigente * POR_PAGINA, paginaVigente * POR_PAGINA + POR_PAGINA);
  const cambiar = (f: () => void) => { f(); setPagina(0); };
  const nombreElegido = elegido ? filas.find((f) => f.user_id === elegido)?.nombre ?? null : null;

  if (q.isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (q.isError) {
    // Un fallo no es «nadie tiene cortes»: se dice y se ofrece reintentar.
    return (
      <div role="alert" className="vidrio flex flex-wrap items-center gap-3 p-4 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
        <span className="min-w-0 flex-1">{t("hr.llamadas.fallo")}</span>
        <Button variant="outline" size="sm" onClick={() => void q.refetch()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("hr.llamadas.reintentar")}</Button>
      </div>
    );
  }

  const horas = horasAVer(totalHoras, horaActualBogota());
  const maxHora = Math.max(1, ...horas.map((h) => totalHoras[h]));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="flex items-center gap-2 text-base font-semibold"><PhoneOff className="h-4 w-4 text-primary" />{t("hr.llamadas.titulo")}</h2>
          <p className="text-xs text-muted-foreground">{t("hr.llamadas.subCorto")}</p>
        </div>
        <Button variant="outline" size="sm" className="rounded-full" onClick={() => { void q.refetch(); void cortesQ.refetch(); }} disabled={q.isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 sm:mr-1.5 ${q.isFetching ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">{t("hr.llamadas.actualizar")}</span>
        </Button>
      </div>

      {/* Los números y la gráfica, en una sola franja. */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="vidrio grid grid-cols-2 p-1 sm:grid-cols-4 lg:grid-cols-2">
          {([
            ["hr.llamadas.tile.cortes", resumen.cortes],
            ["hr.llamadas.tile.graves", resumen.graves],
            ["hr.llamadas.tile.personas", resumen.personas],
            ["hr.llamadas.tile.sinNc", resumen.sinNC],
          ] as Array<[TranslationKey, number]>).map(([k, n]) => (
            <div key={k} className="flex flex-col gap-0.5 px-3 py-2.5">
              <span className="font-display text-xl font-semibold tabular-nums text-foreground">{n}</span>
              <span className="text-[11px] leading-tight text-muted-foreground">{t(k)}</span>
            </div>
          ))}
        </div>
        {filas.length > 0 && (
          <section className="vidrio flex flex-col gap-2 px-4 py-3" aria-label={t("hr.llamadas.porHora")}>
            <h3 className="text-xs font-semibold text-muted-foreground">{t("hr.llamadas.porHora")}</h3>
            <div className="flex h-20 items-end gap-1" role="list">
              {horas.map((h) => {
                const n = totalHoras[h];
                return (
                  <div key={h} role="listitem" className="flex min-w-0 flex-1 flex-col items-center gap-1"
                    title={t("hr.llamadas.porHoraTip", { h: horaCorta(h), n })}>
                    <span className="text-[10px] tabular-nums text-muted-foreground">{n > 0 ? n : ""}</span>
                    <div className="w-full rounded-t-[3px] bg-primary/70" style={{ height: `${Math.max(n > 0 ? 5 : 2, Math.round((n / maxHora) * 44))}px`, opacity: n > 0 ? 1 : 0.25 }} />
                    <span className="whitespace-nowrap text-[9px] tabular-nums text-muted-foreground">{h % 3 === 0 ? horaCorta(h) : ""}</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {!filas.length ? (
        <p className="vidrio p-6 text-sm text-muted-foreground">{t("hr.llamadas.vacio")}</p>
      ) : (
        <section className="vidrio flex flex-col gap-0 overflow-hidden p-0">
          {/* Filtros */}
          <div className="flex flex-col gap-2 border-b border-border/40 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Popover open={abierto} onOpenChange={setAbierto}>
                <div className="relative w-full sm:w-60">
                  <PopoverTrigger asChild>
                    <button type="button" role="combobox" aria-expanded={abierto} aria-label={t("hr.llamadas.filtro.buscar")}
                      className="flex h-8 w-full items-center gap-2 rounded-md border border-input bg-background/40 pl-2.5 pr-8 text-left text-sm transition-colors hover:bg-foreground/[0.04]">
                      <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className={`min-w-0 flex-1 truncate ${nombreElegido ? "text-foreground" : "text-muted-foreground"}`}>{nombreElegido ?? t("hr.llamadas.filtro.buscar")}</span>
                    </button>
                  </PopoverTrigger>
                  {elegido ? (
                    <button type="button" onClick={() => cambiar(() => setElegido(null))} aria-label={t("hr.llamadas.filtro.quitar")}
                      className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  )}
                </div>
                <PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[16rem] p-0">
                  <Command>
                    <CommandInput placeholder={t("hr.llamadas.filtro.escribe")} />
                    <CommandList className="max-h-72">
                      <CommandEmpty>{t("hr.llamadas.filtro.nadieConEseNombre")}</CommandEmpty>
                      <CommandGroup>
                        {alfabetico.map((f) => (
                          <CommandItem key={f.user_id} value={`${f.nombre ?? ""} ${f.user_id}`} keywords={[f.equipo ?? ""]}
                            onSelect={() => { cambiar(() => setElegido(f.user_id)); setAbierto(false); }} className="gap-2.5">
                            <UserAvatar name={f.nombre ?? "—"} size="xs" />
                            <span className="min-w-0 flex-1 truncate">{f.nombre ?? "—"}</span>
                            <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{f.cortes}</span>
                            {elegido === f.user_id && <Check className="h-3.5 w-3.5 text-primary" />}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              <button type="button" onClick={() => cambiar(() => setSoloCaidas((v) => !v))} aria-pressed={soloCaidas} className={FICHA(soloCaidas)}>
                <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden />
                {t("hr.llamadas.filtro.soloCaidas")}
                <span className="tabular-nums opacity-70">{filas.filter((f) => f.graves > 0).length}</span>
              </button>
            </div>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible" role="group" aria-label={t("hr.llamadas.filtro.porEquipo")}>
              <button type="button" onClick={() => cambiar(() => setEquipo(null))} aria-pressed={!equipo} className={FICHA(!equipo)}>{t("hr.llamadas.filtro.todosEquipos")}</button>
              {equipos.map(([e, n]) => (
                <button key={e} type="button" onClick={() => cambiar(() => setEquipo(e))} aria-pressed={equipo === e} className={FICHA(equipo === e)}>
                  {e}<span className="tabular-nums opacity-70">{n}</span>
                </button>
              ))}
            </div>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible" role="group" aria-label={t("hr.llamadas.filtro.porRazon")}>
              <button type="button" onClick={() => cambiar(() => setRazon(null))} aria-pressed={!razon} className={FICHA(!razon)}>{t("hr.llamadas.filtro.todasRazones")}</button>
              {razones.map(([r, n]) => (
                <button key={r} type="button" onClick={() => cambiar(() => setRazon(r))} aria-pressed={razon === r} className={FICHA(razon === r)}>
                  <span className={`h-1.5 w-1.5 rounded-full ${CAUSA_CON_PUNTO.has(r) ? "bg-warning" : "bg-muted-foreground/50"}`} aria-hidden />
                  {CAUSA[r] ? t(CAUSA[r]) : r}<span className="tabular-nums opacity-70">{n}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Encabezado de columnas (en computador). */}
          <div className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,0.9fr)_3.5rem_1.25rem] items-center gap-3 border-b border-border/40 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground md:grid">
            <span>{t("hr.llamadas.col.persona")}</span>
            <span>{t("hr.llamadas.col.causa")}</span>
            <span>{t("hr.llamadas.col.internet")}</span>
            <span className="text-right">{t("hr.llamadas.cortes")}</span>
            <span />
          </div>

          {vistas.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("hr.llamadas.filtro.nadie")}</p>
          ) : (
            <ul className="divide-y divide-border/30" aria-label={t("hr.llamadas.titulo")}>
              {enPagina.map((f) => <FilaPersona key={f.user_id} f={f} cortes={cortesQ.data?.get(f.user_id) ?? null} cargandoCortes={cortesQ.isLoading} />)}
            </ul>
          )}

          {/* Páginas de 10 */}
          {vistas.length > POR_PAGINA && (
            <nav className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 px-4 py-2.5 text-xs text-muted-foreground" aria-label={t("hr.llamadas.pag.paginas")}>
              <span className="tabular-nums">
                {t("hr.llamadas.pag.rango", { a: paginaVigente * POR_PAGINA + 1, b: Math.min(vistas.length, (paginaVigente + 1) * POR_PAGINA), n: vistas.length })}
              </span>
              <span className="flex items-center gap-1">
                <button type="button" onClick={() => setPagina(Math.max(0, paginaVigente - 1))} disabled={paginaVigente === 0}
                  className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 hover:bg-foreground/[0.06] disabled:opacity-40">
                  <ChevronLeft className="h-3.5 w-3.5" />{t("hr.llamadas.pag.anterior")}
                </button>
                {Array.from({ length: paginas }, (_, i) => (
                  <button key={i} type="button" onClick={() => setPagina(i)} aria-current={i === paginaVigente ? "page" : undefined}
                    className={`h-7 min-w-7 rounded-full px-2 tabular-nums ${i === paginaVigente ? "bg-foreground/10 font-semibold text-foreground" : "hover:bg-foreground/[0.06]"}`}>
                    {i + 1}
                  </button>
                ))}
                <button type="button" onClick={() => setPagina(Math.min(paginas - 1, paginaVigente + 1))} disabled={paginaVigente >= paginas - 1}
                  className="inline-flex h-7 items-center gap-1 rounded-full px-2.5 hover:bg-foreground/[0.06] disabled:opacity-40">
                  {t("hr.llamadas.pag.siguiente")}<ChevronRight className="h-3.5 w-3.5" />
                </button>
              </span>
            </nav>
          )}
        </section>
      )}
      <p className="text-[11px] text-muted-foreground">{t("hr.llamadas.notaPrueba")}</p>
    </div>
  );
}

function contar(valores: string[]): Array<[string, number]> {
  const m = new Map<string, number>();
  for (const v of valores) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));
}

/** «Se le cortó 21 veces · 4 min sin llamada · volvía en unos 10 s». */
export function resumenHumano(f: Pick<FilaLlamadas, "cortes" | "graves">, cortes: CorteDelDia[] | null, t: Tr): string {
  const partes = [t(f.cortes === 1 ? "hr.llamadas.resumen.unaVez" : "hr.llamadas.resumen.veces", { n: f.cortes })];
  const r = cortes ? resumirCortes(cortes) : null;
  if (r?.totalS != null) partes.push(t("hr.llamadas.resumen.sinLlamada", { d: duracionLegible(r.totalS, t) }));
  if (r?.promedioS != null) partes.push(t("hr.llamadas.resumen.volvia", { d: duracionLegible(r.promedioS, t) }));
  if (f.graves > 0) partes.push(t(f.graves === 1 ? "hr.llamadas.resumen.cayoUna" : "hr.llamadas.resumen.cayo", { n: f.graves }));
  return partes.join(" · ");
}

function FilaPersona({ f, cortes, cargandoCortes }: { f: FilaLlamadas; cortes: CorteDelDia[] | null; cargandoCortes: boolean }) {
  const { t } = useLanguage();
  const [abierta, setAbierta] = useState(false);
  const [todos, setTodos] = useState(false);
  const causa = f.causa ?? "sin_datos";
  const semaforo = SEMAFORO[semaforoInternet(f)];
  const estimada = estimacionConSentido(f.subida_estimada_kbps);
  const lista = cortes ?? [];
  const visibles = todos ? lista : lista.slice(0, 8);
  const tecnico = [
    f.prueba_subida_mbps !== null ? t(f.prueba_subida_tope ? "hr.llamadas.subidaMenorQue" : "hr.llamadas.subida", { n: mbps(f.prueba_subida_mbps) }) : null,
    f.prueba_bajada_mbps !== null ? t("hr.llamadas.bajada", { n: mbps(f.prueba_bajada_mbps) }) : null,
    f.rtt_ms !== null ? t("hr.llamadas.rtt", { n: f.rtt_ms }) : null,
    f.perdida_pct !== null ? t("hr.llamadas.perdida", { n: f.perdida_pct }) : null,
    f.nav ? (f.nav === "other · other" ? t("hr.llamadas.navOtro") : f.nav) : null,
    t(NC[f.nc ?? ""] ?? "hr.llamadas.nc.sinDato"),
    estimada !== null ? t("hr.llamadas.estimada", { n: estimada }) : null,
  ].filter(Boolean).join(" · ");

  return (
    <li>
      <button
        type="button"
        onClick={() => setAbierta((v) => !v)}
        aria-expanded={abierta}
        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1.5 px-4 py-3 text-left transition-colors hover:bg-foreground/[0.03] md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.4fr)_minmax(0,0.9fr)_3.5rem_1.25rem]"
      >
        {/* Quién y qué le pasó hoy, en una frase */}
        <span className="flex min-w-0 items-center gap-2.5">
          <UserAvatar name={f.nombre ?? "—"} size="sm" />
          <span className="flex min-w-0 flex-col">
            <span className="truncate text-sm font-semibold text-foreground">
              {f.nombre ?? "—"}
              <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">
                {[f.equipo, f.ultimo_corte ? t("hr.llamadas.ultimo", { hora: horaBogota(f.ultimo_corte) }) : null].filter(Boolean).join(" · ")}
              </span>
            </span>
            <span className="truncate text-xs text-foreground/75">
              {cargandoCortes ? t(f.cortes === 1 ? "hr.llamadas.resumen.unaVez" : "hr.llamadas.resumen.veces", { n: f.cortes }) : resumenHumano(f, cortes, t)}
            </span>
          </span>
        </span>
        <span className="text-right font-display text-base font-semibold tabular-nums text-foreground md:order-4">{f.cortes}</span>
        {/* Por qué */}
        <span className="col-span-2 flex min-w-0 items-center gap-1.5 text-xs text-foreground/85 md:order-2 md:col-span-1">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${CAUSA_CON_PUNTO.has(causa) ? "bg-warning" : "bg-muted-foreground/50"}`} aria-hidden />
          <span className="truncate">{CAUSA[causa] ? t(CAUSA[causa]) : (f.causa_texto ?? causa)}</span>
        </span>
        {/* Internet, en una palabra */}
        <span className="col-span-2 flex items-center gap-1.5 text-xs text-foreground/85 md:order-3 md:col-span-1">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${semaforo.punto}`} aria-hidden />
          {t(semaforo.k)}
        </span>
        <ChevronDown className={`hidden h-4 w-4 text-muted-foreground transition-transform md:order-5 md:block ${abierta ? "rotate-180" : ""}`} aria-hidden />
      </button>

      {abierta && (
        <div className="flex flex-col gap-3 bg-foreground/[0.02] px-4 pb-4 pt-1 md:pl-[3.4rem]">
          {/* Cada corte, uno por uno */}
          {cargandoCortes ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : lista.length > 0 ? (
            <div className="flex flex-col gap-1">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("hr.llamadas.cadaCorte")}</p>
              <ul className="flex flex-col">
                {visibles.map((c, i) => (
                  <li key={`${c.creado}-${i}`} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2 border-b border-border/20 py-1.5 text-xs last:border-0 sm:grid-cols-[4.5rem_minmax(0,1fr)_auto]">
                    <span className="tabular-nums text-muted-foreground">{horaBogota(c.creado)}</span>
                    <span className="text-foreground/85">{t(TIPO[c.tipo])}</span>
                    <span className={`col-start-2 tabular-nums sm:col-start-auto sm:text-right ${c.volvio ? "text-muted-foreground" : "text-foreground"}`}>
                      {!c.volvio
                        ? t("hr.llamadas.corte.noVolvio")
                        : c.duracionS != null
                          ? t("hr.llamadas.corte.volvioEn", { d: duracionLegible(c.duracionS, t) })
                          : t("hr.llamadas.corte.volvio")}
                    </span>
                  </li>
                ))}
              </ul>
              {lista.length > visibles.length && (
                <button type="button" onClick={() => setTodos(true)} className="self-start text-xs font-medium text-primary hover:underline">
                  {t("hr.llamadas.verTodos", { n: lista.length })}
                </button>
              )}
            </div>
          ) : null}

          {/* Qué hacer */}
          <div className="flex flex-col gap-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("hr.llamadas.queHacer")}</p>
            <p className="text-xs text-foreground/85">{CONSEJO[causa] ? t(CONSEJO[causa]) : (f.consejo ?? "")}</p>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <p className="min-w-0 flex-1 text-[11px] text-muted-foreground">{tecnico}</p>
            <Link to={`/hr/expediente/${f.user_id}`} className="text-xs font-medium text-primary hover:underline">{t("hr.llamadas.verExpediente")}</Link>
          </div>
        </div>
      )}
    </li>
  );
}
