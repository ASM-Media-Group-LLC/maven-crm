import { Link } from "react-router-dom";
import { ArrowRight, Clapperboard, Gift, Images } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { nombreParaMostrar, useMiFicha, usePortal } from "@/hooks/usePortal";
import { CAMPOS_FICHA, respondidas, SECCIONES } from "@/lib/portal/ficha";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";

// Inicio del portal: el saludo, cuánto le falta de su ficha y lo que viene
// (contenido y personalizados llegan en las fases 2 y 3).

export default function PortalInicio() {
  const { t } = useLanguage();
  const { activa } = usePortal();
  const ficha = useMiFicha(activa.creator_id);
  const total = CAMPOS_FICHA.length;
  const hechas = respondidas(ficha.data);
  const completa = hechas === total;
  const faltan = SECCIONES.filter((s) => respondidas(ficha.data, s.campos.map((c) => c.clave)) < s.campos.length)
    .map((s) => t(s.titulo));

  return (
    <Page>
      <PageHeader
        // «Bienvenida a tu portal de Kash» (Jhon, 06/10: el «Buenas tardes ·
        // Trabajas con Kash» sonaba a robot).
        title={t("portal.inicio.bienvenida", { agencia: activa.agencia })}
        subtitle={t("portal.inicio.hola", { nombre: nombreParaMostrar(activa) })}
      />

      <div className="mt-6 grid gap-4 lg:grid-cols-[3fr_2fr]">
        {/* Su ficha: lo único que ya puede hacer desde aquí */}
        <section className="rounded-card border border-border bg-card p-5 md:p-6">
          {ficha.isLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-2 w-full" />
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold">{t(completa ? "portal.inicio.fichaTituloLista" : "portal.inicio.fichaTitulo")}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">{t("portal.inicio.fichaTexto")}</p>
                </div>
                <span className="shrink-0 rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold tabular-nums text-primary">
                  {hechas}/{total}
                </span>
              </div>
              <Progress value={(hechas / total) * 100} className="mt-5 h-2" aria-label={t("portal.inicio.fichaProgreso", { hechas, total })} />
              <p className="mt-2 text-xs text-muted-foreground">
                {t("portal.inicio.fichaProgreso", { hechas, total })}
                {faltan.length > 0 && ` · ${t("portal.inicio.fichaFaltan", { secciones: faltan.join(", ") })}`}
              </p>
              <Button asChild className="mt-5 min-h-11 w-full sm:w-auto">
                <Link to="/portal/ficha">
                  {t(completa ? "portal.inicio.revisar" : "portal.inicio.completar")}
                  <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                </Link>
              </Button>
            </>
          )}
        </section>

        <div className="space-y-4">
          {/* Su contenido: subir desde aquí mismo */}
          <section className="rounded-card border border-border bg-card p-5 md:p-6">
            <div className="flex items-center gap-2 text-base font-semibold">
              <Images className="h-5 w-5 text-primary" aria-hidden="true" />
              {t("portal.inicio.contenidoTitulo")}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{t("portal.inicio.contenidoTexto")}</p>
            <Button asChild variant="outline" className="mt-4 min-h-11 w-full sm:w-auto">
              <Link to="/portal/contenido">
                {t("portal.inicio.contenidoBoton")}
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </section>
          {/* Lo que viene: dicho con honestidad, sin botones que no hacen nada */}
          <section className="rounded-card border border-dashed border-border p-5 md:p-6">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Gift className="h-4 w-4 text-primary" aria-hidden="true" />
              {t("portal.inicio.prontoTitulo")}
            </div>
            <p className="mt-2 flex items-start gap-2 text-sm text-muted-foreground">
              <Clapperboard className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {t("portal.inicio.prontoPedidosTexto")}
            </p>
          </section>
        </div>
      </div>
    </Page>
  );
}
