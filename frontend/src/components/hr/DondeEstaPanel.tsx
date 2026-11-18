import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, MapPin, RefreshCw, Search } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

const horaBogota = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false });

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

export function DondeEstaPanel() {
  const { t } = useLanguage();
  const q = useDondeEsta();
  const [filtro, setFiltro] = useState<Filtro>("enTurno");
  const [equipo, setEquipo] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
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

  // Los equipos, con cuánta gente tiene cada uno (el más grande primero).
  const equipos = useMemo(() => {
    const m = new Map<string, number>();
    for (const f of filas) m.set(f.equipo ?? "Otros", (m.get(f.equipo ?? "Otros") ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"));
  }, [filas]);
  const delEquipo = useMemo(() => filas.filter((f) => !equipo || (f.equipo ?? "Otros") === equipo), [filas, equipo]);
  const conteo = useMemo(() => {
    const c = { enTurno: 0, rojo: 0, naranja: 0, enCowork: 0, gris: 0 } as Record<Filtro, number>;
    for (const f of delEquipo) for (const k of Object.keys(c) as Filtro[]) if (pasaFiltro(f, k)) c[k]++;
    return c;
  }, [delEquipo]);
  const vistas = useMemo(() => {
    const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const b = norm(busqueda.trim());
    // Buscando a alguien se busca en todos, también fuera de turno.
    return delEquipo.filter((f) => (b ? true : pasaFiltro(f, filtro))
      && (!b || [f.nombre, f.puesto, f.equipo].some((x) => norm(x).includes(b))));
  }, [delEquipo, filtro, busqueda]);

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
      linea: f.estado === "no_ha_entrado" && f.entrada
        ? t("hr.donde.debiaEntrarCorto", { h: f.entrada.slice(0, 5) })
        : f.estado_desde && f.estado !== "fuera_de_turno"
          ? t("hr.donde.desdeCorto", { h: horaBogota(f.estado_desde), d: duracion(f.estado_desde) })
          : f.entrada && f.salida
            ? t("hr.donde.turno", { e: f.entrada.slice(0, 5), s: f.salida.slice(0, 5) })
            : "",
      fueraHoy: f.fuera_hoy_veces > 0
        ? t(f.fuera_hoy_veces === 1 ? "hr.donde.fueraHoyUna" : "hr.donde.fueraHoy", { n: f.fuera_hoy_veces, d: minutosATexto(f.fuera_hoy_min) })
        : "",
    };
  };
  // Con pantalla en vivo (últimos 12 min) arriba y en grande; el resto, abajo en lista.
  const tienePantalla = (f: FilaDondeEsta) => tonoDe(f.estado) !== "gris" && !!enVivo.get(f.user_id)?.pantallaUrl;
  const conPantalla = vistas.filter(tienePantalla);
  const sinPantalla = vistas.filter((f) => !tienePantalla(f));

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
  const ficha = (activa: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
      activa ? "border-foreground/30 bg-foreground/10 text-foreground" : "border-border/40 bg-card/30 text-muted-foreground hover:bg-card/50"
    }`;

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
          <div className="relative min-w-0 flex-1 sm:w-64 sm:flex-none">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder={t("hr.donde.buscar")} aria-label={t("hr.donde.buscar")} className="h-8 pl-8 text-sm" />
          </div>
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

        {/* Por estado. */}
        <div className={FILA_DE_FICHAS} role="group" aria-label={t("hr.donde.porEstado")}>
          {FILTROS.map((x) => (
            <button key={x.k} type="button" onClick={() => setFiltro(x.k)} aria-pressed={filtro === x.k} className={ficha(filtro === x.k)}>
              {x.punto && <span className={`h-1.5 w-1.5 rounded-full ${x.punto}`} />}
              {t(x.label)}
              <span className="tabular-nums opacity-70">{conteo[x.k]}</span>
            </button>
          ))}
        </div>

        {/* Por equipo. */}
        {equipos.length > 1 && (
          <div className={FILA_DE_FICHAS} role="group" aria-label={t("hr.donde.porEquipo")}>
            <button type="button" onClick={() => setEquipo(null)} aria-pressed={!equipo} className={ficha(!equipo)}>
              {t("hr.donde.todosLosEquipos")}
            </button>
            {equipos.map(([nombre, n]) => (
              <button key={nombre} type="button" onClick={() => setEquipo(nombre)} aria-pressed={equipo === nombre} className={ficha(equipo === nombre)}>
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
          <>
            {/* Arriba, quien tiene pantalla en vivo: su pantalla en grande. */}
            {conPantalla.length > 0 && (
              <div className="flex flex-col gap-2.5 pt-1">
                <Encabezado texto={t("hr.donde.enPantalla")} n={conPantalla.length} vivo />
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {conPantalla.map((f) => {
                    const d = datos(f);
                    const vivoDe = enVivo.get(f.user_id)!;
                    return (
                      <li key={f.user_id}>
                        <Link
                          to={`/hr/expediente/${f.user_id}`}
                          state={{ volverA: "/hr/monitor-ia?t=donde" }}
                          title={[d.nombre, d.estado, d.pantalla].filter(Boolean).join(" · ")}
                          className={`group flex h-full flex-col overflow-hidden rounded-2xl border bg-card/20 transition-colors hover:border-foreground/25 hover:bg-card/40 ${
                            f.pantalla_fuera_de_lugar ? "border-destructive/40" : "border-border/40"
                          }`}
                        >
                          {/* Su pantalla de ahora, con su cámara en la esquina. */}
                          <div className="relative aspect-video w-full overflow-hidden bg-foreground/[0.04]">
                            <img src={vivoDe.pantallaUrl!} alt="" loading="lazy" className="h-full w-full object-cover object-top" />
                            {vivoDe.camaraUrl && (
                              <img src={vivoDe.camaraUrl} alt="" loading="lazy" className="absolute right-2 top-2 h-12 w-16 rounded-lg object-cover ring-1 ring-black/40" />
                            )}
                            <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-medium tabular-nums text-white backdrop-blur">
                              {horaBogota(vivoDe.ultima)}
                            </span>
                          </div>
                          <Quien f={f} d={d} />
                          <Detalles f={f} d={d} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Abajo, quien no tiene pantalla ahora: una lista compacta, lo urgente primero. */}
            {sinPantalla.length > 0 && (
              <div className={`flex flex-col gap-2.5 ${conPantalla.length > 0 ? "border-t border-border/30 pt-4" : "pt-1"}`}>
                <Encabezado texto={t("hr.donde.sinPantallaTitulo")} n={sinPantalla.length} />
                <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                  {sinPantalla.map((f) => {
                    const d = datos(f);
                    return (
                      <li key={f.user_id}>
                        <Link
                          to={`/hr/expediente/${f.user_id}`}
                          state={{ volverA: "/hr/monitor-ia?t=donde" }}
                          title={[d.nombre, d.estado, d.pantalla].filter(Boolean).join(" · ")}
                          className={`flex h-full flex-col rounded-xl border border-border/40 bg-card/20 transition-colors hover:border-foreground/25 hover:bg-card/40 ${
                            d.tono === "gris" ? "opacity-60" : ""
                          }`}
                        >
                          <Quien f={f} d={d} />
                          <Detalles f={f} d={d} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
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
  linea: string;
  fueraHoy: string;
};

function Encabezado({ texto, n, vivo }: { texto: string; n: number; vivo?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
      {vivo && (
        <span className="relative flex h-2 w-2" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
        </span>
      )}
      <span>{texto}</span>
      <span className="tabular-nums text-muted-foreground/70">{n}</span>
    </div>
  );
}

/** Su cara con el puntito del estado, su nombre y en qué anda. */
function Quien({ f, d }: { f: FilaDondeEsta; d: Datos }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5">
      <span className="relative shrink-0">
        <UserAvatar name={d.nombre} src={d.foto?.foto} seed={d.foto?.seed} size="sm" />
        <span className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-background ${PUNTO[d.tono]}`} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{d.nombre}</p>
        <p className={`truncate text-[11px] ${d.tono === "verde" || d.tono === "gris" ? "text-muted-foreground" : "text-foreground/85"}`}>
          {d.estado}{d.linea ? <span className="tabular-nums text-muted-foreground"> · {d.linea}</span> : null}
        </p>
      </div>
      {f.pantalla_fuera_de_lugar && d.tono !== "gris" && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" aria-hidden />}
    </div>
  );
}

/** Qué tiene en pantalla y cuántas veces salió hoy, si hay algo que decir. */
function Detalles({ f, d }: { f: FilaDondeEsta; d: Datos }) {
  const conPantalla = !!d.pantalla && d.tono !== "gris";
  if (!conPantalla && !d.fueraHoy) return null;
  return (
    <div className="mt-auto flex flex-col gap-0.5 border-t border-border/30 px-3 py-2 text-[11px] text-muted-foreground">
      {conPantalla && <p className={`truncate ${f.pantalla_fuera_de_lugar ? "text-foreground/90" : ""}`}>{d.pantalla}</p>}
      {d.fueraHoy && <p className="truncate tabular-nums">{d.fueraHoy}</p>}
    </div>
  );
}
