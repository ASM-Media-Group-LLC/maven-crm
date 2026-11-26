import { Briefcase } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";

// EL ROL SALE DE LA POSICIÓN (26/11/2026, Grace: «no me deja cambiarle el rol a
// Natalia»). Desde el 23/11 (#270) el rol de cada persona lo da su Posición
// (Ajustes → Posiciones), y el menú de rol salía gris sin decir por qué. En su
// lugar: lo que pasa, dicho, y un botón que lleva a elegirle la posición.
export function RolPorPosicion({ onAsignar, despuesDeCrear = false }: { onAsignar?: () => void; despuesDeCrear?: boolean }) {
  const { t } = useLanguage();
  return (
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5" data-rol-por-posicion>
      <p className="text-xs text-muted-foreground">
        {despuesDeCrear ? t("admin.rolPorPosicion.alCrear") : t("admin.rolPorPosicion.ayuda")}
      </p>
      {onAsignar && (
        <Button type="button" size="sm" variant="outline" onClick={onAsignar}>
          <Briefcase className="mr-1.5 h-3.5 w-3.5" aria-hidden />
          {t("admin.rolPorPosicion.boton")}
        </Button>
      )}
    </div>
  );
}
