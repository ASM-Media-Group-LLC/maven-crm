// El equipo de la persona en el día, en el Expediente (Alvaro, 18/11/2026): el
// medidor de la app de computador (internet, computador y memoria) guardado
// cada 5 minutos en equipo_salud. Ver lib/equipoDelDia.ts.
import { useCallback, useEffect, useState } from "react";
import { Cpu, Gauge, Loader2, MemoryStick, Wifi } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/lib/i18n";
import type { Cosa, Luz } from "@/lib/medidorEquipo";
import { resumirEquipo, type FilaEquipo, type ResumenEquipo } from "@/lib/equipoDelDia";

function rangoDelDia(fecha: string) {
  const desde = new Date(`${fecha}T00:00:00-05:00`);
  return { desde: desde.toISOString(), hasta: new Date(desde.getTime() + 86_400_000).toISOString() };
}

const ICONO: Record<Cosa, LucideIcon> = { internet: Wifi, computador: Cpu, memoria: MemoryStick };
const COLOR: Record<Luz, string> = { verde: "text-success", amarillo: "text-warning", rojo: "text-destructive", sin_dato: "text-muted-foreground" };

export function EquipoDelDia({ userId, fecha }: { userId: string; fecha: string }) {
  const { t } = useLanguage();
  const [resumen, setResumen] = useState<ResumenEquipo | null | undefined>(undefined);

  const cargar = useCallback(async () => {
    setResumen(undefined);
    const { desde, hasta } = rangoDelDia(fecha);
    const { data, error } = await supabase
      .from("equipo_salud" as never)
      .select("creado, datos")
      .eq("user_id", userId)
      .gte("creado", desde)
      .lt("creado", hasta)
      .order("creado", { ascending: true })
      .limit(1000);
    setResumen(error || !data ? null : resumirEquipo(data as unknown as FilaEquipo[]));
  }, [userId, fecha]);

  useEffect(() => { void cargar(); }, [cargar]);

  let cuerpo: React.ReactNode;
  if (resumen === undefined) {
    cuerpo = <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  } else if (resumen === null) {
    cuerpo = (
      <div className="flex flex-wrap items-center gap-3 py-2 text-sm text-muted-foreground">
        <span>{t("hr.equipo.errorCarga")}</span>
        <button type="button" onClick={() => void cargar()} className="font-medium text-primary hover:underline">{t("hr.apps.reintentar")}</button>
      </div>
    );
  } else if (resumen.muestras === 0) {
    cuerpo = <p className="py-2 text-sm text-muted-foreground">{t("hr.equipo.vacio")}</p>;
  } else {
    const u = resumen.ultima?.datos ?? {};
    const valor: Record<Cosa, string> = {
      internet: u.en_linea === false ? t("pwa.medidor.sinConexion") : u.ping_ms != null ? `${u.ping_ms} ms` : "—",
      computador: u.cpu_equipo_pct != null ? `${u.cpu_equipo_pct}%` : "—",
      memoria: u.libre_gb != null ? t("pwa.medidor.libres", { gb: Number(u.libre_gb) }) : "—",
    };
    cuerpo = (
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {(["internet", "computador", "memoria"] as Cosa[]).map((c) => {
          const Icono = ICONO[c];
          const luz = (u[c] as Luz | undefined) ?? "sin_dato";
          const pctRojo = Math.round((resumen.rojos[c] / resumen.muestras) * 100);
          return (
            <div key={c} className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
              <dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Icono className={cn("h-3.5 w-3.5", COLOR[luz])} />{t(`pwa.medidor.${c}` as TranslationKey)}
              </dt>
              <dd className={cn("font-display text-base font-semibold tabular-nums", COLOR[luz])}>{valor[c]}</dd>
              <dd className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full bg-destructive" style={{ width: `${pctRojo}%` }} />
              </dd>
              <dd className="mt-1 text-[11px] text-muted-foreground">
                {resumen.rojos[c] > 0 ? t("hr.equipo.enRojo", { pct: pctRojo }) : t("hr.equipo.bien")}
              </dd>
            </div>
          );
        })}
      </dl>
    );
  }

  return (
    <section className="vidrio sube mt-4 p-4 lg:p-5">
      <div className="v-cont">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Gauge className="h-3.5 w-3.5" />{t("hr.equipo.titulo")}
        </p>
        {cuerpo}
      </div>
    </section>
  );
}
