import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Loader2, RefreshCw, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { useDondeEsta } from "@/hooks/useDondeEsta";
import { useTurnoPersonas } from "@/hooks/useTurnoPersonas";
import { armarEquipoHoy, ALERTAS_QUE_CUENTAN, type AlertaAbierta } from "@/lib/argosEquipo";
import { CuadritosEquipo, DetalleDepto, TarjetasDeDeptos } from "./Departamentos";
import { TARJETA } from "./piezas";
import { cn } from "@/lib/utils";

// EQUIPO HOY — la primera pestaña de Argos (antes «Dónde está»; Alvaro,
// 11/11/2026: «me pierdo»). Arriba, los cuadritos de siempre para todo el equipo
// ahora: conectados, van bien, van mal, llegaron tarde, no están en Cowork. Debajo,
// cada departamento con esas mismas cifras y QUIÉN va mal y por qué. Al tocar uno,
// su gente: primero quien va mal (con el porqué en minutos), luego quien va bien,
// luego quien no está. Dónde está cada uno (qué tiene en pantalla) va dentro del
// departamento. Se refresca solo (Dónde está cada 20 s). Un fallo se dice como
// fallo, nunca como «todos bien».

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sinTipar = supabase as unknown as { from: (t: string) => any };

/** Las alertas de Argos abiertas ahora (la RLS deja ver las de quien uno puede vigilar). */
export function useAlertasAbiertas() {
  return useQuery<AlertaAbierta[]>({
    queryKey: ["argos-alertas-abiertas"],
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await sinTipar.from("argos_alertas")
        .select("user_id, tipo, abierta_at, detalle")
        .is("cerrada_at", null)
        .in("tipo", ALERTAS_QUE_CUENTAN)
        .order("abierta_at", { ascending: true })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as AlertaAbierta[];
    },
  });
}

export function EquipoHoyPanel() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const hoy = useMemo(() => new Date().toLocaleDateString("en-CA", { timeZone: "America/Bogota" }), []);
  const donde = useDondeEsta();
  const turno = useTurnoPersonas(hoy, 0, 24, true);
  const alertas = useAlertasAbiertas();
  const [abierto, setAbierto] = useState<string | null>(null);

  const armado = useMemo(
    () => (donde.data ? armarEquipoHoy(donde.data, turno.personas, alertas.data ?? [], Date.now()) : null),
    [donde.data, turno.personas, alertas.data],
  );

  if (donde.isLoading || turno.cargando || alertas.isLoading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }
  const fallo = donde.isError || !!turno.error || alertas.isError;
  if (fallo || !armado) {
    return (
      <div role="alert" className={cn("flex flex-wrap items-center gap-3 border-destructive/60 p-5 text-sm", TARJETA)}>
        <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
        <span className="min-w-0 flex-1">{t("argos.equipo.fallo")}</span>
        <button type="button" onClick={() => { void donde.refetch(); void alertas.refetch(); }}
          className="inline-flex items-center gap-1.5 rounded-control border border-border px-2.5 py-1 text-xs font-medium hover:bg-muted">
          <RefreshCw className="h-3.5 w-3.5" />{t("argos.reintentar")}
        </button>
      </div>
    );
  }
  if (armado.deptos.length === 0) return <p className={cn("p-6 text-sm text-muted-foreground", TARJETA)}>{t("argos.equipo.nadieEnTurno")}</p>;

  const irA = (id: string) => navigate(`/hr/expediente/${id}`, { state: { volverA: "/hr/monitor-ia?t=donde" } });
  const regla = t("argos.equipo.regla");
  const depto = abierto ? armado.deptos.find((d) => d.nombre === abierto) ?? null : null;

  return (
    <section className={cn("p-5 sm:p-6", TARJETA)}>
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">{t("argos.equipo.hoyTitulo")}</h2>
        </div>
        {depto ? (
          <DetalleDepto d={depto} vivo regla={regla} onVolver={() => setAbierto(null)} onPersona={irA} t={t} />
        ) : (
          <>
            <CuadritosEquipo c={armado.resumen} t={t} regla={regla} />
            <p className="-mb-2 text-sm font-semibold text-foreground/90">{t("hr.hist.deptos")}</p>
            <TarjetasDeDeptos deptos={armado.deptos} onAbrir={setAbierto} t={t} vivo />
          </>
        )}
      </div>
    </section>
  );
}
