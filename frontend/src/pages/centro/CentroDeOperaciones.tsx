import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BarChart3, Clock, DoorOpen, MessageCircle, Timer } from "lucide-react";
import PulsoEquipoVivo, { NumerosDelInicio } from "@/components/centro/PulsoEquipoVivo";
import QuienEstaBajando from "@/components/vigilancia/QuienEstaBajando";
import SaludPlataformaBloque from "@/components/centro/SaludPlataformaBloque";
import EspacioNasLinea from "@/components/centro/EspacioNasLinea";
import { PuntualidadSemana } from "@/components/centro/PuntualidadSemana";
import { SesionEnVivo } from "@/components/centro/SesionEnVivo";
import { useFotosDe } from "@/hooks/useHoyDelEquipo";
import { TarjetaKpi } from "@/components/ui/TarjetaKpi";
import { Button } from "@/components/ui/button";
import { useCoworkSession, type AdminSessionRow } from "@/hooks/useCoworkSession";
import { useEquipoTiempoCowork } from "@/hooks/useEquipoTiempoCowork";
import { usePanelMensajeria } from "@/hooks/usePanelMensajeria";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
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
  // Las caras de quién está adentro de cada sala (Alvaro, 18/11/2026).
  const fotosSalas = useFotosDe([...new Set(sesiones.flatMap((s) => s.rooms.flatMap((r) => (r.adentro ?? []).map((p) => p.id))))]).data ?? {};

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
      {/* Teléfono: lo PRIMERO que se ve al abrir Maven es quién está bajando la
          nota ahora (Alvaro, 11/11). En la computadora va arriba del Pulso. */}
      <QuienEstaBajando lugar="arriba" />

      {/* Sin cabecera (Alvaro, 18/11/2026: «todo eso no se necesita, volátelo,
          que quede más espacio y que quede estético»): ni el título con el
          selector, ni la versión de la app, ni los botones de Virtual Office,
          Cowork y Messenger (están en el menú). La página abre con lo que importa. */}

      {/* DOS COLUMNAS (Alvaro, 13/11/2026: «una cosa arriba, abajo, cuadro, cuadro,
          cuadro… no se siente estético»). Izquierda, ancha: lo que pasa con la
          gente. Derecha, angosta: los números en una lista, las salas en vivo y
          la salud. En el teléfono la derecha va primero (los números arriba). */}
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:items-start">
        <div className="min-w-0 space-y-5">
          {/* Pulso del equipo en vivo (solo supervisor+): conectados + nota viva +
              quién la baja + cajas por equipo. Devuelve null para quien no vigila.
              Le pasamos los conectados EN COWORK (de LiveKit) para el número de arriba. */}
          <PulsoEquipoVivo coworkConectados={sesionesQ.isLoading ? null : vivo.conectados} conNumeros={false} conCabecera={false} />

          {/* Puntualidad de la semana (Alvaro, 18/11/2026): reemplaza la gráfica de
              horas totales, que «no tiene ningún sentido». */}
          <PuntualidadSemana />

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
        <aside className="order-first min-w-0 space-y-5 lg:order-none">
          {/* Los números de hoy, en UNA lista (13/11/2026): los 4 del Pulso + Cowork
              hoy, mensajes y respuesta (antes eran 7 cajas sueltas). */}
          <NumerosDelInicio
            coworkConectados={sesionesQ.isLoading || sesionesQ.isError ? null : vivo.conectados}
            extra={[
              { icono: Clock, tono: "success", etiqueta: t("dashboard.centro.coworkHoy"),
                valor: tiempoCargando ? "…" : horasBonitas(totalHoras), detalle: t("dashboard.centro.personas", { n: equipoHoy.length }) },
              { icono: MessageCircle, etiqueta: t("dashboard.centro.mensajesHoy"),
                valor: mensajeria.fallo ? "–" : mensajeria.cargando ? "…" : mensajeria.datos?.mensajesHoy ?? "–",
                detalle: mensajeria.fallo
                  ? (<span>{t("dashboard.centro.fallo")}<button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => mensajeria.reintentar()}>{t("dashboard.centro.reintentar")}</button></span>)
                  : t("dashboard.centro.chatsActivos", { n: mensajeria.datos?.conversacionesActivas ?? 0 }) },
              { icono: Timer, tono: "warning", etiqueta: t("dashboard.centro.respuesta"),
                valor: mensajeria.fallo ? "–" : mensajeria.cargando ? "…"
                  : mensajeria.datos?.respuestaPromedioS == null ? t("dashboard.centro.sinMedicion")
                  : segundosBonitos(mensajeria.datos.respuestaPromedioS),
                detalle: t("dashboard.centro.respuestaNota") },
            ]}
          />

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
              <div className="flex flex-col gap-3">
                {sesiones.map((s) => (
                  <SesionEnVivo key={s.id} s={s} fotos={fotosSalas} />
                ))}
              </div>
            )}
          </section>

        </aside>
      </div>

      {/* Salud de la plataforma, A LO ANCHO y al final (Alvaro, 13/11/2026: «¿te
          parece buena estética tener eso hasta allá abajo esquinado?»). En la
          columna angosta quedaba sola en la esquina y dejaba la izquierda vacía;
          aquí cierra la página en su cuadrícula. Solo admin/dueño la ven. */}
      <SaludPlataformaBloque />

      {/* Espacio del NAS, CERRADO (Alvaro, 10/11): una línea con lo justo y
          «Entrar al NAS»; todo el detalle vive en /oficina/espacio-nas. Solo
          admin/dueño; para los demás no se dibuja. */}
      <EspacioNasLinea />
    </div>
  );
}
