import { Link } from "react-router-dom";
import { Building2, Loader2 } from "lucide-react";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { useLanguage } from "@/hooks/useLanguage";
import { usePuedoConfigurarEmpresa } from "@/hooks/usePausas";
import { ModalidadesPausa } from "@/components/horarios/ModalidadesPausa";
import { CamaraPantallaPorPuesto } from "@/components/ajustes/CamaraPantallaPorPuesto";
import { PoliticaAusencias } from "@/components/ausencias/PoliticaAusencias";

// AJUSTES → EMPRESA (Alvaro, 19/11/2026): lo que es de toda la empresa y no de
// un puesto vive aquí, para que cualquier empresa que use Maven se configure
// sola. Entra quien tenga en su puesto la función N:empresa.configurar (hoy el
// dueño y Admin). Aquí: la cámara y la pantalla por puesto (19/11/2026; la
// cambia quien tenga N:camara_pantalla.decidir) y las modalidades de pausa.

export default function Empresa() {
  const { t } = useLanguage();
  const puede = usePuedoConfigurarEmpresa();
  return (
    <Page>
      <PageHeader icon={<Building2 className="h-5 w-5" />} title={t("settings.empresa.titulo")} subtitle={t("settings.empresa.sub")} />
      <div className="mt-4 flex max-w-3xl flex-col gap-4">
        {/* La cámara y la pantalla por puesto las ve todo el que llega aquí desde
            un aviso (jefes, RR. HH.); cambiarlas es de quien tenga la función. */}
        <CamaraPantallaPorPuesto />
        {puede.isLoading ? (
          <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : puede.data ? (
          <>
            <ModalidadesPausa />
            {/* Ausencias y vacaciones (20/11/2026): de toda la empresa. */}
            <PoliticaAusencias />
          </>
        ) : (
          <div className="vidrio flex flex-col gap-2 p-6 text-sm text-muted-foreground">
            <p>{t("settings.empresa.sinPermiso")}</p>
            <Link to="/settings" className="font-medium text-primary hover:underline">{t("settings.empresa.volver")}</Link>
          </div>
        )}
      </div>
    </Page>
  );
}
