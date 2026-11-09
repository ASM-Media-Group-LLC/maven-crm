import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BarChart3, Building2, Clock, DoorOpen, Headset, MessageCircle, Timer, Users } from "lucide-react";
import SelectorDeTablero from "@/pages/dashboard/SelectorDeTablero";
import PulsoEquipoVivo from "@/components/centro/PulsoEquipoVivo";
import SaludPlataformaBloque from "@/components/centro/SaludPlataformaBloque";
import { TarjetaKpi } from "@/components/ui/TarjetaKpi";
import { Button } from "@/components/ui/button";
import { useCoworkSession, type AdminSessionRow } from "@/hooks/useCoworkSession";
import { useEquipoTiempoCowork } from "@/hooks/useEquipoTiempoCowork";
import { useProductividad7Dias } from "@/hooks/useProductividad7Dias";
import { usePanelMensajeria } from "@/hooks/usePanelMensajeria";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
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

// TarjetaKpi vive en components/ui/TarjetaKpi.tsx (compartida con el Pulso).

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
  const productividad = useProductividad7Dias();
  const maxProd = useMemo(
    () => productividad.dias.reduce((m, d) => Math.max(m, d.horas), 0),
    [productividad.dias],
  );

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
    // flex-1 min-h-0 overflow-y-auto: el scroll propio de la página. El <main>
    // del AppShell es overflow-hidden (cada página pone su scroll), si no, recorta.
    <div className="flex-1 min-h-0 overflow-y-auto p-4 pb-24 md:p-6 space-y-5">
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
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm" className="rounded-control">
            <Link to="/oficina-ai"><Building2 className="mr-1.5 h-4 w-4" />{t("dashboard.centro.virtualOffice")}</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="rounded-control">
            <Link to="/cowork"><Headset className="mr-1.5 h-4 w-4" />{t("dashboard.centro.abrirCowork")}</Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="rounded-control">
            <Link to="/messenger"><MessageCircle className="mr-1.5 h-4 w-4" />{t("dashboard.centro.abrirMessenger")}</Link>
          </Button>
        </div>
      </div>

      {/* Pulso del equipo en vivo (solo supervisor+): conectados + nota viva +
          quién la baja + cajas por equipo. Devuelve null para quien no vigila.
          Le pasamos los conectados EN COWORK (de LiveKit) para el número de arriba. */}
      <PulsoEquipoVivo coworkConectados={sesionesQ.isLoading ? null : vivo.conectados} />

      {/* Salud de la plataforma (Alvaro, 08/11 noche): "¿está todo trabajando bien?"
          — NAS/Drive, Correo, Mensajería, Argos + entradas/desconexiones del día.
          El propio bloque se oculta a quien no es admin/dueño. */}
      <SaludPlataformaBloque />

      {/* Tarjetas resumen: compactas (los conectados ya van arriba en el Pulso). */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <TarjetaKpi
          indice={1}
          icono={Clock}
          tono="success"
          etiqueta={t("dashboard.centro.coworkHoy")}
          valor={tiempoCargando ? "…" : horasBonitas(totalHoras)}
          detalle={t("dashboard.centro.personas", { n: equipoHoy.length })}
        />
        <TarjetaKpi
          indice={2}
          icono={MessageCircle}
          etiqueta={t("dashboard.centro.mensajesHoy")}
          valor={mensajeria.fallo ? "–" : mensajeria.cargando ? "…" : mensajeria.datos?.mensajesHoy ?? "–"}
          detalle={mensajeria.fallo
            ? (<span>{t("dashboard.centro.fallo")}<button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => mensajeria.reintentar()}>{t("dashboard.centro.reintentar")}</button></span>)
            : t("dashboard.centro.chatsActivos", { n: mensajeria.datos?.conversacionesActivas ?? 0 })}
        />
        <TarjetaKpi
          indice={3}
          icono={Timer}
          tono="warning"
          etiqueta={t("dashboard.centro.respuesta")}
          valor={mensajeria.fallo ? "–" : mensajeria.cargando ? "…"
            : mensajeria.datos?.respuestaPromedioS == null ? t("dashboard.centro.sinMedicion")
            : segundosBonitos(mensajeria.datos.respuestaPromedioS)}
          detalle={t("dashboard.centro.respuestaNota")}
        />
      </div>

      {/* Productividad del equipo — barras REALES de horas de Cowork por día,
          últimos 7 días (como la gráfica central del link). Hoy se resalta. */}
      <section className="vidrio sube p-4" style={{ animationDelay: "0.2s" }}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="flex items-baseline gap-2 text-sm font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-panel bg-primary/10 text-primary"><BarChart3 className="h-4 w-4" /></span>
            {t("dashboard.centro.productividad")}
            <span className="text-xs font-normal text-muted-foreground">· {t("dashboard.centro.ultimos7")}</span>
          </h2>
          <span className="flex items-center gap-1.5 text-xs text-success">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-60 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-success" />
            </span>
            {t("dashboard.centro.hoy")}
          </span>
        </div>
        {productividad.fallo ? (
          <p className="text-sm text-muted-foreground">
            {t("dashboard.centro.fallo")}
            <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => productividad.reintentar()}>{t("dashboard.centro.reintentar")}</button>
          </p>
        ) : productividad.cargando ? (
          <div className="flex h-40 items-end gap-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div key={i} className="flex-1 animate-pulse rounded-t-lg bg-muted" style={{ height: `${30 + ((i * 37) % 60)}%` }} />
            ))}
          </div>
        ) : maxProd <= 0 ? (
          <p className="text-sm text-muted-foreground">{t("dashboard.centro.sinProductividad")}</p>
        ) : (
          <div className="flex h-40 items-end gap-2.5 sm:gap-3">
            {productividad.dias.map((d, i) => (
              <div key={d.dia} className="group flex h-full flex-1 flex-col items-center justify-end gap-2">
                <span className="text-[10px] font-semibold tabular-nums text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
                  {horasBonitas(d.horas)}
                </span>
                <div
                  className={`barra-crece w-full max-w-[38px] rounded-t-lg transition-[filter] group-hover:brightness-110 ${
                    d.esHoy
                      ? "bg-gradient-to-b from-primary to-primary/40 shadow-[0_0_22px_hsl(var(--primary)/0.5)]"
                      : "bg-gradient-to-b from-primary/50 to-primary/10"
                  }`}
                  style={{ height: `${Math.max(4, (d.horas / maxProd) * 100)}%`, animationDelay: `${0.1 + i * 0.07}s` }}
                />
                <span className={`text-[11px] font-semibold ${d.esHoy ? "text-primary" : "text-muted-foreground"}`}>{d.etiqueta}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Salas en vivo — Alvaro (08/11 noche): el Pulso vuelve arriba (como estaba),
          Salud nuevo bloque debajo, y las Salas quedan tercero. */}
      <section className="vidrio sube p-4" style={{ animationDelay: "0.26s" }}>
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
                <div key={s.id} className="flex flex-col gap-2.5 rounded-panel border border-white/50 bg-white/50 dark:border-white/[0.07] dark:bg-white/[0.04] p-3">
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
      <section className="vidrio sube p-4" style={{ animationDelay: "0.3s" }}>
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
      <section className="vidrio sube flex flex-wrap items-center gap-3 p-4" style={{ animationDelay: "0.36s" }}>
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
