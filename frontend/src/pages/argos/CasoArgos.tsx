import { Link, useParams } from "react-router-dom";
import { Gavel, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { useLanguage } from "@/hooks/useLanguage";
import { useCaso, useFuncionesCasos } from "@/hooks/useCasosArgos";
import { CasoTarjeta } from "@/components/hr/CasoTarjeta";
import { veRevision } from "@/lib/casosArgos";

// Un caso de Argos por su enlace (19/11/2026): lo abre el aviso de la campana.
// La persona ve su propio día ya juzgado; su jefe, cuando quedó «cometió»; RR.
// HH., el dueño y quien tenga la función, con los botones de su puesto. La base
// decide quién puede verlo: «no existe o no tienes acceso» no es un error.

export default function CasoArgos() {
  const { t } = useLanguage();
  const { id } = useParams<{ id: string }>();
  const q = useCaso(id);
  const funciones = useFuncionesCasos();
  const deRrhh = veRevision(funciones.data);
  const esPropio = !!q.data && !deRrhh && !q.data.puede_juzgar && !q.data.puede_corregir;

  return (
    <Page>
      <PageHeader title={t("hr.casos.paginaTitulo")} subtitle={t("hr.casos.paginaSub")} icon={<Gavel className="h-5 w-5" />} />
      <div className="mx-auto mt-5 flex w-full max-w-2xl flex-col gap-4">
        {q.isLoading ? (
          <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : q.isError ? (
          <div className="vidrio flex flex-col items-center gap-3 p-8 text-center">
            <p className="text-sm text-muted-foreground">{t("hr.casos.errorCargar")}</p>
            <Button variant="outline" size="sm" className="rounded-control" onClick={() => void q.refetch()}><RefreshCw className="mr-1.5 h-3.5 w-3.5" />{t("hr.casos.reintentar")}</Button>
          </div>
        ) : !q.data ? (
          <div className="vidrio p-8 text-center text-sm text-muted-foreground">{t("hr.casos.sinAcceso")}</div>
        ) : (
          <>
            <CasoTarjeta caso={q.data} compacto={esPropio} />
            {esPropio && q.data.veredicto === "cometio" && (
              <p className="text-xs text-muted-foreground">{t("hr.casos.propioNota")}</p>
            )}
            {deRrhh && (
              <Link to={`/hr/monitor-ia?t=revision&dia=${q.data.dia}`} className="text-sm font-medium text-primary hover:underline">
                {t("hr.casos.verTodosDelDia")}
              </Link>
            )}
          </>
        )}
      </div>
    </Page>
  );
}
