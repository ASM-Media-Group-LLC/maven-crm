import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { usePipWindow } from "@/pages/cowork/usePipWindow";
import { useAutoFlotante } from "@/hooks/useAutoFlotante";
import { useReanudarMedia } from "@/hooks/useReanudarMedia";

// Envuelve una llamada para que pueda salir a la ventana flotante del sistema
// —esa que el SO mantiene siempre al frente, sobre cualquier otro programa—
// cuando la persona se va a otra pestaña o aplicación.
//
// Lo usan las pantallas que viven en SU PROPIA PESTAÑA: la videollamada y las
// reuniones de Meet. Cowork no lo usa: allá la llamada además tiene que
// sobrevivir a navegar entre secciones, y eso lo resuelve
// PersistentCallProvider, que es bastante más grande. Acá no hace falta nada de
// eso — la pestaña es solo la llamada.
//
// ── EL DETALLE QUE HACE QUE ESTO FUNCIONE ───────────────────────────────────
//
// La llamada se dibuja SIEMPRE dentro de la misma `caja`, un div creado una
// sola vez, y lo que se mueve es la caja: al abrir la ventana se la cuelga del
// body de la ventana nueva, y al cerrarla vuelve al ancla de la página.
//
// Portalizar directamente a un contenedor distinto REMONTARÍA todo el subárbol,
// y remontar una videollamada significa reconectarla: video en negro, audio
// cortado, unos segundos perdidos. Mover un nodo del DOM a mano no remonta
// nada. Es el mismo truco que usa Cowork, y está acá por el mismo motivo.
//
// ⚠️ DENTRO DE LA VENTANA FLOTANTE, `window` Y `document` SIGUEN SIENDO LOS DE
// LA VENTANA PRINCIPAL. El componente vive en el árbol de React de la página,
// pero sus nodos están en otro documento. Eso ya rompió dos cosas: los menús de
// Radix (se abren donde nadie los ve) y el arrastre del zoom (los listeners de
// `window` nunca se enteraban). Cualquier cosa nueva que use objetos globales
// para posicionar, medir o escuchar teclas hay que mirarla dos veces.

interface Props {
  /** Hay una llamada en curso: sin esto no hay nada que sacar. */
  activa: boolean;
  children: ReactNode;
}

export function LlamadaEnVentanaFlotante({ activa, children }: Props) {
  const { pipWindow, openPip, closePip } = usePipWindow();
  const [ancla, setAncla] = useState<HTMLDivElement | null>(null);

  // Una sola vez, para toda la vida del componente. Si se recreara en cada
  // render, el portal cambiaría de destino y la llamada se reconectaría.
  const [caja] = useState(() => {
    const d = document.createElement("div");
    d.style.width = "100%";
    d.style.height = "100%";
    return d;
  });

  const destino = pipWindow?.document?.body ?? ancla;
  useEffect(() => {
    if (destino && caja.parentNode !== destino) destino.appendChild(caja);
  }, [destino, caja]);

  // Mudar la caja saca sus <video>/<audio> del documento un instante y el
  // navegador los pausa. Sin esto puede quedar negro y mudo tras la mudanza.
  useReanudarMedia(caja, destino, activa);

  useAutoFlotante({ activa, ventana: pipWindow, abrir: openPip, cerrar: closePip });

  return (
    <>
      <div ref={setAncla} className="h-full w-full" />
      {createPortal(children, caja)}
    </>
  );
}
