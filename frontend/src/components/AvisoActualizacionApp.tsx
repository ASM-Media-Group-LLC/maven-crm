import { useEffect, useRef, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { escritorio } from "@/lib/escritorio";
import { hayLlamadaActiva } from "@/lib/llamadaActiva";
import { estadoDelAviso, tocaActualizarAlColgar } from "@/lib/avisoActualizacionApp";

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
  if (estado === "nada") return null;
  return (
    <div
      role="status"
      className="vidrio fixed left-1/2 top-12 z-[170] flex w-[min(560px,calc(100vw-32px))] -translate-x-1/2 flex-wrap items-center gap-3 rounded-2xl border border-primary/40 px-4 py-2.5 shadow-2xl [-webkit-app-region:no-drag]"
    >
      <Download className="h-4 w-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{t("pwa.app.nueva", { v: version ?? "" })}</p>
        {estado === "ofrecerEnLlamada" && <p className="text-xs text-muted-foreground">{t("pwa.app.nuevaEnLlamada")}</p>}
      </div>
      <button
        type="button"
        onClick={actualizar}
        disabled={actualizando}
        className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-1.5 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-70"
      >
        {actualizando ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : null}
        {actualizando ? t("pwa.app.actualizando") : t("pwa.app.actualizar")}
      </button>
    </div>
  );
}

export default AvisoActualizacionApp;
