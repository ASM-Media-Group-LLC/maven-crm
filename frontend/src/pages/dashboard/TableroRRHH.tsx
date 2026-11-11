import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlarmClock, Eye, UserCheck } from "lucide-react";
import { Page } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/UserAvatar";
import PulsoEquipoVivo from "@/components/centro/PulsoEquipoVivo";
import QuienEstaBajando from "@/components/vigilancia/QuienEstaBajando";
import SelectorDeTablero from "@/pages/dashboard/SelectorDeTablero";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { useEquipoTiempoCowork } from "@/hooks/useEquipoTiempoCowork";
import { horasCortas, hoyBogota } from "@/lib/diaBogota";
import type { EstadoLectura } from "@/pages/dashboard/MiTablero";

// TABLERO DE RR. HH. (Alvaro, 10/11/2026 — «quién mira qué»): asistencia de hoy,
// tardanzas, quién está conectado y el Pulso de Argos de la gente que manejan.
// Sin ventas ni creadoras. A los admins y al dueño no los ve (igual que la RLS de
// Argos y de tardanzas para RR. HH.).

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

export interface Persona { id: string; nombre: string; avatarUrl: string | null; avatarSeed: string | null }
export interface TardanzaHoy extends Persona { turno: string | null; tardeMin: number; entroAt: string | null }
export interface AsistenciaHoy extends Persona { horas: number; sinCamara: number; sinPantalla: number }

/** Lo que el tablero necesita leer de un tirón. */
export interface DatosRRHH { tardanzas: TardanzaHoy[]; asistencia: AsistenciaHoy[] }

const NIVELES_FUERA = new Set(["admin", "dueno"]);

function Fallo({ onReintentar }: { onReintentar: () => void }) {
  const { t } = useLanguage();
  return (
    <p role="alert" className="text-sm text-muted-foreground">
      {t("dashboard.centro.fallo")}
      <button type="button" onClick={onReintentar} className="underline underline-offset-2 hover:text-foreground">{t("dashboard.centro.reintentar")}</button>
    </p>
  );
}

export function TableroRRHHVista({ fecha, datos, pulso, arriba }: {
  fecha: string;
  datos: EstadoLectura<DatosRRHH>;
  /** El Pulso en vivo (en la app real, <PulsoEquipoVivo conEquipo />). */
  pulso: ReactNode;
  /** Lo primero de la página en el teléfono: «Quién está bajando ahora». */
  arriba?: ReactNode;
}) {
  const { t, language } = useLanguage();
  const hora = (iso: string | null) => (iso
    ? new Date(iso).toLocaleTimeString(language === "es" ? "es-CO" : "en-US", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" })
    : "—");
  const tardanzas = datos.data?.tardanzas ?? [];
  const asistencia = datos.data?.asistencia ?? [];

  return (
    <Page>
      <div className="flex flex-col gap-5">
        {arriba}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <SelectorDeTablero actual="rrhh" />
            <p className="text-sm text-muted-foreground first-letter:uppercase">{fecha}</p>
          </div>
          <Button asChild variant="outline" size="sm" className="rounded-control">
            <Link to="/hr/monitor-ia"><Eye className="mr-1.5 h-4 w-4" />{t("dashboard.rrhh.abrirArgos")}</Link>
          </Button>
        </div>

        {/* Quién está conectado y cómo viene, por equipo (Argos en vivo). */}
        {pulso}

        <div className="grid items-start gap-4 lg:grid-cols-2">
          {/* Tardanzas de hoy: quién llegó tarde a su turno y cuánto. */}
          <section className="vidrio min-w-0 p-4">
            <div className="v-cont flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <AlarmClock className="h-4 w-4 text-warning" />
                <h2 className="text-sm font-semibold">{t("dashboard.rrhh.tardanzas")}</h2>
                {datos.data && <span className="ml-auto font-display text-base font-semibold tabular-nums">{tardanzas.length}</span>}
              </div>
              {datos.fallo ? <Fallo onReintentar={datos.reintentar} />
                : datos.cargando ? <p className="text-sm text-muted-foreground">…</p>
                : tardanzas.length === 0 ? <p className="text-sm text-muted-foreground">{t("dashboard.rrhh.sinTardanzas")}</p>
                : (
                  <ul className="flex flex-col divide-y divide-border/40">
                    {tardanzas.map((f) => (
                      <li key={f.id} className="flex items-center gap-2.5 py-2">
                        <UserAvatar name={f.nombre || "·"} src={f.avatarUrl} seed={f.avatarSeed} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{f.nombre || "—"}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {t("dashboard.rrhh.entro", { hora: hora(f.entroAt) })}{f.turno ? ` · ${f.turno}` : ""}
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums text-warning">{t("dashboard.rrhh.minTarde", { n: f.tardeMin })}</span>
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          </section>

          {/* Asistencia de hoy: quién trabajó y cuánto, según el reloj de Cowork. */}
          <section className="vidrio min-w-0 p-4">
            <div className="v-cont flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <UserCheck className="h-4 w-4 text-success" />
                <h2 className="text-sm font-semibold">{t("dashboard.rrhh.asistencia")}</h2>
                {datos.data && <span className="ml-auto font-display text-base font-semibold tabular-nums">{asistencia.length}</span>}
              </div>
              <p className="-mt-1.5 text-[11px] text-muted-foreground">{t("dashboard.rrhh.asistenciaNota")}</p>
              {datos.fallo ? <Fallo onReintentar={datos.reintentar} />
                : datos.cargando ? <p className="text-sm text-muted-foreground">…</p>
                : asistencia.length === 0 ? <p className="text-sm text-muted-foreground">{t("dashboard.rrhh.sinAsistencia")}</p>
                : (
                  <ul className="flex flex-col divide-y divide-border/40">
                    {asistencia.map((f) => (
                      <li key={f.id} className="flex items-center gap-2.5 py-2">
                        <UserAvatar name={f.nombre || "·"} src={f.avatarUrl} seed={f.avatarSeed} size="sm" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{f.nombre || "—"}</span>
                          {(f.sinCamara > 0 || f.sinPantalla > 0) && (
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {[
                                f.sinCamara > 0 ? t("dashboard.rrhh.sinCamara", { t: horasCortas(f.sinCamara) }) : null,
                                f.sinPantalla > 0 ? t("dashboard.rrhh.sinPantalla", { t: horasCortas(f.sinPantalla) }) : null,
                              ].filter(Boolean).join(" · ")}
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">{horasCortas(f.horas)}</span>
                      </li>
                    ))}
                  </ul>
                )}
            </div>
          </section>
        </div>
      </div>
    </Page>
  );
}

export default function TableroRRHH() {
  const { language } = useLanguage();
  const hoy = hoyBogota();
  const tiempo = useEquipoTiempoCowork(hoy, hoy);

  const datosQ = useQuery({
    enabled: !tiempo.cargando && !tiempo.fallo,
    queryKey: ["tablero-rrhh", hoy, [...tiempo.porPersona.keys()].sort().join(",")],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<DatosRRHH> => {
      const { data: tard, error } = await sinTipar.from("tardanzas_registro")
        .select("id, user_id, turno_nombre, entro_at, tarde_min")
        .eq("dia", hoy)
        .order("tarde_min", { ascending: false });
      if (error) throw new Error(error.message);
      const filasT = (tard ?? []) as Array<{ id: string; user_id: string; turno_nombre: string | null; entro_at: string | null; tarde_min: number }>;

      const conHoras = [...tiempo.porPersona.entries()].filter(([, v]) => v.horas > 0);
      const ids = [...new Set([...filasT.map((f) => f.user_id), ...conHoras.map(([id]) => id)])];
      const perfilPor = new Map<string, { full_name: string | null; avatar_url: string | null; avatar_seed: string | null; nivel: string | null }>();
      if (ids.length > 0) {
        const { data: perfiles, error: e2 } = await sinTipar.from("profiles")
          .select("id, full_name, avatar_url, avatar_seed, nivel").in("id", ids);
        if (e2) throw new Error(e2.message);
        for (const p of (perfiles ?? []) as Array<{ id: string; full_name: string | null; avatar_url: string | null; avatar_seed: string | null; nivel: string | null }>) perfilPor.set(p.id, p);
      }
      const persona = (id: string): Persona => {
        const p = perfilPor.get(id);
        return { id, nombre: p?.full_name?.trim() || "", avatarUrl: p?.avatar_url ?? null, avatarSeed: p?.avatar_seed ?? null };
      };
      // RR. HH. no ve a admins ni al dueño.
      const visible = (id: string) => !NIVELES_FUERA.has(perfilPor.get(id)?.nivel ?? "");

      return {
        tardanzas: filasT.filter((f) => visible(f.user_id)).map((f) => ({
          ...persona(f.user_id), id: f.id, turno: f.turno_nombre, tardeMin: f.tarde_min, entroAt: f.entro_at,
        })),
        asistencia: conHoras.filter(([id]) => visible(id))
          .map(([id, v]) => ({ ...persona(id), horas: v.horas, sinCamara: v.horasSinCamara ?? 0, sinPantalla: v.horasSinPantalla ?? 0 }))
          .sort((a, b) => b.horas - a.horas),
      };
    },
  });

  const fecha = new Date().toLocaleDateString(language === "es" ? "es-CO" : "en-US", { weekday: "long", day: "numeric", month: "long" });

  return (
    <TableroRRHHVista
      fecha={fecha}
      datos={{
        data: datosQ.data,
        cargando: tiempo.cargando || datosQ.isLoading,
        fallo: tiempo.fallo || datosQ.isError,
        reintentar: () => { tiempo.reintentar(); void datosQ.refetch(); },
      }}
      pulso={<PulsoEquipoVivo conEquipo />}
      arriba={<QuienEstaBajando lugar="arriba" />}
    />
  );
}
