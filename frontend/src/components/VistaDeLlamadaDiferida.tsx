import { useEffect, useState, type ComponentProps } from "react";
import type LiveKitCallView from "@/pages/messenger/videocall/LiveKitCallView";
import { cargarVistaDeLlamada } from "@/lib/cargarVistaDeLlamada";
import { marcarConexionEnCurso } from "@/lib/llamadaActiva";
import { useLanguageSiHay } from "@/hooks/useLanguage";
import { traducir } from "@/lib/i18n";

type Props = ComponentProps<typeof LiveKitCallView>;

/** Cargar el motor de llamadas no puede recargar Maven ante un corte de red.
 *  Una vez cargado, la vista mantiene su identidad al moverse a la miniatura. */
export default function VistaDeLlamadaDiferida(props: Props) {
  const idioma = useLanguageSiHay();
  const t = idioma?.t ?? traducir;
  const [Vista, setVista] = useState<typeof LiveKitCallView | null>(null);
  const [fallo, setFallo] = useState(false);
  const [intento, setIntento] = useState(0);

  useEffect(() => {
    if (Vista) return;
    let vigente = true;
    // main.tsx ya protege los intentos de conexión frente a preloadError.
    // Preparar la vista es parte de entrar, aunque aún no haya socket ni medios.
    const soltar = marcarConexionEnCurso(props.roomName);
    setFallo(false);
    void cargarVistaDeLlamada().then((modulo) => {
      // Vite puede resolver undefined al prevenir preloadError. También se
      // trata como carga fallida, sin dejar que React desmonte la aplicación.
      if (!modulo?.default) throw new Error("call-view-unavailable");
      if (vigente) setVista(() => modulo.default);
    }).catch(() => { if (vigente) setFallo(true); }).finally(soltar);
    return () => { vigente = false; soltar(); };
  }, [Vista, props.roomName, intento]);

  if (Vista) return <Vista {...props} />;
  if (!fallo) return <div role="status" className="flex h-full items-center justify-center text-sm text-muted-foreground">{t("shared.coworkTime.loading")}</div>;
  return (
    <div role="alert" className="flex h-full flex-col items-center justify-center gap-3 p-4 text-center text-sm">
      <p>{t("messenger.callView.cargaFallo")}</p>
      <button type="button" className="rounded-md border px-4 py-2 hover:bg-muted" onClick={() => setIntento((n) => n + 1)}>
        {t("messenger.callView.reintentarCarga")}
      </button>
    </div>
  );
}
