import { useCallback, useEffect, useState } from "react";
import { Activity, Bell, LayoutGrid, MessageSquare, PhoneOff, Users, Video } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";

// EL CENTRO DE OPERACIONES (solo admin, detrás de AdminRoute).
//
// Nació la noche en que Alvaro vio un «Error de conexión» en el Hub con 11
// personas trabajando y no había DÓNDE mirar qué estaba pasando. Esta pantalla
// es ese dónde: lo vivo (gente en salas, reuniones), el volumen de la última
// hora y el semáforo de servicios, refrescado cada 10 segundos.
//
// Los números los arma la edge `centro-operaciones` (service_role, gate de
// admin adentro): desde el navegador no se puede —ni se debe— contar sobre
// tablas que la RLS recorta por persona.

type Servicio = { nombre: string; ok: boolean; ms: number | null };
type Estado = {
  personas_en_salas: number;
  salas_con_gente: number;
  sesiones_abiertas: number;
  reuniones_activas: number;
  mensajes_ultima_hora: number;
  notificaciones_ultima_hora: number;
  cortes_llamada_ultima_hora?: number;
  servicios: Servicio[];
};

function Tarjeta({ Icono, titulo, valor }: { Icono: typeof Users; titulo: string; valor: number }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icono className="h-4 w-4" aria-hidden="true" />
        <span className="text-sm">{titulo}</span>
      </div>
      <p className="mt-2 text-3xl font-semibold tabular-nums">{valor}</p>
    </div>
  );
}

export default function CentroOperaciones() {
  const { t } = useLanguage();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [fallo, setFallo] = useState(false);
  const [hora, setHora] = useState("");

  const cargar = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("sin sesión");
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/centro-operaciones`, {
        headers: {
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setEstado(await res.json() as Estado);
      setHora(new Date().toLocaleTimeString());
      // Un fallo no es «vacío»: el error solo se limpia cuando volvió a leer bien.
      setFallo(false);
    } catch (e) {
      console.error("[centro-operaciones]", e);
      setFallo(true);
    }
  }, []);

  useEffect(() => {
    cargar();
    const timer = window.setInterval(cargar, 10_000);
    return () => window.clearInterval(timer);
  }, [cargar]);

  const nombreSrv = (n: string) =>
    n === "base" ? t("centroOps.srv.base")
    : n === "frontend" ? t("centroOps.srv.frontend")
    : n === "livekit" ? t("centroOps.srv.livekit")
    : n;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("centroOps.title")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t("centroOps.subtitle")}</p>
      </div>

      {fallo && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          {t("centroOps.error")}
        </div>
      )}
      {!estado && !fallo && <p className="text-sm text-muted-foreground">{t("centroOps.cargando")}</p>}

      {estado && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Tarjeta Icono={Users} titulo={t("centroOps.enSalas")} valor={estado.personas_en_salas} />
            <Tarjeta Icono={LayoutGrid} titulo={t("centroOps.salas")} valor={estado.salas_con_gente} />
            <Tarjeta Icono={Activity} titulo={t("centroOps.sesiones")} valor={estado.sesiones_abiertas} />
            <Tarjeta Icono={Video} titulo={t("centroOps.reuniones")} valor={estado.reuniones_activas} />
            <Tarjeta Icono={MessageSquare} titulo={t("centroOps.mensajes1h")} valor={estado.mensajes_ultima_hora} />
            <Tarjeta Icono={Bell} titulo={t("centroOps.notis1h")} valor={estado.notificaciones_ultima_hora} />
            <Tarjeta Icono={PhoneOff} titulo={t("centroOps.cortes1h")} valor={estado.cortes_llamada_ultima_hora ?? 0} />
          </div>

          <div className="rounded-xl border bg-card">
            <div className="border-b px-5 py-3 text-sm font-medium">{t("centroOps.servicios")}</div>
            <ul className="divide-y">
              {estado.servicios.map((s) => (
                <li className="flex items-center gap-3 px-5 py-3 text-sm" key={s.nombre}>
                  <span className={`h-2.5 w-2.5 rounded-full ${s.ok ? "bg-emerald-500" : "bg-red-500"}`} aria-hidden="true" />
                  <span className="flex-1">{nombreSrv(s.nombre)}</span>
                  <span className={s.ok ? "text-emerald-500" : "text-red-500"}>
                    {s.ok ? t("centroOps.ok") : t("centroOps.caido")}
                  </span>
                  {s.ms != null && (
                    <span className="w-16 text-right tabular-nums text-muted-foreground">{s.ms} ms</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-muted-foreground">
            {t("centroOps.actualizado").replace("{hora}", hora)}
          </p>
        </>
      )}
    </div>
  );
}
