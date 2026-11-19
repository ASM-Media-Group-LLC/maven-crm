import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CreditCard, Download, Lock, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";
import { DIAS_DE_GRACIA, formatoUsd } from "@/lib/plataforma/planes";
import { usePlataforma } from "./contexto";
import { Baldosa, BarraDeUso, Cargando, Chip, ErrorConReintento, fechaCorta } from "./piezas";
import { AvisosDeCobro, CabeceraDeMarca, useResumen } from "./MiEmpresa";

// /mi-empresa/plan — «MI PLAN Y PAGOS» (tanda 8): el plan, el próximo cobro, la
// tarjeta guardada, las facturas, los días de prueba que quedan y el aviso de
// gracia/bloqueo. Lo ven el admin del cliente y el dueño; Grace ve el plan sin
// precios ni cobros (plan_de_organizacion le devuelve cobro = null).

export default function MiPlanYPagos() {
  const { t, language } = useLanguage();
  const p = usePlataforma();
  const { org, q } = useResumen();
  const pagos = useQuery({ queryKey: ["plataforma", "plan", org], queryFn: () => p.datos.planYPagos(org!), enabled: !!org });

  if (!org) return null;
  if (q.isLoading || pagos.isLoading) return <Cargando />;
  if (q.error || pagos.error) return <ErrorConReintento error={q.error ?? pagos.error} onReintentar={() => { void q.refetch(); void pagos.refetch(); }} />;
  const r = q.data!;
  const d = pagos.data!;
  const conPrecios = d.ve_precios && p.vePrecios;
  const cobro = conPrecios ? d.cobro : null;
  const volver = p.esPlataforma ? `/mi-empresa?org=${org}` : "/mi-empresa";
  // TODO(vagón 7): «Cambiar tarjeta» y las facturas abren el portal de clientes de Stripe (edge del edificio).
  const portalStripe = () => undefined;

  return (
    <div className="flex flex-col gap-5" data-plan-y-pagos>
      <Link to={volver} className="inline-flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />{t("plataforma.nav.miEmpresa")}
      </Link>
      <CabeceraDeMarca r={r} />
      <AvisosDeCobro r={r} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Baldosa
          etiqueta={t("plataforma.pagos.plan")}
          valor={d.plan ? t(`plataforma.plan.${d.plan.nombre}`) : "—"}
          pie={<div className="flex flex-col gap-1.5">
            {conPrecios && d.plan?.precio_usd != null && <span className="text-sm font-semibold text-foreground">{formatoUsd(d.plan.precio_usd)}{t("plataforma.porMes")}</span>}
            <BarraDeUso usadas={r.ocupadas} total={r.paquete} />
            <span>{t("plataforma.pagos.personasUsadas", { n: r.ocupadas, total: r.paquete })}</span>
          </div>}
        />
        {cobro ? (
          <>
            <Baldosa
              etiqueta={t("plataforma.pagos.proximo")}
              valor={cobro.proximo_monto_usd != null ? formatoUsd(cobro.proximo_monto_usd) : "—"}
              tono={cobro.estado === "gracia" ? "alerta" : cobro.estado === "bloqueado" ? "mal" : undefined}
              pie={cobro.estado === "prueba" && cobro.dias_prueba_restantes != null
                ? t("plataforma.pagos.pruebaQuedan", { n: cobro.dias_prueba_restantes })
                : cobro.estado === "gracia" && cobro.dias_gracia_restantes != null
                  ? t("plataforma.pagos.graciaQuedan", { n: cobro.dias_gracia_restantes, total: DIAS_DE_GRACIA })
                  : cobro.proximo_cobro_at ? t("plataforma.pagos.el", { fecha: fechaCorta(cobro.proximo_cobro_at, language) }) : t("plataforma.pagos.sinCobro")}
            />
            <Baldosa
              etiqueta={t("plataforma.pagos.tarjeta")}
              valor={cobro.tarjeta ? <span className="inline-flex items-center gap-2 text-xl"><CreditCard className="h-5 w-5 text-primary" />{cobro.tarjeta.marca} •••• {cobro.tarjeta.ultimos4}</span> : t("plataforma.pagos.sinTarjeta")}
              pie={<div className="flex flex-col items-start gap-2">
                {cobro.tarjeta && <span>{t("plataforma.pagos.vence", { fecha: cobro.tarjeta.vence })}</span>}
                {!p.verComo && <Button size="sm" variant="outline" onClick={portalStripe} title={t("plataforma.pagos.stripeAyuda")}>{cobro.tarjeta ? t("plataforma.pagos.cambiarTarjeta") : t("plataforma.pagos.ponerTarjeta")}</Button>}
              </div>}
            />
          </>
        ) : (
          <div className="vidrio flex items-center gap-3 p-5 text-sm text-muted-foreground md:col-span-2" data-sin-cobros>
            <Lock className="h-4 w-4 shrink-0" />{t("plataforma.pagos.sinPermiso")}
          </div>
        )}
      </div>

      {cobro && (
        <section className="vidrio p-5">
          <div className="mb-3 flex items-center gap-2">
            <Receipt className="h-4 w-4 text-primary" />
            <h2 className="text-base font-semibold">{t("plataforma.pagos.facturas")}</h2>
          </div>
          {cobro.facturas.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("plataforma.pagos.sinFacturas")}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 font-medium">{t("plataforma.pagos.col.fecha")}</th>
                    <th className="pb-2 font-medium">{t("plataforma.pagos.col.concepto")}</th>
                    <th className="pb-2 font-medium">{t("plataforma.pagos.col.monto")}</th>
                    <th className="pb-2 font-medium">{t("plataforma.pagos.col.estado")}</th>
                    <th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {cobro.facturas.map((f) => (
                    <tr key={f.id} className="border-t border-border/50">
                      <td className="py-2.5 text-muted-foreground">{fechaCorta(f.fecha, language)}</td>
                      <td>{t(`plataforma.pagos.concepto.${f.concepto}`)}</td>
                      <td className="font-semibold tabular-nums">{formatoUsd(f.monto_usd)}</td>
                      <td>
                        {f.estado === "pagada" ? <Chip tono="bien" punto>{t("plataforma.pagos.estado.pagada")}</Chip>
                          : f.estado === "fallida" ? <Chip tono="mal" punto>{t("plataforma.pagos.estado.fallida")}</Chip>
                          : <Chip tono="alerta" punto>{t("plataforma.pagos.estado.pendiente")}</Chip>}
                      </td>
                      <td className="text-right">
                        {f.url && <Button size="sm" variant="ghost" onClick={portalStripe} aria-label={t("plataforma.pagos.descargar")}><Download className="h-4 w-4" /></Button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted-foreground">{t("plataforma.pagos.pie")}</p>
        </section>
      )}
    </div>
  );
}
