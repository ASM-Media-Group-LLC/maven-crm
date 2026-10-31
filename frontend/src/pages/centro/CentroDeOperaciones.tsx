import { useMemo, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowRight, BarChart3, Clock, DoorOpen, Headset, MessageCircle, Timer, TrendingUp, Users } from "lucide-react";
import SelectorDeTablero from "@/pages/dashboard/SelectorDeTablero";
import { Button } from "@/components/ui/button";
import { useCoworkSession, type AdminSessionRow } from "@/hooks/useCoworkSession";
import { useEquipoTiempoCowork } from "@/hooks/useEquipoTiempoCowork";
import { usePanelMensajeria } from "@/hooks/usePanelMensajeria";
import { useCentroAhora } from "@/hooks/useCentroAhora";
import { useChatterPeriodo, rangoDeDias } from "@/pages/chatters/useChatterRendimiento";
import { useRoster } from "@/pages/chatters/horarios/useHorarios";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { type TranslationKey } from "@/lib/i18n";
import { BUILD_PROPIO } from "@/lib/versionDelBundle";
import { tituloBonito } from "@/lib/tituloBonito";

// CENTRO DE OPERACIONES — el tablero por defecto del admin desde el rediseño
// Aurora (10/2026, decisión de Alvaro): lo primero son las LLAMADAS y la
// MENSAJERÍA — quién está conectado, en qué salas, cuánto llevan hoy y cómo
// respira el chat. Ventas NO se borró: sigue entero en ?ver=ventas y en la
// tarjeta discreta del final. Nada de murallas de números: tarjetas compactas
// arriba, el detalle en vivo abajo.
//
// Datos: salas/conectados = adminListSessions (edge cowork-session + LiveKit;
// online null = LiveKit no contestó → se pinta "–", nunca 0). Tiempo de hoy =
// RPC equipo_tiempo_cowork (día contable America/Bogota, igual que el resto
// del reloj). Mensajería = RPC messenger_metricas_del_dia (solo admin).

/** El día contable del reloj de Cowork corre en Bogotá. */
const hoyBogota = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date());

const iniciales = (nombre: string | null | undefined) =>
  (nombre ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "·";

const horasBonitas = (horas: number) => {
  const total = Math.round(horas * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${h} h ${String(m).padStart(2, "0")} m` : `${m} m`;
};

const segundosBonitos = (s: number) => {
  const total = Math.round(s);
  const m = Math.floor(total / 60);
  const seg = total % 60;
  return m > 0 ? `${m} m ${String(seg).padStart(2, "0")} s` : `${seg} s`;
};

const dinero = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

// Estados problemáticos del reloj de Cowork → su etiqueta. El mapa es explícito
// (y no un template string) para que el diccionario lo pueda verificar.
const ESTADOS_PROBLEMA: Record<string, TranslationKey> = {
  sin_camara: "dashboard.centro.estado.sin_camara",
  sin_pantalla: "dashboard.centro.estado.sin_pantalla",
  fuera_de_camara: "dashboard.centro.estado.fuera_de_camara",
  sin_conexion: "dashboard.centro.estado.sin_conexion",
  sin_conexion_larga: "dashboard.centro.estado.sin_conexion_larga",
};
const ETIQUETA_PAUSA_CENTRO: Record<string, TranslationKey> = {
  bano: "dashboard.centro.pausaKind.bano",
  break: "dashboard.centro.pausaKind.break",
  almuerzo: "dashboard.centro.pausaKind.almuerzo",
};

function TarjetaKpi({ icono: Icono, etiqueta, valor, detalle, tono = "primary" }: {
  icono: typeof Users;
  etiqueta: string;
  valor: ReactNode;
  detalle: ReactNode;
  tono?: "primary" | "success" | "warning";
}) {
  const chip =
    tono === "success" ? "bg-success/10 text-success"
    : tono === "warning" ? "bg-warning/10 text-warning"
    : "bg-primary/10 text-primary";
  return (
    <div className="rounded-card border border-border bg-card/[0.72] p-4 flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-panel ${chip}`}>
          <Icono className="h-[18px] w-[18px]" />
        </span>
        <span className="text-xs font-medium text-muted-foreground">{etiqueta}</span>
      </div>
      <div className="font-display text-[26px] font-bold leading-none tracking-tight tabular-nums">{valor}</div>
      <div className="text-xs text-muted-foreground">{detalle}</div>
    </div>
  );
}

export default function CentroDeOperaciones() {
  const { t } = useLanguage();
  const [params, setParams] = useSearchParams();
  const hoy = hoyBogota();

  // Sesiones y salas en vivo (el hook se monta sin sesión: solo usamos la
  // acción de admin, que trae conectados reales desde LiveKit).
  const cowork = useCoworkSession(null);
  const sesionesQ = useQuery({
    queryKey: ["centro-sesiones-vivo"],
    refetchInterval: 45_000,
    staleTime: 20_000,
    queryFn: () => cowork.adminListSessions(),
  });
  const sesiones: AdminSessionRow[] = sesionesQ.data ?? [];

  const { porPersona, cargando: tiempoCargando } = useEquipoTiempoCowork(hoy, hoy);
  const mensajeria = usePanelMensajeria();

  // ── Vista de dueño (10/2026, Alvaro): primero LO QUE ESTÁ MAL ahora y el
  // rendimiento del equipo; el pulso operativo queda debajo. ──
  const ahoraQ = useCentroAhora();
  const ahora = ahoraQ.data ?? [];
  const faltan = useMemo(() => ahora.filter((p) => p.programado && !p.conectado), [ahora]);
  const pausasPasadas = useMemo(() => ahora.filter((p) => p.pausa_excedida), [ahora]);
  const conProblema = useMemo(
    () => ahora.filter((p) => p.conectado && p.estado != null && p.estado in ESTADOS_PROBLEMA),
    [ahora],
  );
  const programadosTurno = useMemo(() => ahora.filter((p) => p.programado).length, [ahora]);
  const conectadosTurno = useMemo(() => ahora.filter((p) => p.programado && p.conectado).length, [ahora]);
  const todoEnOrden = faltan.length === 0 && pausasPasadas.length === 0 && conProblema.length === 0;

  // Rendimiento: últimos 7 días CERRADOS (las notas/ventas confiables llegan
  // hasta ayer; se dice en la pantalla, no se finge "hoy").
  const rango = useMemo(() => rangoDeDias(7), []);
  const periodoQ = useChatterPeriodo(rango.desde, rango.hasta);
  const conDatos = useMemo(
    () => (periodoQ.data ?? []).filter((c) => c.activo && ((c.ventas_total ?? 0) > 0 || c.dias_con_nota > 0)),
    [periodoQ.data],
  );
  const topVentas = useMemo(
    () => [...conDatos].sort((a, b) => (b.ventas_total ?? 0) - (a.ventas_total ?? 0)).slice(0, 5),
    [conDatos],
  );
  const aEmpujar = useMemo(
    () => conDatos.filter((c) => c.nota_promedio != null)
      .sort((a, b) => (a.nota_promedio ?? 0) - (b.nota_promedio ?? 0)).slice(0, 5),
    [conDatos],
  );
  const roster = useRoster();
  const porEquipo = useMemo(() => {
    const grupoDe = new Map(roster.miembros.map((m) => [m.identity_id, m.group_id]));
    const nombreDe = new Map(roster.grupos.map((g) => [g.id, g.name]));
    const acc = new Map<string, number>();
    for (const c of periodoQ.data ?? []) {
      const gid = grupoDe.get(c.identity_id);
      if (!gid) continue;
      const nombre = nombreDe.get(gid);
      if (!nombre) continue;
      acc.set(nombre, (acc.get(nombre) ?? 0) + (c.ventas_total ?? 0));
    }
    return [...acc.entries()].map(([equipo, ventas]) => ({ equipo, ventas })).sort((a, b) => b.ventas - a.ventas);
  }, [periodoQ.data, roster.miembros, roster.grupos]);
  const maxEquipo = porEquipo[0]?.ventas ?? 0;

  // Totales de la cabecera. online null = LiveKit no contestó: se propaga como
  // desconocido ("–"), jamás como cero.
  const vivo = useMemo(() => {
    if (!sesiones.length) return { conectados: 0 as number | null, salasConGente: 0, sesiones: 0, hub: 0, desconocido: false };
    let conectados = 0, salasConGente = 0, hub = 0, desconocido = false;
    for (const s of sesiones) {
      if (s.online == null) desconocido = true; else conectados += s.online;
      hub += s.hubOnline ?? 0;
      for (const r of s.rooms) if ((r.online ?? 0) > 0) salasConGente++;
    }
    return { conectados: desconocido && conectados === 0 ? null : conectados, salasConGente, sesiones: sesiones.length, hub, desconocido };
  }, [sesiones]);

  const equipoHoy = useMemo(() => {
    const filas = [...porPersona.entries()]
      .map(([userId, tCw]) => ({ userId, horas: tCw.horas }))
      .filter((f) => f.horas > 0)
      .sort((a, b) => b.horas - a.horas);
    return filas;
  }, [porPersona]);
  const top = equipoHoy.slice(0, 8);
  const maxHoras = top[0]?.horas ?? 0;
  const totalHoras = equipoHoy.reduce((acc, f) => acc + f.horas, 0);

  const nombresQ = useQuery({
    enabled: top.length > 0,
    queryKey: ["centro-nombres", top.map((f) => f.userId).join(",")],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", top.map((f) => f.userId));
      if (error) throw new Error(error.message);
      return new Map((data ?? []).map((p) => [p.id, { nombre: p.full_name, foto: p.avatar_url }]));
    },
  });
  const nombres = nombresQ.data;

  const abrirVentas = () => {
    const siguiente = new URLSearchParams(params);
    siguiente.set("ver", "ventas");
    setParams(siguiente);
  };

  return (
    <div className="fondo-glass p-4 md:p-6 space-y-5">
      {/* Cabecera */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <SelectorDeTablero actual="centro" />
          <p className="mt-0.5 text-sm text-muted-foreground">{t("dashboard.centro.subtitulo")}</p>
          {/* La hora del build que carga ESTA pestaña (meta maven-build): con verla,
              se sabe si el último cambio ya llegó, sin adivinar. 0 = dev/tests. */}
          {BUILD_PROPIO > 0 && (
            <p className="mt-0.5 text-xs text-muted-foreground/80 tabular-nums">
              {t("dashboard.centro.version")}{" "}
              {new Date(BUILD_PROPIO).toLocaleString(undefined, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm" className="rounded-control">
            <Link to="/cowork"><Headset className="mr-1.5 h-4 w-4" />{t("dashboard.centro.abrirCowork")}</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="rounded-control">
            <Link to="/messenger"><MessageCircle className="mr-1.5 h-4 w-4" />{t("dashboard.centro.abrirMessenger")}</Link>
          </Button>
        </div>
      </div>

      {/* ── AHORA MISMO: lo que está mal, primero (vista de dueño) ── */}
      <section className="rounded-card border border-border bg-card p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <span className={`flex h-7 w-7 items-center justify-center rounded-panel ${todoEnOrden && !ahoraQ.isLoading && !ahoraQ.isError ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
              <AlertTriangle className="h-4 w-4" />
            </span>
            {t("dashboard.centro.ahoraTitulo")}
          </h2>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
        </div>
        {ahoraQ.isError ? (
          <p className="text-sm text-muted-foreground">
            {t("dashboard.centro.fallo")}
            <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => ahoraQ.refetch()}>{t("dashboard.centro.reintentar")}</button>
          </p>
        ) : ahoraQ.isLoading ? (
          <div className="h-10 animate-pulse rounded-panel bg-muted" />
        ) : todoEnOrden ? (
          <p className="text-sm font-medium text-success">{t("dashboard.centro.todoEnOrden", { con: conectadosTurno, prog: programadosTurno })}</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {faltan.length > 0 && (
              <div className="rounded-panel border border-destructive/30 bg-destructive/5 p-3">
                <h3 className="mb-1.5 text-xs font-semibold text-destructive">{t("dashboard.centro.faltan")} · {faltan.length}</h3>
                <ul className="space-y-1">
                  {faltan.map((p) => (
                    <li key={p.user_id} className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate">{p.nombre ?? "…"}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{p.grupo ?? ""}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {pausasPasadas.length > 0 && (
              <div className="rounded-panel border border-warning/30 bg-warning/5 p-3">
                <h3 className="mb-1.5 text-xs font-semibold text-warning">{t("dashboard.centro.pausasPasadas")} · {pausasPasadas.length}</h3>
                <ul className="space-y-1">
                  {pausasPasadas.map((p) => {
                    const deMas = Math.max(1, Math.floor(((p.pausa_seg ?? 0) - (p.pausa_limite_min ?? 0) * 60) / 60));
                    const kind = p.pausa_kind && ETIQUETA_PAUSA_CENTRO[p.pausa_kind];
                    return (
                      <li key={p.user_id} className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate">{p.nombre ?? "…"}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{kind ? t(kind) : p.pausa_kind} · {t("dashboard.centro.pausaDeMas", { min: deMas })}</span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {conProblema.length > 0 && (
              <div className="rounded-panel border border-border bg-background/60 p-3">
                <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">{t("dashboard.centro.conProblema")} · {conProblema.length}</h3>
                <ul className="space-y-1">
                  {conProblema.map((p) => (
                    <li key={p.user_id} className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate">{p.nombre ?? "…"}</span>
                      <span className="shrink-0 text-xs text-warning">{t(ESTADOS_PROBLEMA[p.estado as string])}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── RENDIMIENTO DEL EQUIPO (cierre de ayer) ── */}
      <section className="rounded-card border border-border bg-card p-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-panel bg-primary/10 text-primary"><TrendingUp className="h-4 w-4" /></span>
            {t("dashboard.centro.rendimientoTitulo")}
          </h2>
          <Button asChild variant="ghost" size="sm" className="rounded-control text-xs">
            <Link to="/chatter-evaluator/rendimiento">{t("dashboard.centro.verRendimiento")}<ArrowRight className="ml-1 h-3.5 w-3.5" /></Link>
          </Button>
        </div>
        <p className="mb-3 text-xs text-muted-foreground">{t("dashboard.centro.rendimientoNota")}</p>
        {periodoQ.isError ? (
          <p className="text-sm text-muted-foreground">
            {t("dashboard.centro.fallo")}
            <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => periodoQ.refetch()}>{t("dashboard.centro.reintentar")}</button>
          </p>
        ) : periodoQ.isLoading ? (
          <div className="grid gap-3 md:grid-cols-3">
            <div className="h-28 animate-pulse rounded-panel bg-muted" />
            <div className="h-28 animate-pulse rounded-panel bg-muted" />
            <div className="h-28 animate-pulse rounded-panel bg-muted" />
          </div>
        ) : conDatos.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("dashboard.centro.sinRendimiento")}</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <div>
              <h3 className="mb-1.5 text-xs font-semibold text-success">{t("dashboard.centro.topVentas")}</h3>
              <ul className="space-y-1">
                {topVentas.map((c) => (
                  <li key={c.identity_id} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate">{c.display_name}</span>
                    <span className="shrink-0 font-semibold tabular-nums">{dinero(c.ventas_total ?? 0)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-1.5 text-xs font-semibold text-warning">{t("dashboard.centro.aEmpujar")}</h3>
              <ul className="space-y-1">
                {aEmpujar.map((c) => (
                  <li key={c.identity_id} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate">{c.display_name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {t("dashboard.centro.notaCorta", { n: c.nota_promedio?.toFixed(1) ?? "–" })} · {dinero(c.ventas_total ?? 0)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-1.5 text-xs font-semibold text-muted-foreground">{t("dashboard.centro.porEquipo")}</h3>
              <ul className="space-y-1.5">
                {porEquipo.slice(0, 6).map((e) => (
                  <li key={e.equipo} className="text-sm">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate">{tituloBonito(e.equipo)}</span>
                      <span className="shrink-0 font-semibold tabular-nums">{dinero(e.ventas)}</span>
                    </span>
                    <span className="mt-0.5 block h-1 overflow-hidden rounded-full bg-primary/15">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${maxEquipo > 0 ? Math.max(4, (e.ventas / maxEquipo) * 100) : 0}%` }} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>

      {/* Tarjetas resumen: compactas, lo vivo primero */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <TarjetaKpi
          icono={Users}
          etiqueta={t("dashboard.centro.conectados")}
          valor={sesionesQ.isLoading ? "…" : vivo.conectados == null ? "–" : vivo.conectados}
          detalle={t("dashboard.centro.enSalas", { salas: vivo.salasConGente, sesiones: vivo.sesiones })}
        />
        <TarjetaKpi
          icono={Clock}
          tono="success"
          etiqueta={t("dashboard.centro.coworkHoy")}
          valor={tiempoCargando ? "…" : horasBonitas(totalHoras)}
          detalle={t("dashboard.centro.personas", { n: equipoHoy.length })}
        />
        <TarjetaKpi
          icono={MessageCircle}
          etiqueta={t("dashboard.centro.mensajesHoy")}
          valor={mensajeria.fallo ? "–" : mensajeria.cargando ? "…" : mensajeria.datos?.mensajesHoy ?? "–"}
          detalle={mensajeria.fallo
            ? (<span>{t("dashboard.centro.fallo")}<button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => mensajeria.reintentar()}>{t("dashboard.centro.reintentar")}</button></span>)
            : t("dashboard.centro.chatsActivos", { n: mensajeria.datos?.conversacionesActivas ?? 0 })}
        />
        <TarjetaKpi
          icono={Timer}
          tono="warning"
          etiqueta={t("dashboard.centro.respuesta")}
          valor={mensajeria.fallo ? "–" : mensajeria.cargando ? "…"
            : mensajeria.datos?.respuestaPromedioS == null ? t("dashboard.centro.sinMedicion")
            : segundosBonitos(mensajeria.datos.respuestaPromedioS)}
          detalle={t("dashboard.centro.respuestaNota")}
        />
      </div>

      {/* Salas en vivo */}
      <section className="rounded-card border border-border bg-card/[0.72] p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-panel bg-primary/10 text-primary"><DoorOpen className="h-4 w-4" /></span>
            {t("dashboard.centro.salasEnVivo")}
          </h2>
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
          </span>
        </div>
        {sesionesQ.isError ? (
          <p className="text-sm text-muted-foreground">
            {t("dashboard.centro.fallo")}
            <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => sesionesQ.refetch()}>{t("dashboard.centro.reintentar")}</button>
          </p>
        ) : sesionesQ.isLoading ? (
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="h-16 animate-pulse rounded-panel bg-muted" />
            <div className="h-16 animate-pulse rounded-panel bg-muted" />
          </div>
        ) : sesiones.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("dashboard.centro.sinSesiones")}</p>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {sesiones.map((s) => {
              // Interfaz nueva (Alvaro, 10/2026 — "mejor interfaz de salas"): el
              // muro de chips iguales se separa en DOS. Las salas con gente suben
              // como filas con las INICIALES de quién está adentro (r.gente, de la
              // DB) + el conteo en vivo; las vacías se recogen en un resumen, para
              // que de un vistazo se vea DÓNDE hay movimiento y no una pared.
              const activas = s.rooms.filter((r) => (r.online ?? 0) > 0);
              const reposo = s.rooms.filter((r) => (r.online ?? 0) === 0);
              const enLinea = s.online == null ? "–" : s.online;
              return (
                <div key={s.id} className="flex flex-col gap-2.5 rounded-panel border border-border bg-background/60 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{tituloBonito(s.name)}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      <span className={`inline-flex items-center gap-1 rounded-control px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${(s.online ?? 0) > 0 ? "bg-success/10 text-success" : "text-muted-foreground"}`}>
                        <Users className="h-3 w-3" />{enLinea}
                      </span>
                      {(s.hubOnline ?? 0) > 0 && (
                        <span className="rounded-control bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                          {t("dashboard.centro.hub")} {s.hubOnline}
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Salas con gente ahora: fila por sala con iniciales + conteo. */}
                  {activas.length > 0 && (
                    <div className="flex flex-col gap-1">
                      {activas.map((r) => {
                        const gente = r.gente ?? [];
                        const visibles = gente.slice(0, 4);
                        return (
                          <div key={r.id} className="flex items-center gap-2 rounded-control bg-success/5 px-2 py-1.5">
                            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
                            <span className="truncate text-xs font-medium">{tituloBonito(r.name)}</span>
                            <span className="ml-auto flex shrink-0 items-center gap-1">
                              {visibles.map((nm, i) => (
                                <span key={i} title={nm} className="flex h-5 w-5 items-center justify-center rounded-full bg-success/15 text-[9px] font-bold text-success">
                                  {iniciales(nm)}
                                </span>
                              ))}
                              <span className="ml-0.5 text-xs font-semibold tabular-nums text-success">{r.online}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Vacías: recogidas. Si NO hay ninguna activa, una línea calma
                      con el total; si hay activas, un solo chip "+N en reposo"
                      (con los nombres en el title) en vez del muro gris. */}
                  {activas.length === 0 ? (
                    reposo.length > 0 ? (
                      <span className="text-xs text-muted-foreground">
                        {reposo.length === 1 ? t("dashboard.centro.unaSalaLista") : t("dashboard.centro.salasListas", { n: reposo.length })}
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t("dashboard.centro.sinSalas")}</span>
                    )
                  ) : reposo.length > 0 && (
                    <span
                      className="w-fit rounded-control bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                      title={reposo.map((r) => r.name).join(", ")}
                    >
                      +{reposo.length} {t("dashboard.centro.enReposo")}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Tiempo del equipo hoy */}
      <section className="rounded-card border border-border bg-card p-4">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-panel bg-success/10 text-success"><Clock className="h-4 w-4" /></span>
          {t("dashboard.centro.equipoHoy")}
        </h2>
        {tiempoCargando ? (
          <div className="space-y-2">
            <div className="h-9 animate-pulse rounded-panel bg-muted" />
            <div className="h-9 animate-pulse rounded-panel bg-muted" />
          </div>
        ) : top.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("dashboard.centro.sinReloj")}</p>
        ) : (
          <div className="grid gap-x-6 gap-y-1.5 md:grid-cols-2">
            {top.map((f) => {
              const perfil = nombres?.get(f.userId);
              return (
                <div key={f.userId} className="flex items-center gap-3 py-1">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 text-xs font-bold text-primary">
                    {perfil?.foto
                      ? <img src={perfil.foto} alt="" className="h-full w-full object-cover" />
                      : iniciales(perfil?.nombre)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{perfil?.nombre ?? "…"}</span>
                    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-primary/15">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${maxHoras > 0 ? Math.max(6, (f.horas / maxHoras) * 100) : 0}%` }} />
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{horasBonitas(f.horas)}</span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Ventas, empujado al fondo pero entero: todo el tablero vive detrás de este botón. */}
      <section className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-card/50 p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-panel bg-muted text-muted-foreground"><BarChart3 className="h-[18px] w-[18px]" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold">{t("dashboard.centro.ventasTitulo")}</span>
          <span className="block text-xs text-muted-foreground">{t("dashboard.centro.ventasDetalle")}</span>
        </span>
        <Button variant="outline" size="sm" className="rounded-control" onClick={abrirVentas}>
          {t("dashboard.centro.abrirVentas")}<ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </section>
    </div>
  );
}
