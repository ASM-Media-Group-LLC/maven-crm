// Perfil de desempeño de un empleado. Primera pieza: el CALENDARIO DE AVISOS —
// un mes a la vez, con el número de avisos por día, y al tocar un día el detalle
// (hora, situación y quién lo mandó). Irá sumando pausas, cámara, horas y
// evaluación; por eso el encabezado dice "perfil de desempeño".
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { addMonths, format, isSameMonth, isToday, startOfMonth } from "date-fns";
import { es, enUS } from "date-fns/locale";
import { ArrowLeft, Bell, ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { useEmployeeAvisos } from "@/hooks/useEmployeeAvisos";
import { diasDelMes, claveDeDia } from "@/lib/calendario";
import { UserAvatar } from "@/components/UserAvatar";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface PerfilLite {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  avatar_seed: string | null;
}

export default function EmpleadoProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { t, language } = useLanguage();
  const locale = language === "en" ? enUS : es;

  const { data: perfil, isLoading: perfilCargando } = useQuery({
    queryKey: ["empleado-perfil", id],
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<PerfilLite | null> => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, avatar_seed")
        .eq("id", id!)
        .maybeSingle();
      return (data as PerfilLite | null) ?? null;
    },
  });

  const [mes, setMes] = useState<Date>(() => startOfMonth(new Date()));
  const [diaSel, setDiaSel] = useState<string>(() => claveDeDia(new Date()));

  const dias = useMemo(() => diasDelMes(mes), [mes]);
  const { data: avisos, isLoading: avisosCargando, isError: avisosError, refetch } =
    useEmployeeAvisos(id, mes);
  const porDia = avisos?.porDia;

  const irAHoy = () => {
    setMes(startOfMonth(new Date()));
    setDiaSel(claveDeDia(new Date()));
  };

  const avisosDelDia = porDia?.get(diaSel) ?? [];
  const fechaSel = useMemo(
    () => dias.find((d) => claveDeDia(d) === diaSel) ?? new Date(`${diaSel}T00:00:00`),
    [dias, diaSel],
  );
  const encabezadosSemana = dias.slice(0, 7).map((d) => format(d, "EEEEE", { locale }));

  const volver = (
    <Link to="/empleados" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {t("empleados.profile.back")}
    </Link>
  );

  if (perfilCargando) {
    return (
      <Page>
        <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      </Page>
    );
  }

  if (!perfil) {
    return (
      <Page>
        <div className="mb-5">{volver}</div>
        <PageHeader title={t("empleados.profile.back")} />
        <p className="mt-4 text-sm text-muted-foreground">{t("empleados.profile.notFound")}</p>
      </Page>
    );
  }

  return (
    <Page>
      <div className="mb-4">{volver}</div>
      <PageHeader
        className="mb-6"
        title={
          <span className="inline-flex items-center gap-3">
            <UserAvatar name={perfil.full_name ?? "—"} src={perfil.avatar_url} seed={perfil.avatar_seed} size="lg" />
            <span className="min-w-0 truncate">{perfil.full_name ?? "—"}</span>
          </span>
        }
        subtitle={t("empleados.profile.heading")}
      />

      <section className="rounded-card border border-border bg-card p-4 md:p-5">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-warning" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold">{t("empleados.avisos.title")}</h2>
              <p className="text-xs text-muted-foreground">{t("empleados.avisos.subtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("empleados.avisos.prevMonth")} onClick={() => setMes((m) => addMonths(m, -1))}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-[8.5rem] text-center text-sm font-medium capitalize">
              {format(mes, "LLLL yyyy", { locale })}
            </span>
            <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t("empleados.avisos.nextMonth")} onClick={() => setMes((m) => addMonths(m, 1))}>
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" className="ml-1 h-8" onClick={irAHoy}>
              {t("empleados.avisos.today")}
            </Button>
          </div>
        </div>

        <p className="mb-3 text-xs font-medium text-muted-foreground">
          {(avisos?.total ?? 0) > 0
            ? t("empleados.avisos.monthCount", { count: avisos?.total ?? 0 })
            : t("empleados.avisos.monthNone")}
        </p>

        {avisosError ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <p className="text-sm text-muted-foreground">{t("empleados.avisos.loadError")}</p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>{t("empleados.retry")}</Button>
          </div>
        ) : (
          <>
            {/* Grilla del mes (7 columnas fijas: es un calendario) */}
            <div className="grid grid-cols-7 gap-1 sm:grid-cols-7">
              {encabezadosSemana.map((etq, i) => (
                <div key={i} className="pb-1 text-center text-[11px] font-semibold uppercase text-muted-foreground">
                  {etq}
                </div>
              ))}
              {dias.map((d) => {
                const k = claveDeDia(d);
                const n = porDia?.get(k)?.length ?? 0;
                const enMes = isSameMonth(d, mes);
                const sel = k === diaSel;
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setDiaSel(k)}
                    className={cn(
                      "relative flex aspect-square flex-col items-center justify-center rounded-control border text-sm transition-colors",
                      sel ? "border-primary bg-primary/10 font-semibold" : "border-transparent hover:bg-accent/50",
                      !enMes && "text-muted-foreground/40",
                      isToday(d) && !sel && "border-border",
                    )}
                    aria-label={format(d, "PPP", { locale })}
                    aria-pressed={sel}
                  >
                    <span className={cn(isToday(d) && "flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground")}>
                      {format(d, "d")}
                    </span>
                    {n > 0 && (
                      <span className={cn(
                        "mt-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold",
                        enMes ? "bg-warning text-warning-foreground" : "bg-warning/40 text-warning-foreground",
                      )}>
                        {n}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Detalle del día elegido */}
            <div className="mt-5 border-t border-border pt-4">
              <h3 className="mb-2 text-xs font-semibold capitalize text-muted-foreground">
                {format(fechaSel, "PPP", { locale })}
              </h3>
              {avisosCargando ? (
                <div className="flex justify-center py-6 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : avisosDelDia.length === 0 ? (
                <p className="py-4 text-sm text-muted-foreground">{t("empleados.avisos.dayNone")}</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {avisosDelDia.map((a) => (
                    <li key={a.id} className="flex items-start gap-3 rounded-control border border-border bg-muted/20 px-3 py-2">
                      <span className="mt-0.5 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
                        {format(a.createdAt, "HH:mm")}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm leading-snug">{a.etiqueta ? t(a.etiqueta) : a.slug}</p>
                        {a.senderName && (
                          <p className="text-xs text-muted-foreground">{t("empleados.avisos.sentBy", { name: a.senderName })}</p>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </section>
    </Page>
  );
}
