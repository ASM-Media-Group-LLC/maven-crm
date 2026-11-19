import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle, BellRing, Check, ChevronDown, ChevronLeft, ChevronRight, Clock, DoorOpen, Eye, Loader2, PhoneOff,
  RefreshCw, Search, UserX, WifiOff, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { horaUI } from "@/lib/formatoHora";
import { useEstadoHoy } from "@/hooks/useEstadoHoy";
import { useDondeEsta } from "@/hooks/useDondeEsta";
import { hoyEnBogota, useFotosDe, useHoyDelEquipo } from "@/hooks/useHoyDelEquipo";
import { urlsDeNas, urlsDelBuzon } from "@/hooks/useMonitorEventos";
import { duracionLegible } from "@/components/hr/LlamadasPanel";
import {
  CATEGORIAS, type Categoria, type ItemEstado, armarEstado, claveDeFoto, contarPorCategoria, faltasYTardes, fotosDe,
} from "@/lib/estadoArgos";

// ARGOS › ESTADO (Alvaro, 18/11/2026: «no le pondría coach, le pondría status»;
// «todo lo que reporte Argos de cada persona, ahí va llegando, uno por uno»).
//   · Una lista viva de HOY, del más nuevo al más viejo: llamados de atención de
//     Argos (con el pantallazo de ese momento), cortes de llamada, quién se quedó
//     sin luz o internet, salidas de Cowork, lo que vio la IA, faltas y llegadas
//     tarde. Se actualiza sola cada 30 s.
//   · Lo que se repite mucho (la IA, los parpadeos de internet) se junta por
//     persona y por hora en un solo renglón con todas sus fotos.
//   · Filtros: qué tipo, buscar a alguien (A–Z) y por equipo. 20 por página.
//   · Tocar el nombre abre su expediente; tocar una foto la abre en grande.

const POR_PAGINA = 20;

const CAT: Record<Categoria, { k: TranslationKey; Icono: typeof BellRing; punto: string }> = {
  llamado: { k: "hr.estado.cat.llamado", Icono: BellRing, punto: "bg-warning" },
  corte: { k: "hr.estado.cat.corte", Icono: PhoneOff, punto: "bg-primary" },
  luz: { k: "hr.estado.cat.luz", Icono: WifiOff, punto: "bg-destructive" },
  fuera: { k: "hr.estado.cat.fuera", Icono: DoorOpen, punto: "bg-warning" },
  ia: { k: "hr.estado.cat.ia", Icono: Eye, punto: "bg-muted-foreground/60" },
  falta: { k: "hr.estado.cat.falta", Icono: UserX, punto: "bg-destructive" },
  tarde: { k: "hr.estado.cat.tarde", Icono: Clock, punto: "bg-warning" },
};

const LLAMADO: Record<string, TranslationKey> = {
  camara_apagada: "hr.estado.llamado.camara_apagada",
  sin_pantalla: "hr.estado.llamado.sin_pantalla",
  fuera_cuadro: "hr.estado.llamado.fuera_cuadro",
};

const FICHA = (activa: boolean) =>
  `inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
    activa ? "border-foreground/30 bg-foreground/10 text-foreground" : "border-border/40 bg-card/30 text-muted-foreground hover:bg-card/50"
  }`;

type Tr = (k: TranslationKey, p?: Record<string, string | number>) => string;

/** La frase de cada renglón, en palabras de la operación. */
export function fraseDe(item: ItemEstado, t: Tr): string {
  const e = item.eventos[0];
  const n = item.eventos.length;
  const dur = (s: number | null | undefined) => (s != null ? duracionLegible(s, t) : null);
  switch (item.categoria) {
    case "llamado": {
      const que = LLAMADO[item.tipo] ? t(LLAMADO[item.tipo]) : t("hr.estado.llamado.otro");
      if (e?.volvio && e.duracionS != null) return t("hr.estado.llamado.corrigio", { que, dur: dur(e.duracionS)! });
      if (e?.volvio) return t("hr.estado.llamado.corrigioSinDur", { que });
      return t("hr.estado.llamado.sigue", { que });
    }
    case "corte": {
      if (item.tipo === "recarga") return n > 1 ? t("hr.estado.corte.recargaN", { n }) : t("hr.estado.corte.recarga");
      if (item.tipo === "caida") {
        if (n > 1) return t("hr.estado.corte.caidaN", { n });
        return e?.duracionS != null ? t("hr.estado.corte.caidaVolvio", { dur: dur(e.duracionS)! }) : t("hr.estado.corte.caida");
      }
      if (n > 1) return t("hr.estado.corte.internetN", { n });
      return e?.duracionS != null ? t("hr.estado.corte.internet", { dur: dur(e.duracionS)! }) : t("hr.estado.corte.internetSinDur");
    }
    case "luz": {
      if (e?.clase === "fuera") return e.volvio ? t("hr.estado.luz.fuera", { dur: dur(e.duracionS) ?? "—" }) : t("hr.estado.luz.fueraSigue", { dur: dur(e.duracionS) ?? "—" });
      if (item.tipo === "no_volvio") return t("hr.estado.luz.noVolvio");
      return t("hr.estado.luz.largo", { dur: dur(e?.duracionS) ?? "—" });
    }
    case "fuera":
      return e?.volvio ? t("hr.estado.fuera.volvio", { dur: dur(e.duracionS) ?? "—" }) : t("hr.estado.fuera.sigue", { dur: dur(e?.duracionS) ?? "—" });
    case "ia":
      if (item.tipo === "celular") return n > 1 ? t("hr.estado.ia.celularN", { n }) : t("hr.estado.ia.celular");
      return n > 1 ? t("hr.estado.ia.distraidoN", { n }) : t("hr.estado.ia.distraido");
    case "falta":
      return t("hr.estado.falta", { h: item.entrada ?? "—" });
    case "tarde":
      return t("hr.estado.tarde", { n: item.tardeMin ?? 0, h: item.entrada ?? "—" });
  }
}

export function EstadoPanel() {
  const { t } = useLanguage();
  const q = useEstadoHoy();
  const donde = useDondeEsta();
  const hoyEquipo = useHoyDelEquipo(true);
  const hoy = hoyEnBogota();

  const porId = useMemo(() => new Map((donde.data ?? []).map((f) => [f.user_id, f])), [donde.data]);

  const items = useMemo(() => {
    const horario = hoyEquipo.datos
      ? faltasYTardes(
          [...hoyEquipo.datos.tarde, ...hoyEquipo.datos.faltan].map((p) => ({
            userId: p.userId, entradaCruda: porId.get(p.userId)?.entrada ?? null, entrada: p.entrada,
            llegoAt: p.llegoAt, tardeMin: p.tardeMin, estado: p.estado,
          })),
          hoy, Date.now(),
        )
      : [];
    return armarEstado(q.data ?? [], horario);
  }, [q.data, hoyEquipo.datos, porId, hoy]);

  // Nombres de quien no sale en Presencia (p. ej. el que mira).
  const faltanNombres = useMemo(() => [...new Set(items.map((i) => i.userId))].filter((id) => !porId.has(id)), [items, porId]);
  const nombresQ = useQuery<Record<string, string>>({
    queryKey: ["estado-nombres", faltanNombres.sort().join(",")],
    enabled: faltanNombres.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("id, full_name").in("id", faltanNombres);
      return Object.fromEntries(((data ?? []) as Array<{ id: string; full_name: string | null }>).map((p) => [p.id, p.full_name ?? "—"]));
    },
  });
  const nombreDe = (id: string) => porId.get(id)?.nombre ?? nombresQ.data?.[id] ?? "—";
  const equipoDe = (id: string) => porId.get(id)?.equipo ?? null;
  const fotos = useFotosDe([...new Set(items.map((i) => i.userId))]).data ?? {};

  // Filtros
  const [cat, setCat] = useState<Categoria | null>(null);
  const [elegido, setElegido] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [equipo, setEquipo] = useState<string | null>(null);
  const [pagina, setPagina] = useState(0);
  const cambiar = (f: () => void) => { f(); setPagina(0); };

  const deLaPersonaYEquipo = useMemo(
    () => items.filter((i) => (!elegido || i.userId === elegido) && (!equipo || (equipoDe(i.userId) ?? "—") === equipo)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, elegido, equipo, porId],
  );
  const conteos = useMemo(() => contarPorCategoria(deLaPersonaYEquipo), [deLaPersonaYEquipo]);
  const vistos = useMemo(() => (cat ? deLaPersonaYEquipo.filter((i) => i.categoria === cat) : deLaPersonaYEquipo), [deLaPersonaYEquipo, cat]);
  const equipos = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) { const e = equipoDe(i.userId) ?? "—"; m.set(e, (m.get(e) ?? 0) + 1); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, porId]);
  const gente = useMemo(() => {
    const m = new Map<string, number>();
    for (const i of items) m.set(i.userId, (m.get(i.userId) ?? 0) + 1);
    return [...m.entries()].map(([id, n]) => ({ id, n, nombre: nombreDe(id) }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre, "es", { sensitivity: "base" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, porId, nombresQ.data]);

  const paginas = Math.max(1, Math.ceil(vistos.length / POR_PAGINA));
  const paginaVigente = Math.min(pagina, paginas - 1);
  const enPagina = vistos.slice(paginaVigente * POR_PAGINA, paginaVigente * POR_PAGINA + POR_PAGINA);

  // Fotos de la página: se firman solo las que se ven (buzón en un viaje; NAS por argos-foto).
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [visor, setVisor] = useState<{ item: ItemEstado; i: number } | null>(null);
  const clavesPagina = useMemo(() => [
    ...enPagina.flatMap((i) => fotosDe(i).slice(0, 8)),
    ...(visor ? fotosDe(visor.item).slice(Math.max(0, visor.i - 1), visor.i + 2) : []),
  ], [enPagina, visor]);
  useEffect(() => {
    let vivo = true;
    const buzon: string[] = [], nas: string[] = [];
    for (const f of clavesPagina) {
      const k = claveDeFoto(f);
      if (urls[k]) continue;
      if (f.enNas && f.nasPath) nas.push(f.nasPath); else buzon.push(f.path);
    }
    if (buzon.length === 0 && nas.length === 0) return;
    void (async () => {
      const [a, b] = await Promise.all([urlsDelBuzon(buzon), urlsDeNas(nas)]);
      if (vivo) setUrls((prev) => ({ ...prev, ...a, ...b }));
    })();
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clavesPagina]);

  const nombreElegido = elegido ? nombreDe(elegido) : null;

  if (q.isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (q.isError) {
    return (
      <div role="alert" className="vidrio flex flex-wrap items-center gap-3 p-4 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
        <span className="min-w-0 flex-1">{t("hr.estado.fallo")}</span>
        <Button variant="outline" size="sm" onClick={() => void q.refetch()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("hr.llamadas.reintentar")}</Button>
      </div>
    );
  }

  const fotosVisor = visor ? fotosDe(visor.item) : [];
  const fotoVisor = visor ? fotosVisor[visor.i] : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <span className="relative flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success/60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            {t("hr.estado.titulo")}
          </h2>
          <p className="text-xs text-muted-foreground">{t("hr.estado.sub")}</p>
        </div>
        <Button variant="outline" size="sm" className="rounded-full" onClick={() => void q.refetch()} disabled={q.isFetching}>
          <RefreshCw className={`h-3.5 w-3.5 sm:mr-1.5 ${q.isFetching ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">{t("hr.llamadas.actualizar")}</span>
        </Button>
      </div>

      {hoyEquipo.fallo && (
        <p role="alert" className="flex items-center gap-2 text-xs text-muted-foreground">
          <AlertTriangle className="h-3.5 w-3.5 text-destructive" />{t("hr.estado.falloHorario")}
        </p>
      )}

      <section className="vidrio flex flex-col gap-0 overflow-hidden p-0">
        {/* Filtros */}
        <div className="flex flex-col gap-2 border-b border-border/40 p-3">
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible" role="group" aria-label={t("hr.estado.filtro.tipo")}>
            <button type="button" onClick={() => cambiar(() => setCat(null))} aria-pressed={!cat} className={FICHA(!cat)}>
              {t("hr.estado.cat.todo")}<span className="tabular-nums opacity-70">{deLaPersonaYEquipo.length}</span>
            </button>
            {CATEGORIAS.filter((c) => conteos[c] > 0 || cat === c).map((c) => (
              <button key={c} type="button" onClick={() => cambiar(() => setCat(c))} aria-pressed={cat === c} className={FICHA(cat === c)}>
                <span className={`h-1.5 w-1.5 rounded-full ${CAT[c].punto}`} aria-hidden />
                {t(CAT[c].k)}<span className="tabular-nums opacity-70">{conteos[c]}</span>
              </button>
            ))}
          </div>
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
                      {gente.map((g) => (
                        <CommandItem key={g.id} value={`${g.nombre} ${g.id}`} keywords={[equipoDe(g.id) ?? ""]}
                          onSelect={() => { cambiar(() => setElegido(g.id)); setAbierto(false); }} className="gap-2.5">
                          <UserAvatar name={g.nombre} src={fotos[g.id]?.foto ?? undefined} seed={fotos[g.id]?.seed ?? undefined} size="xs" />
                          <span className="min-w-0 flex-1 truncate">{g.nombre}</span>
                          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{g.n}</span>
                          {elegido === g.id && <Check className="h-3.5 w-3.5 text-primary" />}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          {equipos.length > 1 && (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible" role="group" aria-label={t("hr.llamadas.filtro.porEquipo")}>
              <button type="button" onClick={() => cambiar(() => setEquipo(null))} aria-pressed={!equipo} className={FICHA(!equipo)}>{t("hr.llamadas.filtro.todosEquipos")}</button>
              {equipos.map(([e, n]) => (
                <button key={e} type="button" onClick={() => cambiar(() => setEquipo(e))} aria-pressed={equipo === e} className={FICHA(equipo === e)}>
                  {e}<span className="tabular-nums opacity-70">{n}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* La lista */}
        {vistos.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">{items.length === 0 ? t("hr.estado.vacio") : t("hr.estado.vacioFiltro")}</p>
        ) : (
          <ul className="divide-y divide-border/30">
            {enPagina.map((item) => {
              const { Icono, punto } = CAT[item.categoria];
              const e = item.eventos[0];
              const fs = fotosDe(item);
              const nombre = nombreDe(item.userId);
              const varios = item.eventos.length > 1;
              return (
                <li key={item.clave} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-start sm:gap-3 sm:px-4">
                  <div className="flex min-w-0 flex-1 items-start gap-2.5">
                    <Link to={`/hr/expediente/${item.userId}`} state={{ volverA: "/hr/monitor-ia?t=llamadas" }} className="shrink-0">
                      <UserAvatar name={nombre} src={fotos[item.userId]?.foto ?? undefined} seed={fotos[item.userId]?.seed ?? undefined} size="sm" />
                    </Link>
                    <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <div className="flex min-w-0 items-baseline gap-2">
                        <Link to={`/hr/expediente/${item.userId}`} state={{ volverA: "/hr/monitor-ia?t=llamadas" }}
                          className="min-w-0 truncate text-sm font-semibold text-foreground hover:underline">{nombre}</Link>
                        {equipoDe(item.userId) && <span className="hidden shrink-0 truncate text-[11px] text-muted-foreground sm:inline">{equipoDe(item.userId)}</span>}
                        <span className="ml-auto shrink-0 text-xs tabular-nums text-muted-foreground">
                          {varios ? `${horaUI(item.desde)} – ${horaUI(item.cuando)}` : horaUI(item.cuando)}
                        </span>
                      </div>
                      <p className="flex items-start gap-1.5 text-sm text-foreground/90">
                        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${punto}`} aria-hidden />
                        <Icono className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="min-w-0">{fraseDe(item, t)}</span>
                      </p>
                      <div className="flex flex-wrap gap-1.5 pl-[1.375rem]">
                        {e?.escalado && <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-foreground/90">{t("hr.estado.chip.escalado")}</span>}
                        {e?.reportado && <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-foreground/90">{t("hr.estado.chip.reportado")}</span>}
                        {(e?.llamados ?? 0) > 0 && <span className="rounded-full bg-foreground/10 px-2 py-0.5 text-[11px] text-foreground/85">{t("hr.estado.chip.llamados", { n: e!.llamados! })}</span>}
                        {e?.estado === "falta" && <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-[11px] font-medium text-foreground/90">{t("hr.estado.chip.falta")}</span>}
                        {!varios && e?.clase === "ia" && e.detalle && <span className="min-w-0 text-[11px] italic text-muted-foreground">«{e.detalle}»</span>}
                      </div>
                    </div>
                  </div>
                  {fs.length > 0 && (
                    <div className="flex shrink-0 gap-1.5 overflow-x-auto pl-[2.875rem] [scrollbar-width:none] sm:max-w-[22rem] sm:pl-0">
                      {fs.slice(0, 8).map((f, i) => {
                        const u = urls[claveDeFoto(f)];
                        return (
                          <button key={claveDeFoto(f)} type="button" onClick={() => setVisor({ item, i })}
                            className="relative aspect-[16/10] w-28 shrink-0 overflow-hidden rounded-md border border-border/40 bg-muted/40 hover:border-primary/50 sm:w-32"
                            title={horaUI(f.cuando)}>
                            {u ? <img src={u} alt={horaUI(f.cuando)} loading="lazy" className="h-full w-full object-cover" />
                              : <div className="h-full w-full animate-pulse bg-foreground/[0.06]" />}
                            {(fs.length > 1 || varios) && (
                              <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 text-[9px] font-semibold tabular-nums text-white">{horaUI(f.cuando)}</span>
                            )}
                            {i === 7 && fs.length > 8 && (
                              <span className="absolute inset-0 flex items-center justify-center bg-black/55 text-xs font-semibold text-white">+{fs.length - 8}</span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {paginas > 1 && (
          <div className="flex items-center justify-between gap-2 border-t border-border/40 px-3 py-2 text-xs text-muted-foreground">
            <span className="tabular-nums">{t("hr.estado.pagina", { a: paginaVigente * POR_PAGINA + 1, b: Math.min(vistos.length, (paginaVigente + 1) * POR_PAGINA), n: vistos.length })}</span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={paginaVigente === 0} onClick={() => setPagina(paginaVigente - 1)} aria-label={t("hr.estado.anterior")}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="sm" className="h-8 w-8 p-0" disabled={paginaVigente >= paginas - 1} onClick={() => setPagina(paginaVigente + 1)} aria-label={t("hr.estado.siguiente")}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        )}
      </section>

      {/* La foto en grande, con flechas si el renglón tiene varias. */}
      <Dialog open={!!visor} onOpenChange={(o) => !o && setVisor(null)}>
        <DialogContent className="max-w-5xl gap-3 p-3 sm:p-4">
          {visor && fotoVisor && (
            <>
              <DialogTitle className="flex flex-wrap items-baseline gap-2 pr-8 text-sm font-semibold">
                <span>{nombreDe(visor.item.userId)}</span>
                <span className="font-normal tabular-nums text-muted-foreground">{horaUI(fotoVisor.cuando)}</span>
                <span className="min-w-0 font-normal text-muted-foreground">· {fraseDe(visor.item, t)}</span>
              </DialogTitle>
              <div className="relative overflow-hidden rounded-lg bg-black">
                {urls[claveDeFoto(fotoVisor)]
                  ? <img src={urls[claveDeFoto(fotoVisor)]} alt={horaUI(fotoVisor.cuando)} className="max-h-[75vh] w-full object-contain" />
                  : <div className="flex aspect-video items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-white/60" /></div>}
                {fotosVisor.length > 1 && (
                  <>
                    <button type="button" disabled={visor.i === 0} onClick={() => setVisor({ ...visor, i: visor.i - 1 })} aria-label={t("hr.estado.anterior")}
                      className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white disabled:opacity-30">
                      <ChevronLeft className="h-5 w-5" />
                    </button>
                    <button type="button" disabled={visor.i >= fotosVisor.length - 1} onClick={() => setVisor({ ...visor, i: visor.i + 1 })} aria-label={t("hr.estado.siguiente")}
                      className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white disabled:opacity-30">
                      <ChevronRight className="h-5 w-5" />
                    </button>
                  </>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="tabular-nums">{fotosVisor.length > 1 ? `${visor.i + 1} / ${fotosVisor.length}` : ""}</span>
                <Link to={`/hr/expediente/${visor.item.userId}`} state={{ volverA: "/hr/monitor-ia?t=llamadas" }} className="font-medium text-primary hover:underline">
                  {t("hr.estado.verExpediente")}
                </Link>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
