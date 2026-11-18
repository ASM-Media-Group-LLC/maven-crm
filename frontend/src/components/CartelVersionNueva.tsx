import { useEffect, useState } from "react";
import { Download, Loader2, Sparkles } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { hayLlamadaActiva } from "@/lib/llamadaActiva";
import {
  actualizarDesdeElCartel, alCambiarCartelVersionNueva, cartelVersionNuevaAbierto,
} from "@/lib/cartelVersionNueva";

// VERSIÓN NUEVA: CARTEL EN EL CENTRO, SIN CERRAR (Alvaro, 18/11/2026).
// Cada cambio que sube a producción le pone a cada persona este cartel en el
// medio de la pantalla con un solo botón, «Actualizar». No se cierra: la única
// salida es actualizar. En una llamada NO sale (se cortaría): queda un avisito
// arriba y, al colgar, vuelve el cartel.

/** El cartel en sí, también lo usa la versión nueva de la app de computador. */
export function CartelCentral(props: {
  titulo: string;
  detalle: string;
  version?: string | null;
  boton: string;
  ocupado: boolean;
  ocupadoTexto: string;
  onActualizar: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-background/75 px-4 backdrop-blur-md [-webkit-app-region:no-drag]"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="cartel-version-nueva-titulo"
    >
      <div className="vidrio vidrio-glow sube w-full max-w-[420px] rounded-[24px] border border-primary/30">
        <div className="v-cont flex flex-col items-center gap-4 px-6 py-7 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/[0.12] text-primary">
            <Sparkles className="h-7 w-7" />
          </span>
          <div className="space-y-1.5">
            <p id="cartel-version-nueva-titulo" className="flex flex-wrap items-center justify-center gap-2 text-lg font-semibold text-foreground">
              {props.titulo}
              {props.version && (
                <span className="rounded-full bg-primary/[0.1] px-2 py-0.5 text-xs font-medium text-primary tabular-nums">{props.version}</span>
              )}
            </p>
            <p className="text-sm text-muted-foreground">{props.detalle}</p>
          </div>
          <button
            type="button"
            autoFocus
            onClick={props.onActualizar}
            disabled={props.ocupado}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-70"
          >
            {props.ocupado ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Download className="h-4 w-4" />}
            {props.ocupado ? props.ocupadoTexto : props.boton}
          </button>
        </div>
      </div>
    </div>
  );
}

export function CartelVersionNueva() {
  const { t } = useLanguage();
  const [abierto, setAbierto] = useState(cartelVersionNuevaAbierto);
  const [enLlamada, setEnLlamada] = useState(false);
  const [actualizando, setActualizando] = useState(false);

  useEffect(() => alCambiarCartelVersionNueva(setAbierto), []);

  // hayLlamadaActiva no avisa cambios: se mira cada 3 s mientras haya cartel.
  useEffect(() => {
    if (!abierto) return;
    const mirar = () => setEnLlamada(hayLlamadaActiva());
    mirar();
    const id = window.setInterval(mirar, 3000);
    return () => window.clearInterval(id);
  }, [abierto]);

  if (!abierto) return null;

  if (enLlamada) {
    return (
      <div className="pointer-events-none fixed inset-x-0 top-16 z-[170] flex justify-center px-4">
        <div role="status" className="vidrio sube pointer-events-auto rounded-full border border-primary/30 px-4 py-2 text-xs text-foreground">
          {t("pwa.actualizar.enLlamada")}
        </div>
      </div>
    );
  }

  return (
    <CartelCentral
      titulo={t("pwa.actualizar.titulo")}
      detalle={t("pwa.actualizar.detalle")}
      boton={t("pwa.app.actualizar")}
      ocupado={actualizando}
      ocupadoTexto={t("pwa.app.actualizando")}
      onActualizar={() => {
        setActualizando(true);
        void actualizarDesdeElCartel().then((ok) => { if (!ok) setActualizando(false); });
      }}
    />
  );
}

export default CartelVersionNueva;
