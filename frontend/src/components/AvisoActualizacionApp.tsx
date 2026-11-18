import { useEffect, useRef, useState } from "react";
import { Download, Loader2, Sparkles } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { escritorio } from "@/lib/escritorio";
import { hayLlamadaActiva } from "@/lib/llamadaActiva";
import { estadoDelAviso, tocaActualizarAlColgar } from "@/lib/avisoActualizacionApp";
import { alCambiarTarjeta } from "@/lib/novedadesApp";

// VERSIÓN NUEVA DE LA APP, SIEMPRE A LA VISTA (Alvaro, 18/11/2026: «que la
// plataforma te lo ponga enfrente con un botón para que se actualice»).
// Solo en la app de computador. Franja fija arriba, sin cerrar, hasta que se
// actualice. En llamada avisa que se corta unos segundos; si no se toca, se
// actualiza sola al colgar. La descarga y la instalación son de desktop/src/actualizar.js.

export function AvisoActualizacionApp() {
  const { t } = useLanguage();
  const [version, setVersion] = useState<string | null>(null);
  const [enLlamada, setEnLlamada] = useState(false);
  const [actualizando, setActualizando] = useState(false);
  const antes = useRef(false);
  // Un aviso a la vez: si está abierta la tarjeta de «qué cambió», la franja espera.
  const [tarjeta, setTarjeta] = useState(false);
  useEffect(() => alCambiarTarjeta(setTarjeta), []);

  useEffect(() => {
    const app = escritorio();
    if (!app?.alActualizacionLista) return;
    void app.actualizacionPendiente?.().then((v) => { if (v) setVersion(v); }).catch(() => {});
    return app.alActualizacionLista((v) => { if (v) setVersion(v); });
  }, []);

  const actualizar = () => {
    setActualizando(true);
    void escritorio()?.actualizarAhora?.().then((ok) => { if (!ok) setActualizando(false); }).catch(() => setActualizando(false));
  };

  // Llamada: se mira cada 3 s (hayLlamadaActiva no avisa cambios).
  useEffect(() => {
    if (!version) return;
    const mirar = () => {
      const ahora = hayLlamadaActiva();
      if (tocaActualizarAlColgar(version, antes.current, ahora)) actualizar();
      antes.current = ahora;
      setEnLlamada(ahora);
    };
    mirar();
    const id = window.setInterval(mirar, 3000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [version]);

  const estado = estadoDelAviso(version, enLlamada);
  if (estado === "nada" || tarjeta) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-16 z-[170] flex justify-center px-4">
    <div
      role="status"
      className="vidrio vidrio-glow sube pointer-events-auto w-full max-w-[520px] rounded-[20px] border border-primary/30 [-webkit-app-region:no-drag]"
    >
      <div className="v-cont flex items-center gap-3 px-4 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/[0.12] text-primary">
          <Sparkles className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
            {t("pwa.app.titulo2")}
            <span className="rounded-full bg-primary/[0.1] px-2 py-0.5 text-[11px] font-medium text-primary tabular-nums">{version}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            {estado === "ofrecerEnLlamada" ? t("pwa.app.nuevaEnLlamada") : t("pwa.app.nuevaDetalle")}
          </p>
        </div>
        <button
          type="button"
          onClick={actualizar}
          disabled={actualizando}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-70"
        >
          {actualizando ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : <Download className="h-3.5 w-3.5" />}
          {actualizando ? t("pwa.app.actualizando") : t("pwa.app.actualizar")}
        </button>
      </div>
    </div>
    </div>
  );
}

export default AvisoActualizacionApp;
