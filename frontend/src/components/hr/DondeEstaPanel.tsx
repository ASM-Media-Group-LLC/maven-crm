import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Check, ChevronDown, Loader2, MapPin, RefreshCw, Search, X } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { a12 } from "@/lib/horaBogota";
import type { TranslationKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { urlCaptura } from "@/hooks/useMonitorEventos";
import { UserAvatar } from "@/components/UserAvatar";
import { supabase } from "@/integrations/supabase/client";
import { type FilaDondeEsta, separarPantalla, type Tono, tonoDe, useDondeEsta } from "@/hooks/useDondeEsta";
import { useCapturasVivo } from "@/hooks/useCapturasVivo";

// PRESENCIA — la primera pestaña de Argos (Alvaro, 10/11/2026: «necesito saber
// dónde está el empleado en todo momento»).
//
// REHECHA EL 18/11/2026 (Alvaro: «esta parte es una porquería… me gusta el de
// En vivo» y «me prometiste que iba a poder ver en vivo a cada empleado dónde
// está ahorita y su pantalla»): una grilla de tarjetas de TODO el equipo. Cada
// tarjeta es su pantalla de ahora (la última captura, con su cámara en la
// esquina) y debajo su cara, su nombre, su estado y desde cuándo. Arriba,
// fichas para filtrar por estado (lo urgente primero) y por equipo. Clic → su
// expediente. Se refresca sola cada 20 s.

const ETIQUETA: Record<string, TranslationKey> = {
  activo: "hr.donde.estado.activo",
  pausa: "hr.donde.estado.pausa",
  meet: "hr.donde.estado.meet",
  en_llamada: "hr.donde.estado.enLlamada",
  sin_pantalla: "hr.donde.estado.sinPantalla",
  sin_camara: "hr.donde.estado.sinCamara",
  fuera_de_camara: "hr.donde.estado.fueraDeCamara",
  sin_conexion: "hr.donde.estado.sinConexion",
  sin_conexion_larga: "hr.donde.estado.sinConexion",
  fuera_de_cowork: "hr.donde.estado.fueraDeCowork",
  no_ha_entrado: "hr.donde.estado.noHaEntrado",
  fuera_de_turno: "hr.donde.estado.fueraDeTurno",
};

// El color va solo en el puntito (Alvaro, 12/11/2026: «no me gusta el rojo»).
const PUNTO: Record<Tono, string> = {
  rojo: "bg-destructive",
  naranja: "bg-warning",
  neutro: "bg-primary",
  verde: "bg-success",
  gris: "bg-muted-foreground/50",
};


// En el teléfono las fichas corren de lado (una sola fila); en computador se acomodan.
const FILA_DE_FICHAS = "-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] sm:flex-wrap sm:overflow-visible sm:pb-0";
const ficha = (activa: boolean) =>
  `inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
    activa ? "border-foreground/30 bg-foreground/10 text-foreground" : "border-border/40 bg-card/30 text-muted-foreground hover:bg-card/50"
  }`;

type Filtro = "enTurno" | "rojo" | "naranja" | "enCowork" | "gris";
const FILTROS: { k: Filtro; label: TranslationKey; punto: string }[] = [
  { k: "enTurno", label: "hr.donde.filtro.enTurno", punto: "" },
  { k: "rojo", label: "hr.donde.filtro.fuera", punto: PUNTO.rojo },
  { k: "naranja", label: "hr.donde.filtro.problemas", punto: PUNTO.naranja },
  { k: "enCowork", label: "hr.donde.filtro.enCowork", punto: PUNTO.verde },
  { k: "gris", label: "hr.donde.filtro.fueraTurno", punto: PUNTO.gris },
];

/** ¿Esta persona entra en el filtro? «En turno» es todos menos fuera de turno
 *  (Alvaro, 13/11: «solo quien debería trabajar ahora»). */
export function pasaFiltro(f: Pick<FilaDondeEsta, "estado">, filtro: Filtro | "todos"): boolean {
  const tono = tonoDe(f.estado);
  if (filtro === "todos") return true;
  if (filtro === "enTurno") return tono !== "gris";
  if (filtro === "enCowork") return tono === "verde" || tono === "neutro";
  return tono === filtro;
}

// En am/pm, nunca en hora militar (Alvaro, 08/11 y 18/11/2026).
const horaBogota = (iso: string) =>
  a12(new Date(iso).toLocaleTimeString("en-GB", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false })) ?? "";
const hora12 = (hhmm: string | null | undefined) => (hhmm ? a12(hhmm.slice(0, 5)) : null);

/** Las fotos de la gente. Si no se pueden leer, quedan las iniciales. */
function useFotos(ids: string[]) {
  const clave = [...ids].sort().join(",");
  return useQuery<Record<string, { foto: string | null; seed: string | null }>>({
    queryKey: ["presencia-fotos", clave],
    enabled: ids.length > 0,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      try {
        const { data } = await supabase.from("profiles").select("id, avatar_url, avatar_seed").in("id", ids);
        const m: Record<string, { foto: string | null; seed: string | null }> = {};
        for (const p of (data ?? []) as { id: string; avatar_url: string | null; avatar_seed: string | null }[]) {
          m[p.id] = { foto: p.avatar_url, seed: p.avatar_seed };
        }
        return m;
      } catch {
        return {};
      }
    },
  });
}

/** Su ÚLTIMO pantallazo y cámara de HOY, para quien no tiene uno de los últimos
 *  minutos (Alvaro, 18/11/2026: «aquí debería estar viendo pantallazos de todo
 *  el mundo»). Una consulta chica por persona (limit 1), cada minuto. */
function useUltimasDelDia(ids: string[]) {
  const clave = [...ids].sort().join(",");
  return useQuery<Record<string, { pantallaUrl: string | null; camaraUrl: string | null; ultima: string }>>({
    queryKey: ["presencia-ultimas", clave],
    enabled: ids.length > 0,
    staleTime: 50_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const hoy = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
      const desde = new Date(`${hoy}T00:00:00-05:00`).toISOString();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sinTipar = supabase as unknown as { from: (t: string) => any };
      const una = async (id: string, tipo: "pantalla" | "camara") => {
        const { data } = await sinTipar.from("monitor_capturas")
          .select("path, nas_path, en_nas, created_at")
          .eq("user_id", id).eq("tipo", tipo).gte("created_at", desde)
          .order("created_at", { ascending: false }).limit(1);
        const f = (data ?? [])[0] as { path: string | null; nas_path: string | null; en_nas: boolean; created_at: string } | undefined;
        if (!f) return null;
        const ruta = f.en_nas ? f.nas_path : f.path;
        return { url: ruta ? await urlCaptura(ruta) : null, at: f.created_at };
      };
      const m: Record<string, { pantallaUrl: string | null; camaraUrl: string | null; ultima: string }> = {};
      await Promise.all(ids.map(async (id) => {
        const [p, c] = await Promise.all([una(id, "pantalla"), una(id, "camara")]);
        if (!p && !c) return;
        m[id] = { pantallaUrl: p?.url ?? null, camaraUrl: c?.url ?? null, ultima: [p?.at, c?.at].filter(Boolean).sort().pop()! };
      }));
      return m;
    },
  });
}

type FiltroSituacion = Filtro | "todos";
const SITUACIONES: { k: FiltroSituacion; label: TranslationKey; punto: string }[] = [
  { k: "todos", label: "hr.donde.filtro.all", punto: "" },
  ...FILTROS,
];

export function DondeEstaPanel() {
  const { t } = useLanguage();
  const q = useDondeEsta();
  // Entra viendo a TODOS (Alvaro, 18/11/2026); los menús solo achican.
  const [filtro, setFiltro] = useState<FiltroSituacion>("todos");
  const [equipo, setEquipo] = useState<string | null>(null);
  // El buscador es un desplegable con todos, en orden alfabético (Alvaro,
  // 18/11/2026: «ahí debería haber un drop down con nombre alfabético»). Elegir
  // a alguien deja solo su tarjeta, esté en el estado o equipo que esté.
  const [elegido, setElegido] = useState<string | null>(null);
  const [abierto, setAbierto] = useState(false);
  const ahora = Date.now();

  const duracion = (desdeIso: string | null): string => {
    if (!desdeIso) return "";
    const min = Math.max(0, Math.floor((ahora - new Date(desdeIso).getTime()) / 60_000));
    if (min < 1) return t("hr.donde.ahora");
    if (min < 60) return t("hr.donde.min", { n: min });
    return t("hr.donde.horas", { h: Math.floor(min / 60), m: min % 60 });
  };
  const minutosATexto = (min: number): string =>
    min < 60 ? t("hr.donde.durMin", { n: min }) : t("hr.donde.durHoras", { h: Math.floor(min / 60), m: String(min % 60).padStart(2, "0") });

  const filas = q.data ?? [];
  const fotos = useFotos(filas.map((f) => f.user_id)).data ?? {};
  // Su pantalla y su cámara de AHORA (últimos 12 min). Si no hay, la tarjeta lo dice.
  const vivo = useCapturasVivo();
  const enVivo = useMemo(() => new Map(vivo.personas.map((p) => [p.userId, p])), [vivo.personas]);
  // …y, si no hay, la última de hoy (Alvaro, 18/11/2026: «pantallazos de todo el mundo»).
  const sinVivo = useMemo(() => filas.filter((f) => !enVivo.get(f.user_id)?.pantallaUrl).map((f) => f.user_id), [filas, enVivo]);
  const ultimas = useUltimasDelDia(sinVivo).data ?? {};

  // Los equipos, con cuánta gente tiene cada uno (el más grande primero).
  const equipos = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of filas) m.set(f.equipo ?? "Otros", (m.get(f.equipo ?? "Otros") ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));
  }, [filas]);
  const delEquipo = useMemo(() => filas.filter((f) => !equipo || (f.equipo ?? "Otros") === equipo), [filas, equipo]);
  const conteo = useMemo(() => {
    const c = { todos: 0, enTurno: 0, rojo: 0, naranja: 0, enCowork: 0, gris: 0 } as Record<FiltroSituacion, number>;
    for (const f of delEquipo) for (const k of Object.keys(c) as FiltroSituacion[]) if (pasaFiltro(f, k)) c[k]++;
    return c;
  }, [delEquipo]);
  const vistas = useMemo(() => {
    // Con alguien elegido se muestra solo esa persona, también fuera de turno.
    if (elegido) return filas.filter((f) => f.user_id === elegido);
    return delEquipo.filter((f) => pasaFiltro(f, filtro));
  }, [filas, delEquipo, filtro, elegido]);
  const alfabetico = useMemo(
    () => [...filas].sort((a, b) => (a.nombre ?? "").localeCompare(b.nombre ?? "", "es", { sensitivity: "base" })),
    [filas],
  );
  const nombreElegido = elegido ? filas.find((f) => f.user_id === elegido)?.nombre ?? null : null;

  // Lo que cada tarjeta dice de la persona (igual arriba y abajo).
  const datos = (f: FilaDondeEsta): Datos => {
    const tono = tonoDe(f.estado);
    const { app, que } = separarPantalla(f.pantalla_que);
    return {
      tono,
      nombre: f.nombre ?? "—",
      estado: t(ETIQUETA[f.estado] ?? "hr.donde.estado.otro"),
      pantalla: [app, que].filter(Boolean).join(" · "),
      foto: fotos[f.user_id],
      // Cada dato en su renglón, con su etiqueta (Alvaro, 18/11/2026: «separadito,
      // más fácil de entender el cuadrito»).
      desde: f.estado_desde && f.estado !== "fuera_de_turno" && f.estado !== "no_ha_entrado"
        ? { hora: horaBogota(f.estado_desde), hace: duracion(f.estado_desde) }
        : null,
      debia: f.estado === "no_ha_entrado" ? hora12(f.entrada) : null,
      turno: f.entrada && f.salida ? `${hora12(f.entrada)} – ${hora12(f.salida)}` : null,
      fueraHoy: f.fuera_hoy_veces > 0
        ? t(f.fuera_hoy_veces === 1 ? "hr.donde.val.unaVez" : "hr.donde.val.veces", { n: f.fuera_hoy_veces, d: minutosATexto(f.fuera_hoy_min) })
        : "",
    };
  };

  // En «Todos», el pantallazo más reciente de la empresa va primero (Alvaro,
  // 18/11/2026: «el último tomado es el primero que miro aquí»). Quien no tiene
  // ninguno hoy, al final.
  const ultimaDe = (id: string): number => {
    const v = enVivo.get(id);
    const iso = v?.pantallaUrl ? v.ultima : ultimas[id]?.ultima;
    return iso ? Date.parse(iso) : 0;
  };
  const ordenadas = !elegido && filtro === "todos"
    ? [...vistas].sort((a, b) => ultimaDe(b.user_id) - ultimaDe(a.user_id))
    : vistas;

  if (q.isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  if (q.isError) {
    // Un fallo no es «todos están bien»: se dice y se ofrece reintentar.
    return (
      <div role="alert" className="vidrio flex flex-wrap items-center gap-3 p-4 text-sm">
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
        <span className="min-w-0 flex-1">{t("hr.donde.fallo")}</span>
        <Button variant="outline" size="sm" onClick={() => void q.refetch()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("hr.donde.reintentar")}</Button>
      </div>
    );
  }
  if (!filas.length) return <p className="vidrio p-6 text-sm text-muted-foreground">{t("hr.donde.vacio")}</p>;

  const enCoworkTotal = filas.filter((f) => pasaFiltro(f, "enCowork")).length;
  return (
    <section className="vidrio sube p-4 lg:p-5">
      <div className="v-cont flex flex-col gap-3">
        {/* Encabezado como el de «En vivo». */}
        <div className="flex flex-wrap items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-foreground/[0.04] text-foreground/75">
            <MapPin className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-display text-base font-bold leading-tight tracking-tight">{t("hr.donde.titulo")}</h2>
            <p className="text-xs text-muted-foreground">{t("hr.donde.resumen", { n: filas.length, c: enCoworkTotal })}</p>
          </div>
          <div className="flex w-full items-center gap-1.5 sm:w-auto">
          <Popover open={abierto} onOpenChange={setAbierto}>
            <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
              <PopoverTrigger asChild>
                <button
                  type="button"
                  role="combobox"
                  aria-expanded={abierto}
                  aria-label={t("hr.donde.buscar")}
                  className="flex h-8 w-full items-center gap-2 rounded-md border border-input bg-background/40 pl-2.5 pr-8 text-left text-sm transition-colors hover:bg-foreground/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className={`min-w-0 flex-1 truncate ${nombreElegido ? "text-foreground" : "text-muted-foreground"}`}>
                    {nombreElegido ?? t("hr.donde.buscar")}
                  </span>
                </button>
              </PopoverTrigger>
              {elegido ? (
                <button
                  type="button"
                  onClick={() => setElegido(null)}
                  aria-label={t("hr.donde.verTodos")}
                  title={t("hr.donde.verTodos")}
                  className="absolute right-1 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              ) : (
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              )}
            </div>
            <PopoverContent align="end" className="w-[var(--radix-popover-trigger-width)] min-w-[17rem] p-0">
              <Command>
                <CommandInput placeholder={t("hr.donde.escribeNombre")} />
                <CommandList className="max-h-80">
                  <CommandEmpty>{t("hr.donde.nadieConEseNombre")}</CommandEmpty>
                  <CommandGroup heading={t("hr.donde.todosAZ", { n: alfabetico.length })}>
                    {alfabetico.map((f) => {
                      const foto = fotos[f.user_id];
                      const nombre = f.nombre ?? "—";
                      return (
                        <CommandItem
                          key={f.user_id}
                          value={`${nombre} ${f.user_id}`}
                          keywords={[f.puesto ?? "", f.equipo ?? ""]}
                          onSelect={() => { setElegido(f.user_id); setAbierto(false); }}
                          className="gap-2.5"
                        >
                          <span className="relative shrink-0">
                            <UserAvatar name={nombre} src={foto?.foto} seed={foto?.seed} size="xs" />
                            <span className={`absolute -bottom-0.5 -right-0.5 h-2 w-2 rounded-full border border-background ${PUNTO[tonoDe(f.estado)]}`} aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1 truncate">{nombre}</span>
                          <span className="shrink-0 text-[11px] text-muted-foreground">{f.equipo ?? ""}</span>
                          {elegido === f.user_id && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
          <button
            type="button"
            onClick={() => void q.refetch()}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground"
            title={t("hr.donde.reintentar")}
            aria-label={t("hr.donde.reintentar")}
          >
            <RefreshCw className={`h-4 w-4 ${q.isFetching ? "animate-spin" : ""}`} />
          </button>
          </div>
        </div>

        {/* Por situación: un toque y filtra (Alvaro, 18/11/2026: «antes estaba
            bien, un botoncito»). Entra en «Todos». */}
        <div className={FILA_DE_FICHAS} role="group" aria-label={t("hr.donde.porEstado")}>
          {SITUACIONES.map((x) => (
            <button key={x.k} type="button" onClick={() => { setFiltro(x.k); setElegido(null); }} aria-pressed={!elegido && filtro === x.k} className={ficha(!elegido && filtro === x.k)}>
              {x.punto && <span className={`h-1.5 w-1.5 rounded-full ${x.punto}`} />}
              {t(x.label)}
              <span className="tabular-nums opacity-70">{conteo[x.k]}</span>
            </button>
          ))}
        </div>

        {/* Por equipo. */}
        {equipos.length > 1 && (
          <div className={FILA_DE_FICHAS} role="group" aria-label={t("hr.donde.porEquipo")}>
            <button type="button" onClick={() => { setEquipo(null); setElegido(null); }} aria-pressed={!elegido && !equipo} className={ficha(!elegido && !equipo)}>
              {t("hr.donde.todosLosEquipos")}
            </button>
            {equipos.map(([nombre, n]) => (
              <button key={nombre} type="button" onClick={() => { setEquipo(nombre); setElegido(null); }} aria-pressed={!elegido && equipo === nombre} className={ficha(!elegido && equipo === nombre)}>
                {nombre}
                <span className="tabular-nums opacity-70">{n}</span>
              </button>
            ))}
          </div>
        )}

        {vistas.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <MapPin className="h-7 w-7 opacity-40" />
            <p className="text-sm">{t("hr.donde.nadie")}</p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-3 pt-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {ordenadas.map((f) => {
              const d = datos(f);
              const v = enVivo.get(f.user_id);
              const enVivoAhora = !!v?.pantallaUrl;
              const u = enVivoAhora ? null : ultimas[f.user_id];
              const pantallaUrl = enVivoAhora ? v!.pantallaUrl : u?.pantallaUrl ?? null;
              const camaraUrl = enVivoAhora ? v!.camaraUrl : u?.camaraUrl ?? null;
              const cuando = enVivoAhora ? v!.ultima : u?.ultima ?? null;
              return (
                <li key={f.user_id}>
                  <Link
                    to={`/hr/expediente/${f.user_id}`}
                    state={{ volverA: "/hr/monitor-ia?t=donde" }}
                    title={[d.nombre, d.estado, d.pantalla].filter(Boolean).join(" · ")}
                    className={`group flex h-full flex-col overflow-hidden rounded-2xl border bg-card/20 transition-colors hover:border-foreground/25 hover:bg-card/40 ${
                      f.pantalla_fuera_de_lugar && d.tono !== "gris" ? "border-destructive/40" : "border-border/40"
                    }`}
                  >
                    {/* Su pantalla (de ahora o la última de hoy), con su cámara en la esquina. */}
                    <div className="relative aspect-video w-full overflow-hidden bg-foreground/[0.04]">
                      {pantallaUrl || camaraUrl ? (
                        <img src={(pantallaUrl ?? camaraUrl)!} alt="" loading="lazy"
                          className={`h-full w-full object-cover object-top ${enVivoAhora ? "" : "opacity-70 grayscale-[35%]"}`} />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-muted-foreground">
                          <UserAvatar name={d.nombre} src={d.foto?.foto} seed={d.foto?.seed} size="lg" />
                          <span className="text-[11px]">{t("hr.donde.sinPantallazos")}</span>
                        </div>
                      )}
                      {pantallaUrl && camaraUrl && (
                        <img src={camaraUrl} alt="" loading="lazy" className="absolute right-2 top-2 h-12 w-16 rounded-lg object-cover ring-1 ring-black/40" />
                      )}
                      {cuando && (
                        <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium tabular-nums text-white backdrop-blur">
                          {enVivoAhora && <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />}
                          {enVivoAhora ? horaBogota(cuando) : t("hr.donde.ultimaHace", { h: horaBogota(cuando), d: duracion(cuando) })}
                        </span>
                      )}
                    </div>
                    <Quien f={f} d={d} />
                    <Detalles f={f} d={d} />
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

type Datos = {
  tono: Tono;
  nombre: string;
  estado: string;
  pantalla: string;
  foto: { foto: string | null; seed: string | null } | undefined;
  desde: { hora: string; hace: string } | null;
  debia: string | null;
  turno: string | null;
  fueraHoy: string;
};

/** Su cara, su nombre y su estado en una etiqueta aparte. */
function Quien({ f, d }: { f: FilaDondeEsta; d: Datos }) {
  return (
    <div className="flex items-center gap-2.5 px-3 pb-2 pt-3">
      <UserAvatar name={d.nombre} src={d.foto?.foto} seed={d.foto?.seed} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold leading-tight">{d.nombre}</p>
        <span className="mt-1 inline-flex max-w-full items-center gap-1.5 rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-medium text-foreground/85">
          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO[d.tono]}`} aria-hidden />
          <span className="truncate">{d.estado}</span>
        </span>
      </div>
      {f.pantalla_fuera_de_lugar && d.tono !== "gris" && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" aria-hidden />}
    </div>
  );
}

/** Los datos, uno por renglón y con su etiqueta: desde cuándo, qué tenía en
 *  pantalla, cuánto ha estado fuera hoy, a qué hora debía entrar o su turno. */
function Detalles({ f, d }: { f: FilaDondeEsta; d: Datos }) {
  const { t } = useLanguage();
  const filas: Array<[string, string, boolean?]> = [];
  if (d.desde) filas.push([t("hr.donde.et.desde"), `${d.desde.hora} · ${d.desde.hace}`]);
  if (d.debia) filas.push([t("hr.donde.et.debia"), d.debia]);
  if (d.pantalla && d.tono !== "gris") filas.push([t("hr.donde.et.pantalla"), d.pantalla, !!f.pantalla_fuera_de_lugar]);
  if (d.fueraHoy) filas.push([t("hr.donde.et.fueraHoy"), d.fueraHoy]);
  if (d.turno && (d.tono === "gris" || !d.desde)) filas.push([t("hr.donde.et.turno"), d.turno]);
  if (filas.length === 0) return null;
  return (
    <dl className="mt-auto grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 border-t border-border/30 px-3 py-2.5 text-[11.5px] leading-snug">
      {filas.map(([etiqueta, valor, ojo]) => (
        <div key={etiqueta} className="contents">
          <dt className="whitespace-nowrap text-muted-foreground">{etiqueta}</dt>
          <dd className={`truncate tabular-nums ${ojo ? "text-foreground" : "text-foreground/80"}`} title={valor}>
            {ojo && <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-destructive align-middle" aria-hidden />}
            {valor}
          </dd>
        </div>
      ))}
    </dl>
  );
}
