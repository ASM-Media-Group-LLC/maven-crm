import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle2, Scale } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/hooks/useLanguage";

// CONCILIACIÓN MAVEN ↔ BLU — el objetivo es que el número de creadoras coincida
// exacto entre las dos ("el número debe coincidir exacto de creadoras en maven y
// creadoras en blu, plus y massive").
//
// Hasta ahora esto solo se veía corriendo SQL a mano. Los tres motivos por los
// que no cuadra son distintos y se arreglan en lugares distintos:
//  · cuentas de BLU sin vincular → se vinculan acá abajo (tabla de huérfanas);
//  · creadoras que facturan pero no están `active` en Maven → es su estado el
//    que hay que corregir (o dejaron de ser nuestras);
//  · activas en Maven sin un peso en BLU → o no arrancaron, o falta la cuenta.
// Esa plata sin vincular no entra en NADA que filtre por creadora, empezando
// por el KPI "Ingresos de tus modelos" del tablero del manager.
//
// Se cuentan CREADORAS, no cuentas: tener dos cuentas de OF (una paga y una
// free) es normal en la industria y sigue siendo una sola creadora en Maven.

const money0 = (n: number) => "$" + Math.round(n || 0).toLocaleString("en-US");

interface Conciliacion {
  desde: string;
  /** TODAS las personas que facturaron: vinculadas + sueltas. Es el número que
   *  se compara contra las activas de Maven. */
  blu_personas: number;
  blu_vinculadas: number;
  blu_sin_vincular: number;
  /** De las sueltas, cuántas vinieron con la key de Plus o Massive: son nuestras. */
  blu_sueltas_con_agencia: number;
  blu_cuentas: number;
  blu_cuentas_vinculadas: number;
  maven_activas: number;
  maven_plus: number;
  maven_massive: number;
  estado_viejo: number;
  activas_sin_facturar: number;
  cuadra: boolean;
  /** Una fila por PERSONA: si tiene cuenta paga y free, van juntas. */
  sin_vincular: Array<{ cuenta: string; n_cuentas: number; bruto: number; dias: number; ultimo_dia: string; agencia: string | null }>;
  facturan_sin_estar_activas: Array<{ creadora: string; status: string; kash: string; cuentas: string; bruto: number; ultimo_dia: string }>;
  activas_sin_blu: Array<{ creadora: string; kash: string }>;
}

function Cifra({ label, valor, pie, tono }: { label: string; valor: string; pie?: string; tono?: "ok" | "alerta" }) {
  return (
    <div className={cn("rounded-xl border px-3 py-2.5",
      tono === "alerta" ? "border-warning/30 bg-warning/5" : tono === "ok" ? "border-success/30 bg-success/5" : "border-border")}>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums leading-none">{valor}</p>
      {pie && <p className="mt-1 text-[11px] text-muted-foreground">{pie}</p>}
    </div>
  );
}

export default function BluConciliacion() {
  // Antes de los `return` tempranos de abajo (isLoading / sin datos).
  const { t } = useLanguage();
  const { data, isLoading } = useQuery({
    queryKey: ["blu-conciliacion"],
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<Conciliacion> => {
      const { data, error } = await (supabase.rpc as any)("blu_conciliacion", { p_dias: 30 });
      if (error) throw error;
      return data as Conciliacion;
    },
  });

  if (isLoading) return <Skeleton className="h-40 w-full rounded-xl" />;
  if (!data) return null;

  const plataSuelta = data.sin_vincular.reduce((s, r) => s + Number(r.bruto), 0);
  const cuentasSueltas = data.sin_vincular.reduce((s, r) => s + Number(r.n_cuentas), 0);
  const diferencia = data.blu_personas - data.maven_activas;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-lg">
          <Scale className="h-5 w-5" />
          {t("promolog.bluReconciliation")}
          {data.cuadra ? (
            <Badge className="gap-1 border-success/30 bg-success/15 text-success" variant="outline">
              <CheckCircle2 className="h-3 w-3" /> {t("promolog.bluMatches")}
            </Badge>
          ) : (
            <Badge className="gap-1 border-warning/30 bg-warning/15 text-warning" variant="outline">
              <AlertTriangle className="h-3 w-3" /> {t("promolog.bluNoMatch")}
            </Badge>
          )}
        </CardTitle>
        <CardDescription>
          {t("promolog.bluDescBefore", { date: data.desde })}<strong>{t("promolog.bluDescPeople")}</strong>{t("promolog.bluDescAfter")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
          <Cifra
            label={t("promolog.bluBilled")}
            valor={String(data.blu_personas)}
            pie={t("promolog.bluBilledFoot", { linked: data.blu_vinculadas, loose: data.blu_sin_vincular, accounts: data.blu_cuentas })}
          />
          <Cifra
            label={t("promolog.mavenActive")}
            valor={String(data.maven_activas)}
            pie={`${data.maven_plus} Plus · ${data.maven_massive} Massive`}
          />
          <Cifra
            label={t("promolog.difference")}
            valor={diferencia === 0 ? "0" : `${diferencia > 0 ? "+" : ""}${diferencia}`}
            pie={diferencia === 0
              ? t("promolog.numbersMatch")
              : t("promolog.diffFoot", { loose: data.blu_sin_vincular, stale: data.estado_viejo, notBilled: data.activas_sin_facturar })}
            tono={diferencia === 0 ? "ok" : "alerta"}
          />
          <Cifra
            label={t("promolog.unownedMoney")}
            valor={money0(plataSuelta)}
            pie={t(data.blu_sin_vincular === 1 ? "promolog.unlinkedCreatorsOne" : "promolog.unlinkedCreatorsMany", { count: data.blu_sin_vincular }) + (cuentasSueltas > data.blu_sin_vincular ? t("promolog.accountsParen", { count: cuentasSueltas }) : "")}
            tono={plataSuelta > 0 ? "alerta" : "ok"}
          />
        </div>

        {data.sin_vincular.length > 0 && (
          <div className="rounded-xl border border-warning/25 bg-warning/5 p-3">
            <p className="text-xs font-semibold text-warning">
              {t("promolog.bluEarnUnlinked", { count: data.blu_sin_vincular })}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {data.blu_sueltas_con_agencia > 0 && (
                <>
                  <strong>{data.blu_sueltas_con_agencia}</strong>{t("promolog.bluAgencyKeyAfter")}{" "}
                </>
              )}
              {t("promolog.bluLinkBelow")}
            </p>
            <ul className="mt-2 divide-y divide-white/5">
              {data.sin_vincular.map((r) => (
                <li key={r.cuenta} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                  <span className="font-medium">{r.cuenta}</span>
                  {r.agencia ? (
                    <Badge variant="outline" className="border-success/30 text-[10px] capitalize text-success">
                      {r.agencia}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-[10px] text-muted-foreground">{t("promolog.noAgency")}</Badge>
                  )}
                  {r.n_cuentas > 1 && (
                    <Badge variant="outline" className="text-[10px]">{t("promolog.accountsCount", { count: r.n_cuentas })}</Badge>
                  )}
                  <span className="text-[11px] text-muted-foreground">{t("promolog.daysLast", { days: r.dias, last: r.ultimo_dia })}</span>
                  <span className="ml-auto font-semibold tabular-nums">{money0(r.bruto)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.facturan_sin_estar_activas.length > 0 && (
          <div className="rounded-xl border border-warning/25 bg-warning/5 p-3">
            <p className="text-xs font-semibold text-warning">
              {t("promolog.bluBillingNotActive", { count: data.facturan_sin_estar_activas.length })}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {t("promolog.bluStaleStatus")}
            </p>
            <ul className="mt-2 divide-y divide-white/5">
              {data.facturan_sin_estar_activas.map((r) => (
                <li key={r.creadora} className="flex flex-wrap items-center gap-2 py-1.5 text-sm">
                  <span className="font-medium">{r.creadora}</span>
                  <Badge variant="outline" className="text-[10px]">{r.status}</Badge>
                  <span className="text-[11px] text-muted-foreground">{r.kash} · {r.cuentas} · {t("promolog.lastOn", { date: r.ultimo_dia })}</span>
                  <span className="ml-auto font-semibold tabular-nums">{money0(r.bruto)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {data.activas_sin_blu.length > 0 && (
          <div className="rounded-xl border border-border p-3">
            <p className="text-xs font-semibold">
              {t("promolog.activeNoBlu", { count: data.activas_sin_blu.length })}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {t("promolog.activeNoBluDesc")}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {data.activas_sin_blu.map((r) => (
                <Badge key={r.creadora} variant="outline" className="text-[11px]">
                  {r.creadora} <span className="ml-1 text-muted-foreground">{r.kash}</span>
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
