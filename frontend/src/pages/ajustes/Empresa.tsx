import { Link } from "react-router-dom";
import { Building2, Loader2 } from "lucide-react";
import { Page } from "@/components/ui/page";
import { PageHeader } from "@/components/ui/page-header";
import { useLanguage } from "@/hooks/useLanguage";
import { usePuedoConfigurarEmpresa } from "@/hooks/usePausas";
import { ModalidadesPausa } from "@/components/horarios/ModalidadesPausa";

// AJUSTES → EMPRESA (Alvaro, 19/11/2026): lo que es de toda la empresa y no de
// un puesto vive aquí, para que cualquier empresa que use Maven se configure
// sola. Entra quien tenga en su puesto la función N:empresa.configurar (hoy el
// dueño y Admin). Por ahora: las modalidades de pausa.

export default function Empresa() {
  const { t } = useLanguage();
  const puede = usePuedoConfigurarEmpresa();
  return (
    <Page>
      <PageHeader icon={<Building2 className="h-5 w-5" />} title={t("settings.empresa.titulo")} subtitle={t("settings.empresa.sub")} />
      <div className="mt-4 flex max-w-3xl flex-col gap-4">
        {puede.isLoading ? (
          <div className="flex justify-center p-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : puede.data ? (
          <ModalidadesPausa />
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
