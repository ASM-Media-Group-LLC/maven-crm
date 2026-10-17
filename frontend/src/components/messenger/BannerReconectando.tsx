import { Loader2 } from "lucide-react";
import { useSaludDelChat } from "@/hooks/canalDelChat";
import { useLanguage } from "@/hooks/useLanguage";

/**
 * EL AVISO DE RECONEXIÓN.
 *
 * Sale una franja fina bajo el encabezado del chat SOLO cuando el realtime del
 * chat está caído (la salud compartida por pestaña dice "reconectando"). Sirve
 * para que nadie crea que "está roto" ni recargue: mientras se ve el aviso, los
 * mensajes llegan igual por el repaso rápido (useMessages) cada pocos segundos,
 * y en cuanto el socket vuelve, el aviso desaparece solo.
 *
 * Se monta en ChatHeader, que usan las dos vistas de conversación (la página de
 * Messenger y la ventanita del muelle), así que cubre las dos con un solo lugar.
 */
export default function BannerReconectando() {
  const salud = useSaludDelChat();
  const { t } = useLanguage();
  if (salud !== "reconectando") return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 px-3 py-1.5 text-[11px] font-medium bg-amber-500/10 text-amber-700 dark:text-amber-400 border-t border-amber-500/20"
    >
      <Loader2 className="h-3 w-3 animate-spin shrink-0" aria-hidden="true" />
      <span className="truncate">{t("messenger.reconectando.aviso")}</span>
    </div>
  );
}
