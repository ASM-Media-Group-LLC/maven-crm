import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { Activity, ArrowRight, Database, Mail, Users, UserMinus, HardDrive, Loader2, Wallet } from "lucide-react";
import { mensual, usd, type ServicioCosto } from "@/lib/costos";
import { SaludDiagnosticoModal } from "./SaludDiagnosticoModal";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useEsDueno } from "@/hooks/useEsDueno";
import { useOnlinePresence } from "@/hooks/useOnlinePresence";
import { UserAvatar } from "@/components/UserAvatar";

// Salud de la plataforma — "todo trabaja bien" para el dueño (Alvaro, 08/11 noche).
// Dos capas:
//   • Dueño/admin → ve el detalle con nombres técnicos (Supabase, Edge, Gemini).
//   • Supervisor → ve el resumen funcional (Drive, Correo, Mensajería) SIN proveedores.
// Nadie fuera de eso ve el bloque (el home ya se oculta a chatters).
//
// Fuentes: RPC salud_sistema() (ya existente; solo admin/dueño), presencia en
// vivo (OnlinePresenceProvider) y monitor_rondas (entradas/salidas del día).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { rpc: (f: string, a: unknown) => Promise<{ data: any; error: { message: string } | null }>; from: (t: string) => any };

interface Salud {
  nas?: { caido: boolean; desde: string | null; pendientes: number; actualizado: string };
  cron_tardanzas?: { activo: boolean; ultima_corrida: string | null; ultimo_status: string | null };
  cron_nas?: { activo: boolean; ultima_corrida: string | null };
  tardanzas_hoy?: { total: number; con_correo: number; ultimo_correo: string | null };
  argos_ia?: { ultima_captura_juzgada: string | null; juzgadas_hoy: number };
}

function hace(iso: string | null | undefined, lang: string): string | null {
  if (!iso) return null;
  try { return formatDistanceToNowStrict(new Date(iso), { addSuffix: true, locale: lang === "es" ? esLocale : undefined }); } catch { return null; }
}

/** Minutos desde `iso`; Infinity si no hay fecha. */
function minutosDesde(iso: string | null | undefined): number {
  if (!iso) return Infinity;
  const ms = Date.now() - Date.parse(iso);
  return Number.isFinite(ms) ? ms / 60000 : Infinity;
}

type Estado = "ok" | "mal" | "duda";

function Pastilla({ estado, texto }: { estado: Estado; texto: string }) {
  // Sin colorcitos (Alvaro, 12/11/2026): pastilla neutra; el estado, un puntito.
  const punto = estado === "ok" ? "bg-success" : estado === "mal" ? "bg-destructive" : "bg-warning";
  return <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-foreground/[0.04] px-2 py-0.5 text-[11px] font-medium text-foreground/85">
    <span className={`h-1.5 w-1.5 rounded-full ${punto}`} aria-hidden />
    {texto}
  </span>;
}

// Un chequeo: ícono + título + estado + detalle. Vidrio glow sutil por estado
// (verde/rojo/amarillo), mismo lenguaje que el resto del dashboard.
function Chequeo({ icono: Icono, titulo, estado, detalle, loading, onClick }: {
  icono: typeof Database; titulo: string; estado: Estado; detalle: string; loading?: boolean;
  /** Si viene, la caja es clickeable y abre el modal de diagnóstico en vivo. */
  onClick?: () => void;
}) {
  const clickeable = !!onClick;
  return (
    <button type="button" onClick={onClick} disabled={!clickeable}
      className={`vidrio p-3 text-left w-full ${clickeable ? "transition hover:brightness-110 cursor-pointer" : "cursor-default"}`}>
      <div className="v-cont flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-foreground/[0.04] text-foreground/75">
          <Icono className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{titulo}</span>
            {loading
              ? <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /></span>
              : <Pastilla estado={estado} texto={estado === "ok" ? "OK" : estado === "mal" ? "Caído" : "Revisar"} />}
          </div>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{detalle}</p>
        </div>
      </div>
    </button>
  );
}

interface PersonaRonda { userId: string; nombre: string | null; avatarUrl: string | null; avatarSeed: string | null; ultimo: string; }

/**
 * El bloque. Se muestra solo a dueño o admin/supervisor (el home ya se oculta
 * a los demás). Los nombres técnicos solo salen si es dueño; los supervisores
 * ven la versión funcional (Drive / Correo / Mensajería).
 */
export default function SaludPlataformaBloque() {
  const { t, language } = useLanguage();
  const { user } = useAuth();
  const { esDueno } = useEsDueno();
  const { onlineUsers } = useOnlinePresence();
  const verDetalleTecnico = esDueno === true; // solo Alvaro

  // 1) RPC salud_sistema (dueño/admin). Si falla porque no es, queda en null
  // y mostramos el bloque "funcional".
  const salud = useQuery<Salud | null>({
    queryKey: ["centro-salud"],
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: !!user && esDueno === true,
    queryFn: async () => {
      const { data, error } = await sinTipar.rpc("salud_sistema", {});
      if (error) return null;
      return data as Salud;
    },
  });

  // 1bis) Ping EN VIVO al NAS (Alvaro, 08/11): la tabla puede quedar
  // desactualizada si no hay aportes; el ping dice la verdad del momento.
  const nasPing = useQuery<{ arriba: boolean; motivo?: string } | null>({
    queryKey: ["centro-salud-nas-ping"],
    staleTime: 20_000,
    refetchInterval: 45_000,
    enabled: !!user && esDueno === true,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("salud-nas-ping", { body: {} });
      if (error) return { arriba: false, motivo: error.message };
      return data as { arriba: boolean; motivo?: string };
    },
    retry: 0,
  });

  // 1ter) Incidentes ABIERTOS del vigilante (Alvaro 08/11 noche: "el problema
  // tiene que aparecer en la caja, no en un cartel arriba"). Mapeamos tipo →
  // mensaje para pintar la caja correspondiente en ROJO con el detalle real.
  const incidentes = useQuery<Record<string, string>>({
    queryKey: ["centro-salud-incidentes"],
    staleTime: 15_000,
    refetchInterval: 30_000,
    enabled: !!user && esDueno === true,
    queryFn: async () => {
      const { data, error } = await sinTipar.from("salud_incidentes")
        .select("tipo, mensaje").is("cerrado_at", null);
      if (error) return {};
      const m: Record<string, string> = {};
      for (const inc of (data ?? []) as Array<{ tipo: string; mensaje: string }>) m[inc.tipo] = inc.mensaje;
      return m;
    },
  });
  const incPor = incidentes.data ?? {};
  const [diagTipo, setDiagTipo] = useState<string | null>(null);

  // 2) Entradas de HOY: cuántas personas distintas dejaron latido hoy.
  const entradasHoy = useQuery<{ total: number }>({
    queryKey: ["centro-salud-entradas", onlineUsers.size], // reevaluar al cambiar presencia
    staleTime: 60_000,
    refetchInterval: 120_000,
    enabled: !!user && esDueno === true,
    queryFn: async () => {
      const inicio = `${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota" }).format(new Date())}T00:00:00-05:00`;
      const { data, error } = await sinTipar.from("monitor_rondas").select("user_id", { count: "exact", head: false }).gte("last_at", inicio);
      if (error) return { total: 0 };
      const ids = new Set(((data ?? []) as Array<{ user_id: string }>).map((r) => r.user_id));
      return { total: ids.size };
    },
  });

  // 3) Desconectados recientes: tuvieron latido hace ≤ 2 h, NO están online ahora.
  const desc = useQuery<PersonaRonda[]>({
    queryKey: ["centro-salud-desconectados", onlineUsers.size],
    staleTime: 30_000,
    refetchInterval: 60_000,
    enabled: !!user && esDueno === true,
    queryFn: async () => {
      const hace2h = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
      const { data } = await sinTipar.from("monitor_rondas")
        .select("user_id, last_at").gte("last_at", hace2h).order("last_at", { ascending: false }).limit(200);
      const filas = (data ?? []) as Array<{ user_id: string; last_at: string }>;
      const vistos = new Map<string, string>();
      for (const f of filas) if (!vistos.has(f.user_id)) vistos.set(f.user_id, f.last_at);
      const candidatos = [...vistos.entries()].filter(([id]) => !onlineUsers.has(id)).slice(0, 12);
      if (candidatos.length === 0) return [];
      const ids = candidatos.map(([id]) => id);
      const { data: perfs } = await sinTipar.from("profiles").select("id, full_name, avatar_url, avatar_seed").in("id", ids);
      const perfilPor = new Map(((perfs ?? []) as Array<{ id: string; full_name: string | null; avatar_url: string | null; avatar_seed: string | null }>).map((p) => [p.id, p]));
      return candidatos.map(([userId, ultimo]): PersonaRonda => {
        const p = perfilPor.get(userId);
        return { userId, nombre: p?.full_name ?? null, avatarUrl: p?.avatar_url ?? null, avatarSeed: p?.avatar_seed ?? null, ultimo };
      });
    },
  });

  const s = salud.data;
  const cargando = salud.isLoading;

  // Estados para cada chequeo.
  // Drive/NAS: el INCIDENTE abierto del vigilante manda si hay. Si no, ping en
  // vivo. Si tampoco llega, tabla. Así la caja pinta ROJA con el motivo real
  // del vigilante (Alvaro 08/11 noche).
  const pingSabe = nasPing.isSuccess && nasPing.data;
  const incNas = incPor["nas_caido"];
  const nasArribaReal = !incNas && (pingSabe ? nasPing.data!.arriba : !s?.nas?.caido);
  const nasEstado: Estado = incNas ? "mal" : (cargando && nasPing.isLoading) ? "duda" : nasArribaReal ? "ok" : "mal";
  const pendientes = s?.nas?.pendientes ?? 0;
  const nasDetalle = incNas
    ? incNas
    : nasArribaReal
      ? t("dashboard.centro.salud.nasOk", { n: pendientes })
      : t("dashboard.centro.salud.nasMal", { n: pendientes });

  // Correo: si HOY hubo tardanzas detectadas y TODAS se mandaron → ok. Si no
  // hubo ninguna (día limpio), quedamos neutros "ok". Si hubo y faltan → mal.
  const incCorreo = incPor["correo_atascado"];
  const correoEstado: Estado = incCorreo ? "mal" : cargando ? "duda"
    : s?.tardanzas_hoy ? (s.tardanzas_hoy.total === 0 || s.tardanzas_hoy.con_correo === s.tardanzas_hoy.total ? "ok" : "mal") : "ok";
  const correoDetalle = incCorreo ? incCorreo
    : s?.tardanzas_hoy?.ultimo_correo
      ? t("dashboard.centro.salud.correoUltimo", { t: hace(s.tardanzas_hoy.ultimo_correo, language) ?? "—" })
      : t("dashboard.centro.salud.correoSinHoy");

  // Mensajería: hay realtime online (onlineUsers) + algún latido hace < 10 min.
  // Proxy razonable sin pedir una RPC nueva. Si todo el equipo se cae de golpe
  // (0 online y 0 rondas recientes), lo muestra.
  const hayActividadMensajeria = onlineUsers.size > 0;
  const mensajeriaEstado: Estado = hayActividadMensajeria ? "ok" : "duda";
  const mensajeriaDetalle = hayActividadMensajeria
    ? t("dashboard.centro.salud.msgOk", { n: onlineUsers.size })
    : t("dashboard.centro.salud.msgDuda");

  // Técnico (solo dueño): Supabase + Edge + Argos IA.
  const incArgos = incPor["argos_sin_juzgar"];
  const argosEstado: Estado = incArgos ? "mal" : cargando ? "duda"
    : s?.argos_ia ? (minutosDesde(s.argos_ia.ultima_captura_juzgada) < 15 ? "ok" : s.argos_ia.ultima_captura_juzgada ? "duda" : "mal") : "duda";
  const argosDetalle = incArgos ? incArgos
    : s?.argos_ia
      ? t("dashboard.centro.salud.argosDet", { n: s.argos_ia.juzgadas_hoy, t: hace(s.argos_ia.ultima_captura_juzgada, language) ?? "—" })
      : t("dashboard.centro.salud.cargando");

  const incCron = incPor["cron_parado"];
  const cronEstado: Estado = incCron ? "mal" : cargando ? "duda" : (s?.cron_nas?.activo && s?.cron_tardanzas?.activo) ? "ok" : "mal";
  const cronDetalle = incCron ? incCron
    : s?.cron_tardanzas?.ultima_corrida
      ? t("dashboard.centro.salud.cronDet", { t: hace(s.cron_tardanzas.ultima_corrida, language) ?? "—" })
      : t("dashboard.centro.salud.cargando");

  const desconectados = desc.data ?? [];
  const entradas = entradasHoy.data?.total ?? 0;

  const avatares = useMemo(() => desconectados.slice(0, 8), [desconectados]);

  // Si no es dueño y tampoco admin, no mostrar nada (home ya filtra por nivel,
  // pero igual blindamos).
  // Solo el dueño (Alvaro, 10/11: «Salud y NAS solo tú»). Los admins conservan
  // el resto del Centro, pero no el estado técnico de la plataforma.
  // Gastos de la plataforma (Alvaro, 11/11): el total del mes, a la vista en el
  // inicio; el detalle y las conexiones viven en /oficina/costos.
  const navegar = useNavigate();
  const gastos = useQuery({
    queryKey: ["costos-inicio"],
    enabled: esDueno === true,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await (supabase as unknown as { from: (t: string) => { select: (c: string) => Promise<{ data: unknown; error: { message: string } | null }> } })
        .from("costos_servicios").select("monto_usd, ciclo, es_maven, activo");
      if (error) throw new Error(error.message);
      const filas = ((data ?? []) as Pick<ServicioCosto, "monto_usd" | "ciclo" | "es_maven" | "activo">[]).filter((f) => f.activo && f.es_maven);
      const total = filas.reduce((a, f) => a + (mensual(f) ?? 0), 0);
      return { total: Math.round(total * 100) / 100, faltan: filas.filter((f) => mensual(f) === null).length };
    },
  });

  if (esDueno !== true) return null;

  return (
    <section className="vidrio sube p-4" style={{ animationDelay: "0.1s" }}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-border/70 bg-foreground/[0.04] text-foreground/75"><Activity className="h-4 w-4" /></span>
          {t("dashboard.centro.salud.titulo")}
        </h2>
        <span className="text-[11px] text-muted-foreground">{t("dashboard.centro.salud.soloDueno")}</span>
      </div>

      {/* 4 chequeos funcionales — visibles para dueño/admin. Nombres neutros
          (Drive/Correo/Mensajería/Argos); los proveedores reales solo si es dueño. */}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <Chequeo icono={HardDrive} titulo={t("dashboard.centro.salud.drive")} estado={nasEstado} detalle={nasDetalle} loading={cargando} onClick={() => setDiagTipo("drive")} />
        <Chequeo icono={Mail} titulo={t("dashboard.centro.salud.correo")} estado={correoEstado} detalle={correoDetalle} loading={cargando} onClick={() => setDiagTipo("correo")} />
        <Chequeo icono={Activity} titulo={t("dashboard.centro.salud.mensajeria")} estado={mensajeriaEstado} detalle={mensajeriaDetalle} onClick={() => setDiagTipo("mensajeria")} />
        <Chequeo icono={Database} titulo={t("dashboard.centro.salud.argos")} estado={argosEstado} detalle={argosDetalle} loading={cargando} onClick={() => setDiagTipo("argos")} />
      </div>

      {/* Bloque técnico (solo dueño): crons + nombres de proveedores. */}
      {verDetalleTecnico && (
        <div className="mt-2.5 grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <Chequeo icono={Database} titulo={t("dashboard.centro.salud.crons")} estado={cronEstado} detalle={cronDetalle} loading={cargando} />
          <Chequeo icono={Activity} titulo={t("dashboard.centro.salud.infra")} estado="ok" detalle={t("dashboard.centro.salud.infraVer")}
            onClick={() => navegar("/oficina/costos?vista=conexiones")} />
          <button type="button" onClick={() => navegar("/oficina/costos")}
            className="vidrio w-full cursor-pointer p-3 text-left transition hover:brightness-110">
            <div className="v-cont flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-foreground/[0.04] text-foreground/75"><Wallet className="h-4.5 w-4.5" /></span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{t("dashboard.centro.salud.gastos")}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                {gastos.isLoading ? <Loader2 className="mt-1 h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  : gastos.isError || !gastos.data ? <p className="mt-0.5 text-[11px] text-destructive">{t("dashboard.centro.salud.gastosFallo")}</p>
                  : (
                    <>
                      <div className="font-display text-lg font-bold tabular-nums leading-tight">{t("dashboard.centro.salud.gastosTotal", { m: usd(gastos.data.total) })}</div>
                      <p className="text-[11px] text-muted-foreground">
                        {gastos.data.faltan ? t("dashboard.centro.salud.gastosFaltan", { n: gastos.data.faltan }) : t("dashboard.centro.salud.gastosVer")}
                      </p>
                    </>
                  )}
              </div>
            </div>
          </button>
        </div>
      )}

      {/* Entradas de hoy + tira de desconectados recientes. Alvaro (08/11 noche):
          cajas vacías no van — si no hay nada que mostrar, no aparece. */}
      {(entradas > 0 || avatares.length > 0) && (
      <div className="mt-3 grid gap-2.5 sm:grid-cols-[auto_1fr] sm:items-stretch">
        {entradas > 0 && (
          <div className="vidrio p-3">
            <div className="v-cont flex items-center gap-3">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-border/70 bg-foreground/[0.04] text-foreground/75"><Users className="h-5 w-5" /></span>
              <div>
                <div className="font-display text-2xl font-bold tabular-nums leading-none">{entradas}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">{t("dashboard.centro.salud.entraronHoy")}</div>
              </div>
            </div>
          </div>
        )}
        {avatares.length > 0 && (
        <div className="vidrio p-3">
          <div className="v-cont flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-border/70 bg-foreground/[0.04] text-foreground/75"><UserMinus className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-semibold">{t("dashboard.centro.salud.desconectados")}</span>
                <span className="text-[11px] text-muted-foreground">{t("dashboard.centro.salud.desconectadosNota")}</span>
              </div>
              <div className="mt-1.5 flex items-center -space-x-1.5">
                {avatares.map((p) => (
                  <span key={p.userId} title={`${p.nombre ?? ""} · ${hace(p.ultimo, language) ?? ""}`}>
                    <UserAvatar name={p.nombre || "—"} src={p.avatarUrl} seed={p.avatarSeed} size="xs" />
                  </span>
                ))}
                {desconectados.length > avatares.length && (
                  <span className="ml-2 text-[11px] font-medium text-muted-foreground tabular-nums">+{desconectados.length - avatares.length}</span>
                )}
              </div>
            </div>
          </div>
        </div>
        )}
      </div>
      )}
      <SaludDiagnosticoModal tipo={diagTipo} abierto={!!diagTipo} onCerrar={() => setDiagTipo(null)} />
    </section>
  );
}
