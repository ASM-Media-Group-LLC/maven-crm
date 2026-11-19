import { useEffect, useState } from "react";
import { useUltimoPantallazo } from "@/lib/monitorLocal";
import { useLanguage } from "@/hooks/useLanguage";

// «Monitoreo activo · pantallazo hace X» (Alvaro, 10/11): se ve también en la
// ventanita flotante y en la ventana del sistema, para que la persona sepa que
// el monitoreo sigue aunque esté en otra app.
//
// Vive en su propio componente a propósito (19/11/2026): el último pantallazo
// llega por un store (useSyncExternalStore), que React dibuja AL MOMENTO y no
// cuando le queda tiempo. Leído desde LiveKitCallView, cada pantallazo (uno por
// minuto) redibujaba la llamada entera de golpe, y su reloj de 30 s otra vez.
// Aquí solo se redibuja esta línea. Se ve exactamente igual.
export default function MonitoreoActivo() {
  const { t } = useLanguage();
  const ultimoPantallazo = useUltimoPantallazo();
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    // Al llegar un pantallazo nuevo se mide desde ya (no desde el último tic).
    setAhora(Date.now());
    const id = window.setInterval(() => setAhora(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, [ultimoPantallazo]);
  if (!ultimoPantallazo || ahora - ultimoPantallazo >= 5 * 60_000) return null;
  return (
    <div role="status" className="shrink-0 flex items-center justify-center gap-1.5 py-1 px-3 text-[11px] text-muted-foreground">
      <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden />
      {t("messenger.callView.monitoreoActivo", {
        hace: ahora - ultimoPantallazo < 60_000
          ? t("messenger.callView.monitoreoAhora")
          : t("messenger.callView.monitoreoMin", { n: Math.floor((ahora - ultimoPantallazo) / 60_000) }),
      })}
    </div>
  );
}
