import { Link } from "react-router-dom";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useLanguage } from "@/hooks/useLanguage";
import { useEsDueno } from "@/hooks/useEsDueno";

/** Tarjeta en Ajustes que lleva a Posiciones. Solo el dueño la ve. */
export function TarjetaPosiciones() {
  const { t } = useLanguage();
  const { esDueno } = useEsDueno();
  if (esDueno !== true) return null;
  return (
    <Card>
      <CardContent className="flex items-start gap-3 p-6">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary"><ShieldCheck className="h-4 w-4" /></span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{t("posiciones.ajustes.titulo")}</div>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("posiciones.ajustes.desc")}</p>
        </div>
        <Button asChild size="sm" variant="outline"><Link to="/ajustes/posiciones">{t("posiciones.ajustes.abrir")}</Link></Button>
      </CardContent>
    </Card>
  );
}
