import { Eye } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useMonitorEstado } from "@/hooks/useMonitorEstado";

// Cartelito discreto de "monitor activo" para la persona que está siendo
// monitoreada. Es a propósito VISIBLE: sabe que la cámara se vigila (más justo)
// y cubre a la empresa. No se muestra a los admins (exentos) ni cuando el
// monitor está apagado. Usa useMonitorEstado (sin react-query) para no reventar
// los tests que montan la vista sin QueryClientProvider.
export function IndicadorMonitorActivo({ enSala }: { enSala: boolean }) {
  const { esAdmin, activo } = useMonitorEstado(enSala);
  const { t } = useLanguage();
  if (!enSala || esAdmin !== false || activo !== true) return null;
  return (
    <div className="pointer-events-none fixed bottom-3 left-3 z-30 flex items-center gap-1.5 rounded-full border border-border/50 bg-background/80 px-2.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur">
      <Eye className="h-3 w-3 text-primary" />
      {t("cowork.monitorActivo")}
    </div>
  );
}
