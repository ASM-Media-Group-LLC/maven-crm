import { WifiOff, X } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { RUTA_GUIA_CONEXION } from "@/lib/guiaConexion";
import { cerrarAvisoCaidas, useAvisoCaidasSeguidas } from "@/lib/caidasSeguidas";

/**
 * «Tu internet se está cortando seguido» (lib/caidasSeguidas.ts): sale en la
 * llamada con 3 caídas propias en 30 minutos, una vez por hora como mucho. No
 * bloquea ni apaga nada: un consejo y la guía de conexión.
 *
 * La guía abre en una pestaña NUEVA a propósito: varias llamadas (la pestaña de
 * /call, los Meet, el meet y la privada de Cowork) no viven en la ventanita
 * flotante, y navegar en esta pestaña las colgaría.
 */
export default function AvisoCaidasSeguidas() {
  const visible = useAvisoCaidasSeguidas();
  const { t } = useLanguage();
  if (!visible) return null;
  return (
    <div role="status" className="shrink-0 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 py-1.5 px-3 bg-warning/10 text-warning text-xs font-medium text-center">
      <WifiOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>
        <span className="font-semibold">{t("messenger.callView.caidasSeguidas")}</span>{" "}
        {t("messenger.callView.caidasSeguidasConsejo")}
      </span>
      <a
        href={RUTA_GUIA_CONEXION}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => cerrarAvisoCaidas()}
        className="rounded-full bg-warning px-3 py-0.5 text-warning-foreground font-semibold hover:bg-warning/90"
      >
        {t("messenger.callView.caidasSeguidasGuia")}
      </a>
      <button
        type="button"
        onClick={() => cerrarAvisoCaidas()}
        aria-label={t("messenger.callView.caidasSeguidasCerrar")}
        title={t("messenger.callView.caidasSeguidasCerrar")}
        className="rounded-full p-0.5 opacity-70 hover:opacity-100"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
