// Apps y páginas del día de una persona, en el Expediente (Alvaro, 17/11/2026:
// «app y página», como Hubstaff). Sale de la app de computador de Maven
// (tabla argos_uso_apps): cuánto tiempo en cada app, cuánto de eso sin tocar
// teclado ni mouse, y las páginas o ventanas donde más estuvo.
import { useCallback, useEffect, useState } from "react";
import { AppWindow, ChevronDown, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { cn } from "@/lib/utils";
import { duracion, resumirUso, type FilaUso, type ResumenUso } from "@/lib/usoDeApps";

/** El día en hora de Bogotá (UTC-5 fijo, sin horario de verano). */
function rangoDelDia(fecha: string) {
  const desde = new Date(`${fecha}T00:00:00-05:00`);
  return { desde: desde.toISOString(), hasta: new Date(desde.getTime() + 86_400_000).toISOString() };
}

export function AppsDelDia({ userId, fecha }: { userId: string; fecha: string }) {
  const { t } = useLanguage();
  // undefined = cargando; null = falló; resumen = listo (puede venir vacío).
  const [resumen, setResumen] = useState<ResumenUso | null | undefined>(undefined);
  const [abierta, setAbierta] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setResumen(undefined);
    const { desde, hasta } = rangoDelDia(fecha);
    const { data, error } = await supabase
      .from("argos_uso_apps" as never)
      .select("app, titulo, url, segundos, segundos_inactivo")
      .eq("user_id", userId)
      .gte("desde", desde)
      .lt("desde", hasta)
      .order("desde", { ascending: true })
      .limit(5000);
    setResumen(error || !data ? null : resumirUso(data as unknown as FilaUso[]));
  }, [userId, fecha]);

  useEffect(() => { void cargar(); }, [cargar]);

  let cuerpo: React.ReactNode;
  if (resumen === undefined) {
    cuerpo = <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  } else if (resumen === null) {
    cuerpo = (
      <div className="flex flex-wrap items-center gap-3 py-2 text-sm text-muted-foreground">
        <span>{t("hr.apps.errorCarga")}</span>
        <button type="button" onClick={() => void cargar()} className="font-medium text-primary hover:underline">{t("hr.apps.reintentar")}</button>
      </div>
    );
  } else if (resumen.apps.length === 0) {
    cuerpo = <p className="py-2 text-sm text-muted-foreground">{t("hr.apps.vacio")}</p>;
  } else {
    const max = resumen.apps[0].segundos || 1;
    cuerpo = (
      <div className="flex flex-col gap-4">
        <dl className="grid grid-cols-3 gap-2">
          <Cifra etiqueta={t("hr.apps.enElComputador")} valor={duracion(resumen.total)} />
          <Cifra etiqueta={t("hr.apps.activo")} valor={duracion(resumen.total - resumen.inactivos)} tono="text-success" />
          <Cifra etiqueta={t("hr.apps.sinTocar")} valor={duracion(resumen.inactivos)} tono={resumen.inactivos > 0 ? "text-warning" : undefined} />
        </dl>
        <ul className="flex flex-col gap-1.5">
          {resumen.apps.slice(0, 15).map((a) => {
            const ver = abierta === a.app;
            return (
              <li key={a.app} className="rounded-lg bg-muted/30">
                <button
                  type="button"
                  onClick={() => setAbierta(ver ? null : a.app)}
                  aria-expanded={ver}
                  disabled={a.paginas.length === 0}
                  className="flex w-full flex-col gap-1.5 px-3 py-2 text-left disabled:cursor-default"
                >
                  <span className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="flex min-w-0 items-center gap-1.5 font-medium">
                      <span className="truncate">{a.app}</span>
                      {a.paginas.length > 0 && <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform", ver && "rotate-180")} />}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {duracion(a.segundos)}
                      {a.inactivos >= 60 && <span className="text-warning"> · {t("hr.apps.quieto", { tiempo: duracion(a.inactivos) })}</span>}
                    </span>
                  </span>
                  <span className="relative h-1.5 overflow-hidden rounded-full bg-muted">
                    <span className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${Math.max(2, (a.segundos / max) * 100)}%` }} />
                    <span className="absolute inset-y-0 rounded-full bg-warning/80" style={{ left: `${((a.segundos - a.inactivos) / max) * 100}%`, width: `${(a.inactivos / max) * 100}%` }} />
                  </span>
                </button>
                {ver && (
                  <ul className="flex flex-col gap-1 border-t border-border/50 px-3 py-2">
                    {a.paginas.map((p) => (
                      <li key={p.titulo} className="flex items-baseline justify-between gap-3 text-xs">
                        <span className="min-w-0 truncate text-muted-foreground" title={p.url ?? p.titulo}>{p.titulo}</span>
                        <span className="shrink-0 tabular-nums">{duracion(p.segundos)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <section className="vidrio sube mt-4 p-4 lg:p-5">
      <div className="v-cont">
        <p className="mb-3 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <AppWindow className="h-3.5 w-3.5" />{t("hr.apps.titulo")}
        </p>
        {cuerpo}
      </div>
    </section>
  );
}

function Cifra({ etiqueta, valor, tono }: { etiqueta: string; valor: string; tono?: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 px-3 py-2">
      <dt className="text-[11px] text-muted-foreground">{etiqueta}</dt>
      <dd className={cn("font-display text-base font-semibold tabular-nums", tono)}>{valor}</dd>
    </div>
  );
}
