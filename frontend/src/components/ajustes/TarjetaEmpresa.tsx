import { Link } from "react-router-dom";
import { Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/hooks/useLanguage";
import { usePuedoConfigurarEmpresa } from "@/hooks/usePausas";

/** Tarjeta en Ajustes que lleva a Empresa. La ve quien tenga en su puesto
 *  la función «Configurar la empresa» (19/11/2026). */
export function TarjetaEmpresa() {
  const { t } = useLanguage();
  const puede = usePuedoConfigurarEmpresa();
  if (puede.data !== true) return null;
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-6">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><Building2 className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{t("settings.empresa.titulo")}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("settings.empresa.tarjeta")}</p>
        </div>
        <Button asChild size="sm" variant="outline"><Link to="/ajustes/empresa">{t("settings.empresa.abrir")}</Link></Button>
      </CardContent>
    </Card>
  );
}
