import { useMemo, type ReactNode } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  AlarmClock, AlertTriangle, ArrowLeft, CheckCircle2, Clock, Gauge, Loader2, LogIn, MessageCircle, RefreshCw,
  Timer, TrendingDown, Users, UserX, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Page } from "@/components/ui/page";
import { useLanguage } from "@/hooks/useLanguage";
import { hoyEnBogota, useFotosDe, useHoyDelEquipo } from "@/hooks/useHoyDelEquipo";
import { usePulsoEquipo } from "@/hooks/usePulsoEquipo";
import { tonoDe, separarPantalla, useDondeEsta, type FilaDondeEsta } from "@/hooks/useDondeEsta";
import { useEquipoTiempoCowork } from "@/hooks/useEquipoTiempoCowork";
import { useMensajesPorPersona } from "@/hooks/useMensajesPorPersona";
import { useVistaEnVivo } from "@/hooks/useVistaEnVivo";
import { TarjetaEnVivo, type TonoCifra, type TonoEstado } from "@/components/vigilancia/TarjetaEnVivo";
import { CIFRAS, esCifra, horasYMinutos, rutaDeCifra, type Cifra } from "@/lib/cifrasDeHoy";
import { horaBogota } from "@/lib/llegadas";
import { PUNTOS_VIVOS } from "@/lib/motivosVivos";
import type { EstadoVivo } from "@/hooks/useRondinVivo";
import type { TranslationKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

// UNA PANTALLA POR CADA NÚMERO DE HOY (Alvaro, 20/11/2026: «cada cosa debería
// mandarme a una pantalla… y tener a todo el mundo más vigilado»). Arriba el
// número y qué significa; abajo cada persona en su tarjeta en vivo (como
// Presencia de Argos) con el porqué. Cada quien ve solo a quien puede vigilar
// (la ruta va con RutaDeVigilancia y los datos ya vienen filtrados).

const ICONO: Record<Cifra, LucideIcon> = {
  "tarde": AlarmClock, "llegaron": LogIn, "nota-baja": TrendingDown, "no-trabajan": UserX,
  "en-cowork": Users, "nota-equipo": Gauge, "trabajando": CheckCircle2, "con-problemas": AlertTriangle,
  "cowork-hoy": Clock, "mensajes": MessageCircle, "respuesta": Timer,
};

const TITULO: Record<Cifra, TranslationKey> = {
  "tarde": "dashboard.hoy.t.tarde", "llegaron": "dashboard.hoy.t.llegaron", "nota-baja": "dashboard.hoy.t.notaBaja",
  "no-trabajan": "dashboard.hoy.t.noTrabajan", "en-cowork": "dashboard.hoy.t.enCowork", "nota-equipo": "dashboard.hoy.t.notaEquipo",
  "trabajando": "dashboard.hoy.t.trabajando", "con-problemas": "dashboard.hoy.t.conProblemas", "cowork-hoy": "dashboard.hoy.t.coworkHoy",
  "mensajes": "dashboard.hoy.t.mensajes", "respuesta": "dashboard.hoy.t.respuesta",
};

const DESCRIPCION: Record<Cifra, TranslationKey> = {
  "tarde": "dashboard.hoy.d.tarde", "llegaron": "dashboard.hoy.d.llegaron", "nota-baja": "dashboard.hoy.d.notaBaja",
  "no-trabajan": "dashboard.hoy.d.noTrabajan", "en-cowork": "dashboard.hoy.d.enCowork", "nota-equipo": "dashboard.hoy.d.notaEquipo",
  "trabajando": "dashboard.hoy.d.trabajando", "con-problemas": "dashboard.hoy.d.conProblemas", "cowork-hoy": "dashboard.hoy.d.coworkHoy",
  "mensajes": "dashboard.hoy.d.mensajes", "respuesta": "dashboard.hoy.d.respuesta",
};

const ESTADO_DONDE: Record<string, TranslationKey> = {
  activo: "hr.donde.estado.activo", pausa: "hr.donde.estado.pausa", meet: "hr.donde.estado.meet",
  en_llamada: "hr.donde.estado.enLlamada", sin_pantalla: "hr.donde.estado.sinPantalla", sin_camara: "hr.donde.estado.sinCamara",
  fuera_de_camara: "hr.donde.estado.fueraDeCamara", sin_conexion: "hr.donde.estado.sinConexion",
  sin_conexion_larga: "hr.donde.estado.sinConexion", fuera_de_cowork: "hr.donde.estado.fueraDeCowork",
  no_ha_entrado: "hr.donde.estado.noHaEntrado", fuera_de_turno: "hr.donde.estado.fueraDeTurno",
};

const TONO_VIVO: Record<EstadoVivo, TonoEstado> = {
  trabajando: "verde", presente: "verde", pausa: "neutro", celular: "rojo", distraido: "rojo", no_mira: "rojo",
  camara_apagada: "rojo", se_fue: "rojo", fuera_cowork: "rojo", fuera_de_lugar: "rojo", sin_pantalla: "rojo",
  pausa_de_mas: "naranja", ausente: "gris",
};

interface Item {
  userId: string;
  nombre: string;
  motivo: ReactNode;
  cifra?: ReactNode;
  tonoCifra?: TonoCifra;
  /** Estado de Argos/Pulso cuando la fila de Presencia no lo trae. */
  estadoVivo?: EstadoVivo;
}

const esBaja = (nota: number | null | undefined) => nota != null && nota < 60;
const conHoras = (horas: number) => horas > 0;
const minutosDesde = (iso: string | null) => (iso ? Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000)) : null);

export default function CifraDeHoy() {
  const { cifra } = useParams<{ cifra: string }>();
  if (!esCifra(cifra)) return <Navigate to="/dashboard" replace />;
  return <Pantalla cifra={cifra} />;
}

function Pantalla({ cifra }: { cifra: Cifra }) {
  const { t } = useLanguage();
  const hoy = useHoyDelEquipo(true);
  const pulsoQ = usePulsoEquipo();
  const donde = useDondeEsta(true);
  const dia = hoyEnBogota();
  const tiempo = useEquipoTiempoCowork(dia, dia);
  const conMensajes = cifra === "mensajes" || cifra === "respuesta";
  const mensajes = useMensajesPorPersona(conMensajes);

  const min = (n: number) => (n < 60 ? t("dashboard.atajos.min", { n }) : t("dashboard.atajos.horas", { h: Math.floor(n / 60), m: String(n % 60).padStart(2, "0") }));
  const seg = (s: number) => (s < 60 ? t("dashboard.hoy.seg", { s: Math.round(s) }) : t("dashboard.hoy.minSeg", { m: Math.floor(s / 60), s: Math.round(s % 60) }));

  const filaDe = useMemo(() => new Map((donde.data ?? []).map((f) => [f.user_id, f])), [donde.data]);
  const nombreDe = (id: string, otro?: string | null) => filaDe.get(id)?.nombre ?? otro ?? "—";

  const { principales, secundarios, resumen, cargando, fallo, reintentar } = useMemo(() => {
    const vacio = { principales: [] as Item[], secundarios: [] as Item[], resumen: "" as ReactNode };
    const datos = hoy.datos;
    const pulso = pulsoQ.pulso;
    const faltan = (): Item[] => (datos?.faltan ?? []).map((p) => ({
      userId: p.userId, nombre: p.nombre, motivo: t("dashboard.hoy.m.noLlega", { e: p.entrada ?? "—" }), cifra: "—", tonoCifra: "mal" as TonoCifra,
    }));
    switch (cifra) {
      case "tarde": {
        if (!datos) return { ...vacio, cargando: hoy.cargando, fallo: hoy.fallo, reintentar: hoy.reintentar };
        return {
          principales: datos.tarde.map((p) => ({
            userId: p.userId, nombre: p.nombre, tonoCifra: "ojo" as TonoCifra, cifra: `+${min(p.tardeMin ?? 0)}`,
            motivo: t("dashboard.hoy.m.tarde", { h: horaBogota(p.llegoAt!), e: p.entrada ?? "—" }),
          })),
          secundarios: faltan(),
          resumen: datos.tarde.length,
          cargando: false, fallo: false, reintentar: hoy.reintentar,
        };
      }
      case "llegaron": {
        if (!datos) return { ...vacio, cargando: hoy.cargando, fallo: hoy.fallo, reintentar: hoy.reintentar };
        return {
          principales: datos.llegaron.map((p) => ({
            userId: p.userId, nombre: p.nombre, cifra: horaBogota(p.llegoAt!),
            tonoCifra: (p.tardeMin != null ? "ojo" : "bien") as TonoCifra,
            motivo: p.tardeMin != null ? t("dashboard.hoy.m.llegoTarde", { m: min(p.tardeMin) }) : p.entrada ? t("dashboard.hoy.m.aTiempo", { e: p.entrada }) : t("dashboard.hoy.m.sinHorario"),
          })),
          secundarios: faltan(),
          resumen: `${datos.llegaron.length}/${datos.llegaron.length + datos.faltan.length}`,
          cargando: false, fallo: false, reintentar: hoy.reintentar,
        };
      }
      case "nota-baja": {
        if (!datos || hoy.cargandoNotas) return { ...vacio, cargando: hoy.cargando || hoy.cargandoNotas, fallo: hoy.fallo || hoy.falloNotas, reintentar: hoy.reintentar };
        const bajos = datos.porNota.filter((p) => esBaja(p.nota)).sort((a, b) => (a.nota ?? 0) - (b.nota ?? 0));
        return {
          principales: bajos.map((p) => ({ userId: p.userId, nombre: p.nombre, cifra: p.nota ?? "—", tonoCifra: "mal" as TonoCifra, motivo: t("dashboard.hoy.m.notaDelDia") })),
          secundarios: [], resumen: bajos.length, cargando: false, fallo: hoy.falloNotas, reintentar: hoy.reintentar,
        };
      }
      case "no-trabajan": {
        if (!datos) return { ...vacio, cargando: hoy.cargando, fallo: hoy.fallo, reintentar: hoy.reintentar };
        return {
          principales: datos.noTrabajan.map((p) => {
            const m = minutosDesde(p.estadoDesde);
            return {
              userId: p.userId, nombre: p.nombre, tonoCifra: "mal" as TonoCifra,
              cifra: p.estado === "no_ha_entrado" || m == null ? undefined : min(m),
              motivo: p.estado === "no_ha_entrado"
                ? t("dashboard.hoy.m.noLlega", { e: p.entrada ?? "—" })
                : p.estadoDesde ? t("dashboard.hoy.m.estadoDesde", { e: t(ESTADO_DONDE[p.estado] ?? "hr.donde.estado.otro"), h: horaBogota(p.estadoDesde) }) : t(ESTADO_DONDE[p.estado] ?? "hr.donde.estado.otro"),
            };
          }),
          secundarios: [], resumen: datos.noTrabajan.length, cargando: false, fallo: false, reintentar: hoy.reintentar,
        };
      }
      case "en-cowork": {
        if (!donde.data) return { ...vacio, cargando: donde.isLoading, fallo: donde.isError, reintentar: () => void donde.refetch() };
        const adentro = donde.data.filter((f) => { const tono = tonoDe(f.estado); return tono === "verde" || tono === "neutro"; });
        return {
          principales: adentro.map((f) => ({
            userId: f.user_id, nombre: f.nombre ?? "—",
            motivo: f.estado_desde ? t("dashboard.hoy.m.estadoDesde", { e: t(ESTADO_DONDE[f.estado] ?? "hr.donde.estado.otro"), h: horaBogota(f.estado_desde) }) : t(ESTADO_DONDE[f.estado] ?? "hr.donde.estado.otro"),
          })),
          secundarios: [], resumen: adentro.length, cargando: false, fallo: false, reintentar: () => void donde.refetch(),
        };
      }
      case "nota-equipo":
      case "trabajando":
      case "con-problemas": {
        if (!pulso) return { ...vacio, cargando: pulsoQ.cargando, fallo: !!pulsoQ.error, reintentar: pulsoQ.reintentar };
        const todas = pulso.cajas.flatMap((c) => c.miembros);
        const lista = cifra === "con-problemas" ? pulso.quienLaBaja
          : cifra === "trabajando" ? todas.filter((p) => p.estado === "trabajando")
          : todas.filter((p) => p.conectado).sort((a, b) => (PUNTOS_VIVOS[a.estado] ?? 101) - (PUNTOS_VIVOS[b.estado] ?? 101));
        return {
          principales: lista.map((p) => {
            const puntos = PUNTOS_VIVOS[p.estado];
            const detalle = p.motivos[0]?.detalle;
            const estado = t(`dashboard.pulso.estado.${p.estado}` as TranslationKey);
            const m = minutosDesde(p.desde);
            return {
              userId: p.userId, nombre: p.nombre, estadoVivo: p.estado,
              motivo: detalle ? `${estado} · ${detalle}` : p.desde ? t("dashboard.hoy.m.estadoDesde", { e: estado, h: horaBogota(p.desde) }) : estado,
              cifra: cifra === "nota-equipo" ? (puntos ?? "—") : m == null ? undefined : min(m),
              tonoCifra: (cifra === "trabajando" ? "bien" : cifra === "con-problemas" ? "mal" : puntos == null ? "neutro" : esBaja(puntos) ? "mal" : "bien") as TonoCifra,
            };
          }),
          secundarios: [],
          resumen: cifra === "nota-equipo" ? (pulso.notaViva ?? "—") : lista.length,
          cargando: false, fallo: false, reintentar: pulsoQ.reintentar,
        };
      }
      case "cowork-hoy": {
        if (tiempo.cargando || !donde.data) return { ...vacio, cargando: tiempo.cargando || donde.isLoading, fallo: tiempo.fallo || donde.isError, reintentar: tiempo.reintentar };
        const filas = [...tiempo.porPersona.entries()].filter(([id, x]) => conHoras(x.horas) && filaDe.has(id)).sort((a, b) => b[1].horas - a[1].horas);
        const total = filas.reduce((a, [, x]) => a + x.horas, 0);
        const tot = horasYMinutos(total);
        return {
          principales: filas.map(([id, x]) => { const hm = horasYMinutos(x.horas); return { userId: id, nombre: nombreDe(id), cifra: t("dashboard.atajos.horas", { h: hm.h, m: String(hm.m).padStart(2, "0") }), tonoCifra: "neutro" as TonoCifra, motivo: t("dashboard.hoy.m.enElReloj") }; }),
          secundarios: [], resumen: t("dashboard.atajos.horas", { h: tot.h, m: String(tot.m).padStart(2, "0") }),
          cargando: false, fallo: false, reintentar: tiempo.reintentar,
        };
      }
      case "mensajes":
      case "respuesta": {
        if (!mensajes.data) return { ...vacio, cargando: mensajes.isLoading, fallo: mensajes.isError, reintentar: () => void mensajes.refetch() };
        const filas = [...mensajes.data.entries()].filter(([id]) => filaDe.has(id));
        if (cifra === "mensajes") {
          filas.sort((a, b) => b[1].mensajes - a[1].mensajes);
          return {
            principales: filas.map(([id, x]) => ({ userId: id, nombre: nombreDe(id), cifra: x.mensajes, tonoCifra: "neutro" as TonoCifra, motivo: t("dashboard.hoy.m.conversaciones", { n: x.conversaciones }) })),
            secundarios: [], resumen: filas.reduce((a, [, x]) => a + x.mensajes, 0), cargando: false, fallo: false, reintentar: () => void mensajes.refetch(),
          };
        }
        const conTiempo = filas.filter(([, x]) => x.respuestaS != null).sort((a, b) => (b[1].respuestaS ?? 0) - (a[1].respuestaS ?? 0));
        const prom = conTiempo.length ? conTiempo.reduce((a, [, x]) => a + (x.respuestaS ?? 0), 0) / conTiempo.length : null;
        return {
          principales: conTiempo.map(([id, x]) => ({ userId: id, nombre: nombreDe(id), cifra: seg(x.respuestaS ?? 0), tonoCifra: "neutro" as TonoCifra, motivo: t("dashboard.hoy.m.mensajesEn", { n: x.mensajes, c: x.conversaciones }) })),
          secundarios: [], resumen: prom == null ? "—" : seg(prom), cargando: false, fallo: false, reintentar: () => void mensajes.refetch(),
        };
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cifra, hoy.datos, hoy.cargando, hoy.fallo, hoy.cargandoNotas, hoy.falloNotas, pulsoQ.pulso, pulsoQ.cargando, pulsoQ.error,
      donde.data, donde.isLoading, donde.isError, tiempo.porPersona, tiempo.cargando, tiempo.fallo, mensajes.data, mensajes.isLoading, mensajes.isError, filaDe, t]);

  const ids = useMemo(() => [...principales, ...secundarios].map((i) => i.userId), [principales, secundarios]);
  const vista = useVistaEnVivo(ids);
  const fotos = useFotosDe(ids).data ?? {};
  const Icono = ICONO[cifra];
  const volverA = rutaDeCifra(cifra);

  const tarjeta = (i: Item) => {
    const f: FilaDondeEsta | undefined = filaDe.get(i.userId);
    const estado = i.estadoVivo
      ? { texto: t(`dashboard.pulso.estado.${i.estadoVivo}` as TranslationKey), tono: TONO_VIVO[i.estadoVivo] }
      : f ? { texto: t(ESTADO_DONDE[f.estado] ?? "hr.donde.estado.otro"), tono: tonoDe(f.estado) as TonoEstado } : null;
    const { app, que } = separarPantalla(f?.pantalla_que);
    return (
      <TarjetaEnVivo key={i.userId} userId={i.userId} nombre={i.nombre} equipo={f?.equipo} foto={fotos[i.userId]}
        vista={vista(i.userId)} estado={estado} motivo={i.motivo} cifra={i.cifra} tonoCifra={i.tonoCifra}
        enPantalla={[app, que].filter(Boolean).join(" · ") || null} enlace={`/hr/en-vivo/${i.userId}`} volverA={volverA} />
    );
  };

  return (
    <Page>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="-ml-2 gap-1.5 rounded-full text-muted-foreground">
            <Link to="/dashboard"><ArrowLeft className="h-4 w-4" />{t("dashboard.hoy.volver")}</Link>
          </Button>
        </div>
        <header className="vidrio flex flex-wrap items-center gap-4 p-5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/[0.08] text-primary ring-1 ring-primary/20"><Icono className="h-6 w-6" /></span>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-semibold leading-tight">{t(TITULO[cifra])}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">{t(DESCRIPCION[cifra])}</p>
          </div>
          <span className="font-display text-4xl font-semibold tabular-nums">{cargando ? "…" : resumen}</span>
        </header>

        <nav aria-label={t("dashboard.hoy.otros")} className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] sm:flex-wrap">
          {CIFRAS.map((c) => (
            <Link key={c} to={rutaDeCifra(c)} aria-current={c === cifra ? "page" : undefined}
              className={cn("inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                c === cifra ? "border-foreground/30 bg-foreground/10 text-foreground" : "border-border/40 bg-card/30 text-muted-foreground hover:bg-card/50")}>
              {t(TITULO[c])}
            </Link>
          ))}
        </nav>

        {fallo ? (
          <div className="vidrio flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm">{t("dashboard.hoy.fallo")}</p>
            <Button size="sm" variant="outline" className="gap-1.5 rounded-full" onClick={reintentar}><RefreshCw className="h-3.5 w-3.5" />{t("dashboard.centro.reintentar")}</Button>
          </div>
        ) : cargando ? (
          <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : principales.length === 0 && secundarios.length === 0 ? (
          <div className="vidrio p-8 text-center text-sm text-muted-foreground">{t("dashboard.hoy.nadie")}</div>
        ) : (
          <>
            {principales.length > 0 && (
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{principales.map(tarjeta)}</ul>
            )}
            {secundarios.length > 0 && (
              <section className="flex flex-col gap-3">
                <h2 className="text-sm font-semibold text-muted-foreground">{t("dashboard.hoy.todaviaNo", { n: secundarios.length })}</h2>
                <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{secundarios.map(tarjeta)}</ul>
              </section>
            )}
          </>
        )}
      </div>
    </Page>
  );
}
