import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatDistanceToNowStrict } from "date-fns";
import { es as esLocale } from "date-fns/locale";
import { ArrowRight, Bell, CalendarDays, Clock, Headset, LayoutGrid } from "lucide-react";
import { Page } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { TarjetaKpi } from "@/components/ui/TarjetaKpi";
import SelectorDeTablero from "@/pages/dashboard/SelectorDeTablero";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useMyProfile } from "@/hooks/useUserProfile";
import { usePermissions } from "@/hooks/usePermissions";
import { useUserRole } from "@/hooks/useUserRole";
import { useEsDueno } from "@/hooks/useEsDueno";
import { useEquipoTiempoCowork } from "@/hooks/useEquipoTiempoCowork";
import { NAV_CATALOG, filterNavCatalog, type NavCatalogEntry } from "@/lib/navCatalog";
import { horasCortas, hoyBogota, lunesDeDia } from "@/lib/diaBogota";
import type { TranslationKey } from "@/lib/i18n";

// «SOLO LO TUYO» (Alvaro, 10/11/2026 — «quién mira qué»). El tablero de quien no
// tiene uno de su área (Finanzas, PR, coordinadores, closers, Warming, Básico…):
// sus horas de Cowork, sus avisos y sus accesos directos. Sin números del
// negocio y sin datos de otras personas. Reemplaza al tablero genérico, que
// mostraba creadoras, tickets, top 5 y actividad de toda la empresa.

export interface AvisoMio {
  id: string;
  title: string;
  message: string | null;
  created_at: string;
  status: string | null;
  deep_link_url: string | null;
}

export interface EstadoLectura<T> {
  data: T | undefined;
  cargando: boolean;
  fallo: boolean;
  reintentar: () => void;
}

/** Las entradas del menú que valen como acceso directo (sin el propio tablero). */
export function accesosDirectos(visibles: NavCatalogEntry[]): NavCatalogEntry[] {
  return visibles.filter((e) => e.url !== "/dashboard" && e.section !== "Sistema" && e.section !== "Admin");
}

function Fallo({ onReintentar }: { onReintentar: () => void }) {
  const { t } = useLanguage();
  return (
    <p role="alert" className="text-sm text-muted-foreground">
      {t("dashboard.centro.fallo")}
      <button type="button" onClick={onReintentar} className="underline underline-offset-2 hover:text-foreground">{t("dashboard.centro.reintentar")}</button>
    </p>
  );
}

export function MiTableroVista({ nombre, fecha, horas, avisos, accesos }: {
  nombre: string;
  fecha: string;
  horas: EstadoLectura<{ hoy: number; semana: number }>;
  avisos: EstadoLectura<AvisoMio[]>;
  accesos: NavCatalogEntry[];
}) {
  const { t, language } = useLanguage();
  const hace = (iso: string) => {
    try { return formatDistanceToNowStrict(new Date(iso), { addSuffix: true, locale: language === "es" ? esLocale : undefined }); }
    catch { return ""; }
  };
  const valorHoras = (h: number | undefined) => (horas.fallo ? "–" : horas.cargando ? "…" : horasCortas(h ?? 0));

  return (
    <Page>
      <div className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <SelectorDeTablero actual="mio" titulo={nombre ? t("chatters.dash.hello", { name: nombre }) : undefined} clase="font-display text-2xl font-bold tracking-tight" />
            <p className="text-sm text-muted-foreground first-letter:uppercase">{fecha}</p>
          </div>
          <Button asChild variant="outline" size="sm" className="rounded-control">
            <Link to="/cowork"><Headset className="mr-1.5 h-4 w-4" />{t("dashboard.centro.abrirCowork")}</Link>
          </Button>
        </div>

        {/* Tu tiempo en Cowork: el reloj que cuenta tu jornada. */}
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">{t("dashboard.mio.tiempo")}</h2>
          {horas.fallo ? <Fallo onReintentar={horas.reintentar} /> : (
            <div className="grid grid-cols-2 gap-3">
              <TarjetaKpi indice={0} icono={Clock} tono="success" etiqueta={t("dashboard.mio.hoy")}
                valor={valorHoras(horas.data?.hoy)} detalle={t("dashboard.mio.hoyDetalle")} />
              <TarjetaKpi indice={1} icono={CalendarDays} etiqueta={t("dashboard.mio.semana")}
                valor={valorHoras(horas.data?.semana)} detalle={t("dashboard.mio.semanaDetalle")} />
            </div>
          )}
        </section>

        <div className="grid items-start gap-4 lg:grid-cols-2">
          {/* Tus avisos: lo último que te llegó a la campana. */}
          <section className="vidrio min-w-0 p-4">
            <div className="v-cont flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">{t("dashboard.mio.avisos")}</h2>
                <Link to="/notificaciones" className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline">
                  {t("dashboard.mio.verTodos")}<ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
              {avisos.fallo ? <Fallo onReintentar={avisos.reintentar} />
                : avisos.cargando ? <p className="text-sm text-muted-foreground">…</p>
                : (avisos.data ?? []).length === 0 ? <p className="text-sm text-muted-foreground">{t("dashboard.mio.sinAvisos")}</p>
                : (
                  <ul className="flex flex-col divide-y divide-border/40">
                    {(avisos.data ?? []).map((a) => {
                      const nuevo = a.status === "new";
                      return (
                        <li key={a.id}>
                          <Link to={a.deep_link_url || "/notificaciones"} className="flex items-start gap-2.5 py-2 hover:text-foreground">
                            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${nuevo ? "bg-primary" : "bg-muted-foreground/30"}`} />
                            <span className="min-w-0 flex-1">
                              <span className={`block truncate text-sm ${nuevo ? "font-semibold" : ""}`}>{a.title}</span>
                              {a.message && <span className="block truncate text-xs text-muted-foreground">{a.message}</span>}
                            </span>
                            <span className="shrink-0 text-[11px] text-muted-foreground">{hace(a.created_at)}</span>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                )}
            </div>
          </section>

          {/* Tus accesos: solo los módulos que tu rol puede abrir. */}
          <section className="vidrio min-w-0 p-4">
            <div className="v-cont flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold">{t("dashboard.mio.accesos")}</h2>
              </div>
              {accesos.length === 0 ? <p className="text-sm text-muted-foreground">{t("dashboard.mio.sinAccesos")}</p> : (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {accesos.map((e) => {
                    const Icono = e.icon;
                    return (
                      <Link key={e.url} to={e.url}
                        className="flex items-center gap-2 rounded-panel border border-border/50 bg-card/30 px-2.5 py-2 text-sm transition hover:border-primary/30 hover:bg-card/50">
                        <Icono className="h-4 w-4 shrink-0 text-primary/80" />
                        <span className="truncate">{e.i18nKey ? t(e.i18nKey as TranslationKey) : e.title}</span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </Page>
  );
}

export default function MiTablero() {
  const { language } = useLanguage();
  const { user } = useAuth();
  const { data: perfil } = useMyProfile();
  const { canAccess } = usePermissions();
  const { isAdmin } = useUserRole();
  const { esDueno } = useEsDueno();
  const uid = user?.id ?? null;

  const hoy = hoyBogota();
  const lunes = lunesDeDia(hoy);
  // El RPC devuelve solo la fila propia a quien no supervisa; a quien sí (p. ej.
  // Finanzas), la de todos: aquí se toma SOLO la propia.
  const hoyQ = useEquipoTiempoCowork(hoy, hoy);
  const semanaQ = useEquipoTiempoCowork(lunes, hoy);

  const avisosQ = useQuery({
    enabled: !!uid,
    queryKey: ["mis-avisos-tablero", uid],
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async (): Promise<AvisoMio[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, message, created_at, status, deep_link_url")
        .eq("user_id", uid!)
        .neq("status", "archived")
        .order("created_at", { ascending: false })
        .limit(6);
      if (error) throw new Error(error.message);
      return (data ?? []) as AvisoMio[];
    },
  });

  const accesos = useMemo(
    () => accesosDirectos(filterNavCatalog(canAccess, isAdmin, NAV_CATALOG, esDueno === true)),
    [canAccess, isAdmin, esDueno],
  );

  const fecha = new Date().toLocaleDateString(language === "es" ? "es-CO" : "en-US", { weekday: "long", day: "numeric", month: "long" });

  return (
    <MiTableroVista
      nombre={perfil?.full_name?.split(" ")[0] ?? ""}
      fecha={fecha}
      horas={{
        data: uid ? { hoy: hoyQ.porPersona.get(uid)?.horas ?? 0, semana: semanaQ.porPersona.get(uid)?.horas ?? 0 } : undefined,
        cargando: hoyQ.cargando || semanaQ.cargando,
        fallo: hoyQ.fallo || semanaQ.fallo,
        reintentar: () => { hoyQ.reintentar(); semanaQ.reintentar(); },
      }}
      avisos={{ data: avisosQ.data, cargando: avisosQ.isLoading, fallo: avisosQ.isError, reintentar: () => void avisosQ.refetch() }}
      accesos={accesos}
    />
  );
}
