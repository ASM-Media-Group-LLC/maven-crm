import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, MapPin, Monitor, RefreshCw, Search } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import type { TranslationKey } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserAvatar } from "@/components/UserAvatar";
import { type FilaDondeEsta, separarPantalla, type Tono, tonoDe, useDondeEsta } from "@/hooks/useDondeEsta";

// DÓNDE ESTÁ CADA UNO — la primera pestaña de Argos (Alvaro, 10/11/2026:
// «necesito saber dónde está el empleado en todo momento»). Una fila por
// empleado, lo urgente arriba: fuera de Cowork en su turno, no ha entrado, sin
// pantalla… y abajo los que están bien y los que no están en turno. Cada fila
// dice desde cuándo, qué tenía en pantalla en la última captura que leyó la IA
// y cuántas veces se salió hoy. Clic → su expediente. Se refresca cada 20 s.

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

// Sin rellenos de color (Alvaro, 12/11/2026: «no me gusta el rojo»): el estado
// va en una pastilla neutra con UN puntito de su color; el texto, en blanco/gris.
const PUNTO: Record<Tono, string> = {
  rojo: "bg-destructive",
  naranja: "bg-warning",
  neutro: "bg-primary",
  verde: "bg-success",
  gris: "bg-muted-foreground/50",
};
const PASTILLA = "inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-foreground/[0.04] px-2.5 py-0.5 text-xs font-medium";

type Filtro = "todos" | "rojo" | "naranja" | "enCowork" | "gris";
const FILTROS: { k: Filtro; label: TranslationKey }[] = [
  { k: "todos", label: "hr.donde.filtro.all" },
  { k: "rojo", label: "hr.donde.filtro.fuera" },
  { k: "naranja", label: "hr.donde.filtro.problemas" },
  { k: "enCowork", label: "hr.donde.filtro.enCowork" },
  { k: "gris", label: "hr.donde.filtro.fueraTurno" },
];

export function pasaFiltro(f: Pick<FilaDondeEsta, "estado">, filtro: Filtro): boolean {
  const tono = tonoDe(f.estado);
  if (filtro === "todos") return true;
  if (filtro === "enCowork") return tono === "verde" || tono === "neutro";
  return tono === filtro;
}

const horaBogota = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: false });

export function DondeEstaPanel() {
  const { t } = useLanguage();
  const q = useDondeEsta();
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [busqueda, setBusqueda] = useState("");
  // Primero cajitas por departamento; al tocar una, su lista (Alvaro, 13/11/2026:
  // «aquí deberían estar cajitas lindas por departamentos y ya después miro listados»).
  const [deptoSel, setDeptoSel] = useState<string | null>(null);
  // Fuera de turno va plegado (Alvaro, 13/11: «solo quien debería trabajar ahora»).
  const [verFueraTurno, setVerFueraTurno] = useState<Set<string>>(new Set());
  const ahora = Date.now();

  const duracion = (desdeIso: string | null): string => {
    if (!desdeIso) return "";
    const min = Math.max(0, Math.floor((ahora - new Date(desdeIso).getTime()) / 60_000));
    if (min < 1) return t("hr.donde.ahora");
    if (min < 60) return t("hr.donde.min", { n: min });
    return t("hr.donde.horas", { h: Math.floor(min / 60), m: min % 60 });
  };
  const hoyBogota = new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" });
  const entradaDeHoy = (hhmmss: string | null) => (hhmmss ? `${hoyBogota}T${hhmmss.slice(0, 8)}-05:00` : null);
  // Minutos sueltos → «390 min» se lee mal; «6 h 30 min» no.
  const minutosATexto = (min: number): string =>
    min < 60 ? t("hr.donde.durMin", { n: min }) : t("hr.donde.durHoras", { h: Math.floor(min / 60), m: String(min % 60).padStart(2, "0") });

  const filas = q.data ?? [];
  const conteo = useMemo(() => {
    const c: Record<Filtro, number> = { todos: filas.length, rojo: 0, naranja: 0, enCowork: 0, gris: 0 };
    for (const f of filas) for (const k of ["rojo", "naranja", "enCowork", "gris"] as Filtro[]) if (pasaFiltro(f, k)) c[k]++;
    return c;
  }, [filas]);
  const vistas = useMemo(() => {
    const norm = (s: string | null | undefined) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
    const b = norm(busqueda.trim());
    return filas.filter((f) => pasaFiltro(f, filtro)
      && (!deptoSel || (f.equipo ?? "Otros") === deptoSel)
      && (!b || [f.nombre, f.puesto, f.equipo].some((x) => norm(x).includes(b))));
  }, [filas, filtro, busqueda, deptoSel]);
  // Las cajitas: cuántos en Cowork, fuera, con problema y fuera de turno por
  // departamento. Primero donde hay más gente fuera.
  const deptos = useMemo(() => {
    const m = new Map<string, FilaDondeEsta[]>();
    for (const f of filas) { const k = f.equipo ?? "Otros"; (m.get(k) ?? m.set(k, []).get(k)!).push(f); }
    return [...m.entries()].map(([nombre, gente]) => ({
      nombre,
      total: gente.length,
      enCowork: gente.filter((f) => pasaFiltro(f, "enCowork")).length,
      fuera: gente.filter((f) => pasaFiltro(f, "rojo")).length,
      problema: gente.filter((f) => pasaFiltro(f, "naranja")).length,
      fueraTurno: gente.filter((f) => pasaFiltro(f, "gris")).length,
    })).sort((a, b) => b.fuera - a.fuera || b.problema - a.problema || a.nombre.localeCompare(b.nombre, "es"));
  }, [filas]);
  const verDeptos = !deptoSel && !busqueda.trim();

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

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="flex items-center gap-2 text-base font-semibold"><MapPin className="h-4 w-4 text-primary" />{t("hr.donde.titulo")}</h2>
        <p className="text-xs text-muted-foreground">{t("hr.donde.sub")}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder={t("hr.donde.buscar")} aria-label={t("hr.donde.buscar")} className="pl-8" />
        </div>
        {!verDeptos && <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("hr.donde.titulo")}>
          {FILTROS.map((x) => (
            <button key={x.k} type="button" onClick={() => setFiltro(x.k)} aria-pressed={filtro === x.k}
              className={`rounded-full border px-3 py-1 text-xs font-medium tabular-nums transition ${filtro === x.k ? "border-foreground/30 bg-foreground/10 text-foreground" : "border-border/60 text-muted-foreground hover:text-foreground"}`}>
              {t(x.label)} · {conteo[x.k]}
            </button>
          ))}
        </div>}
      </div>

      {/* Dentro de un departamento: volver a las cajitas. */}
      {deptoSel && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => { setDeptoSel(null); setFiltro("todos"); }}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-muted-foreground transition hover:bg-foreground/5 hover:text-foreground">
            <ChevronLeft className="h-4 w-4" />{t("hr.donde.volverDeptos")}
          </button>
          <span className="text-sm font-semibold text-foreground">{deptoSel}</span>
        </div>
      )}

      {verDeptos ? (
        // CARAS POR DEPARTAMENTO (Alvaro, 13/11/2026; eligió esta entre tres):
        // cada departamento con las caras de su gente y un puntito (verde en
        // Cowork, ámbar con problema, rojo fuera, gris apagado fuera de turno).
        // Tocar una cara abre a esa persona; «Ver lista» abre el departamento.
        <div className="grid gap-3 lg:grid-cols-2">
          {deptos.map((d) => {
            const orden: Record<string, number> = { rojo: 0, naranja: 1, verde: 2, neutro: 2, gris: 3 };
            const gente = filas.filter((f) => (f.equipo ?? "Otros") === d.nombre)
              .sort((a, b) => (orden[tonoDe(a.estado)] ?? 9) - (orden[tonoDe(b.estado)] ?? 9) || (a.nombre ?? "").localeCompare(b.nombre ?? "", "es"));
            return (
              <section key={d.nombre} className={`vidrio flex flex-col gap-3 p-4 ${d.total > 12 ? "lg:col-span-2" : ""}`}>
                <button type="button" onClick={() => setDeptoSel(d.nombre)} className="group flex items-baseline gap-2 text-left">
                  <span className="text-[15px] font-semibold text-foreground">{d.nombre}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">{t("hr.donde.gente", { n: d.total })}</span>
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">
                    <span className="font-display text-base font-semibold text-foreground">{d.enCowork}</span> {t("hr.donde.filtro.enCowork")}
                  </span>
                </button>
                <div className="flex flex-wrap gap-2.5">
                  {gente.filter((f) => tonoDe(f.estado) !== "gris" || verFueraTurno.has(d.nombre)).map((f) => {
                    const tono = tonoDe(f.estado);
                    return (
                      <Link key={f.user_id} to={`/hr/expediente/${f.user_id}`} title={`${f.nombre ?? "—"} · ${t(ETIQUETA[f.estado] ?? "hr.donde.estado.otro")}`}
                        className={`relative shrink-0 rounded-full transition hover:scale-105 ${tono === "gris" ? "opacity-45" : ""}`}>
                        <UserAvatar name={f.nombre ?? "—"} size="md" />
                        <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full ring-2 ring-background ${PUNTO[tono]}`} aria-hidden />
                      </Link>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/40 pt-2.5 text-[11px] text-muted-foreground tabular-nums">
                  {d.fuera > 0 && <span className="inline-flex items-center gap-1.5 text-foreground/85"><span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden />{d.fuera} {t("hr.donde.filtro.fuera")}</span>}
                  {d.problema > 0 && <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-warning" aria-hidden />{d.problema} {t("hr.donde.filtro.problemas")}</span>}
                  <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />{d.enCowork} {t("hr.donde.filtro.enCowork")}</span>
                  {d.fueraTurno > 0 && (
                    <button type="button" className="inline-flex items-center gap-1.5 transition hover:text-foreground"
                      onClick={() => setVerFueraTurno((v) => { const n = new Set(v); if (n.has(d.nombre)) n.delete(d.nombre); else n.add(d.nombre); return n; })}>
                      <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/50" aria-hidden />{d.fueraTurno} {t("hr.donde.filtro.fueraTurno")}
                      <span className="underline-offset-2 hover:underline">{verFueraTurno.has(d.nombre) ? t("hr.donde.ocultar") : t("hr.donde.mostrar")}</span>
                    </button>
                  )}
                  <button type="button" onClick={() => setDeptoSel(d.nombre)} className="ml-auto inline-flex items-center gap-0.5 font-medium text-muted-foreground transition hover:text-foreground">
                    {t("hr.donde.verLista")}<ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      ) : (<>

      {vistas.length === 0 ? (
        <p className="vidrio p-6 text-sm text-muted-foreground">{t("hr.donde.nadie")}</p>
      ) : (
        (() => {
          const fila = (f: FilaDondeEsta) => {
            const tono = tonoDe(f.estado);
            const { app, que } = separarPantalla(f.pantalla_que);
            const enCowork = tono === "verde" || tono === "neutro" || tono === "naranja";
            return (
              <li key={f.user_id}>
                <Link to={`/hr/expediente/${f.user_id}`}
                  className="grid gap-2 p-3 transition hover:bg-foreground/5 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)_minmax(0,1.4fr)] sm:items-center sm:gap-4 sm:px-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar name={f.nombre ?? "—"} size="sm" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{f.nombre ?? "—"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {[f.puesto, f.entrada && f.salida ? t("hr.donde.turno", { e: f.entrada.slice(0, 5), s: f.salida.slice(0, 5) }) : t("hr.donde.sinHorario")].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  </div>
                  <div className="flex min-w-0 flex-col items-start gap-1">
                    <span className={`${PASTILLA} ${tono === "gris" ? "text-muted-foreground" : "text-foreground/90"}`}>
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${PUNTO[tono]}`} aria-hidden />
                      {t(ETIQUETA[f.estado] ?? "hr.donde.estado.otro")}
                    </span>
                    {f.estado === "no_ha_entrado" && f.entrada ? (
                      <span className="text-[11px] text-foreground/85 tabular-nums">
                        {t("hr.donde.debiaEntrar", { h: f.entrada.slice(0, 5), d: duracion(entradaDeHoy(f.entrada)) })}
                      </span>
                    ) : f.estado_desde && f.estado !== "fuera_de_turno" && (
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {t("hr.donde.desde", { h: horaBogota(f.estado_desde), d: duracion(f.estado_desde) })}
                      </span>
                    )}
                    {enCowork && !f.en_turno && <span className="text-[11px] text-muted-foreground">{t("hr.donde.fueraDeHorario")}</span>}
                    {f.exento && <span className="text-[11px] text-muted-foreground">{t("hr.donde.exento")}</span>}
                  </div>
                  <div className="flex min-w-0 flex-col gap-0.5 text-xs">
                    {f.pantalla_at ? (
                      <p className="flex min-w-0 items-start gap-1.5">
                        <Monitor className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                          {app && <span className="font-semibold">{app}</span>}
                          {app && que ? " · " : null}
                          {que && <span className="text-muted-foreground">{que}</span>}
                          <span className="text-muted-foreground"> · {duracion(f.pantalla_at)}</span>
                          {f.pantalla_fuera_de_lugar && (
                            <span className="ml-1.5 inline-flex items-center gap-1 text-[11px] font-medium text-foreground/90">
                              <span className="h-1.5 w-1.5 rounded-full bg-destructive" aria-hidden />{t("hr.donde.fueraDeLugar")}
                            </span>
                          )}
                        </span>
                      </p>
                    ) : f.captura_at ? (
                      <p className="text-muted-foreground">{t("hr.donde.sinLeer", { d: duracion(f.captura_at) })}</p>
                    ) : (
                      <p className="text-muted-foreground">{t("hr.donde.sinPantallazos")}</p>
                    )}
                    {f.fuera_hoy_veces > 0 && (
                      <p className="flex items-center gap-1.5 text-muted-foreground tabular-nums">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive/80" aria-hidden />
                        {t(f.fuera_hoy_veces === 1 ? "hr.donde.fueraHoyUna" : "hr.donde.fueraHoy", { n: f.fuera_hoy_veces, d: minutosATexto(f.fuera_hoy_min) })}
                      </p>
                    )}
                  </div>
                </Link>
              </li>
            );
          };
          const enTurno = vistas.filter((f) => tonoDe(f.estado) !== "gris");
          const fuera = vistas.filter((f) => tonoDe(f.estado) === "gris");
          return (
            <div className="flex flex-col gap-3">
              {enTurno.length > 0 && <ul className="vidrio divide-y divide-border/50 overflow-hidden">{enTurno.map(fila)}</ul>}
              {fuera.length > 0 && (
                <details className="vidrio overflow-hidden">
                  <summary className="cursor-pointer select-none px-4 py-3 text-xs font-medium text-muted-foreground">
                    {t("hr.donde.fueraTurnoPlegado", { n: fuera.length })}
                  </summary>
                  <ul className="divide-y divide-border/50 border-t border-border/50">{fuera.map(fila)}</ul>
                </details>
              )}
            </div>
          );
        })()
      )}
      </>)}
    </div>
  );
}
