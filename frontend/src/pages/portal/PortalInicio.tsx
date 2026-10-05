import { Link } from "react-router-dom";
import { ArrowRight, Clapperboard, FolderUp, Gift } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { nombreParaMostrar, useMiFicha, usePortal } from "@/hooks/usePortal";
import { CAMPOS_FICHA, respondidas, SECCIONES } from "@/lib/portal/ficha";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";

// Inicio del portal: el saludo, cuánto le falta de su ficha y lo que viene
// (contenido y personalizados llegan en las fases 2 y 3).

function saludo(hora: number): "portal.inicio.manana" | "portal.inicio.tarde" | "portal.inicio.noche" {
  if (hora >= 5 && hora < 12) return "portal.inicio.manana";
  if (hora >= 12 && hora < 19) return "portal.inicio.tarde";
  return "portal.inicio.noche";
}

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
    <div className="mx-auto w-full max-w-5xl px-4 py-6 md:px-8 md:py-10">
      <p className="text-sm text-muted-foreground">{t(saludo(new Date().getHours()))}</p>
      <h1 className="mt-1 text-3xl font-bold tracking-tight [text-wrap:balance] md:text-4xl">
        {t("portal.inicio.hola", { nombre: nombreParaMostrar(activa) })}
      </h1>
      <p className="mt-2 text-sm text-muted-foreground">{t("portal.inicio.agencia", { agencia: activa.agencia })}</p>

      <div className="mt-8 grid gap-4 lg:grid-cols-[3fr_2fr]">
        {/* Su ficha: lo único que ya puede hacer desde aquí */}
        <section className="rounded-2xl border border-border bg-card p-5 md:p-6">
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

        {/* Lo que viene: dicho con honestidad, sin botones que no hacen nada */}
        <section className="rounded-2xl border border-dashed border-border p-5 md:p-6">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <Gift className="h-4 w-4 text-primary" aria-hidden="true" />
            {t("portal.inicio.prontoTitulo")}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">{t("portal.inicio.prontoTexto")}</p>
          <ul className="mt-4 space-y-2 text-sm">
            <li className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2.5 text-muted-foreground">
              <FolderUp className="h-4 w-4" aria-hidden="true" />
              {t("portal.inicio.prontoContenido")}
            </li>
            <li className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2.5 text-muted-foreground">
              <Clapperboard className="h-4 w-4" aria-hidden="true" />
              {t("portal.inicio.prontoPedidos")}
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
