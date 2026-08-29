import { useCallback, useEffect, useRef, useState } from "react";

// Zoom sobre una pantalla compartida, como en Google Meet: cuando alguien
// comparte su pantalla en 1080p y vos la ves en un recuadro, el texto no se lee.
//
// Es zoom de PRESENTACIÓN, no de captura: se agranda con CSS lo que ya está
// llegando. No pide más calidad al que comparte ni consume más red. Si la fuente
// es de baja resolución, ampliar la va a ver pixelada — igual que en Meet.
//
// Controles: rueda para acercar, arrastrar para moverse, doble clic para volver.

const MIN = 1;
const MAX = 4;
const STEP = 0.25;

export interface VideoZoom {
  scale: number;
  /** Estilo para el <video>: escala y desplazamiento actuales. */
  style: React.CSSProperties;
  /** Handlers para el CONTENEDOR del video. */
  handlers: {
    onWheel: (e: React.WheelEvent) => void;
    onPointerDown: (e: React.PointerEvent) => void;
    onDoubleClick: () => void;
  };
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  isZoomed: boolean;
}

export function useVideoZoom(enabled: boolean): VideoZoom {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // Al dejar de ser ampliable (dejaron de compartir), volvemos a 1: si no, al
  // reaparecer el video quedaría movido y ampliado sin que nadie lo pidiera.
  useEffect(() => {
    if (!enabled) { setScale(1); setOffset({ x: 0, y: 0 }); }
  }, [enabled]);

  // Con la imagen al 100% no hay a dónde desplazarse; el margen crece con el
  // zoom, así que el arrastre nunca deja ver "fuera" del video.
  const clamp = useCallback((next: { x: number; y: number }, s: number) => {
    const limite = ((s - 1) / 2) * 100;
    return {
      x: Math.max(-limite, Math.min(limite, next.x)),
      y: Math.max(-limite, Math.min(limite, next.y)),
    };
  }, []);

  const aplicarEscala = useCallback((nueva: number) => {
    const s = Math.max(MIN, Math.min(MAX, Number(nueva.toFixed(2))));
    setScale(s);
    setOffset((o) => (s === 1 ? { x: 0, y: 0 } : clamp(o, s)));
  }, [clamp]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!enabled) return;
    e.preventDefault();
    aplicarEscala(scale + (e.deltaY < 0 ? STEP : -STEP));
  }, [enabled, scale, aplicarEscala]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (!enabled || scale === 1) return;
    // El elemento se guarda AHORA, en una variable. React pone currentTarget en
    // null apenas termina de despachar el evento, asi que leerlo desde el
    // listener de pointermove —que corre despues— tiraba y el arrastre no movia
    // nada: el zoom funcionaba y la manito no.
    const contenedor = e.currentTarget as HTMLElement;
    contenedor.setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };

    const mover = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const rect = contenedor.getBoundingClientRect();
      // El desplazamiento se guarda en % del contenedor para que el encuadre no
      // se descoloque cuando la ventana cambia de tamaño (o pasa a flotante).
      const dx = ((ev.clientX - d.x) / Math.max(1, rect.width)) * 100;
      const dy = ((ev.clientY - d.y) / Math.max(1, rect.height)) * 100;
      setOffset(clamp({ x: d.ox + dx, y: d.oy + dy }, scale));
    };
    // LA VENTANA DEL ELEMENTO, NO LA GLOBAL. Esto no es puntillosidad:
    //
    // Cuando la llamada se dibuja en la ventana flotante del sistema, el
    // componente sigue viviendo en el arbol de React de la ventana PRINCIPAL,
    // pero sus nodos estan en OTRO documento. El `window` global sigue siendo
    // el de la principal, asi que los movimientos del mouse dentro de la
    // flotante nunca llegaban a estos listeners: el zoom andaba —es un clic en
    // un boton— y la manito no movia nada.
    const vista = contenedor.ownerDocument.defaultView ?? window;
    const soltar = () => {
      dragRef.current = null;
      vista.removeEventListener("pointermove", mover);
      vista.removeEventListener("pointerup", soltar);
    };
    vista.addEventListener("pointermove", mover);
    vista.addEventListener("pointerup", soltar);
  }, [enabled, scale, offset, clamp]);

  const reset = useCallback(() => { setScale(1); setOffset({ x: 0, y: 0 }); }, []);

  // Sin zoom no se aplica NINGÚN transform: un `scale(1)` obliga al navegador a
  // componer la capa igual, y esto corre sobre cada pantalla compartida de cada
  // llamada. Además así el video queda con el estilo limpio que espera el resto.
  const sinTocar = scale === 1 && offset.x === 0 && offset.y === 0;

  return {
    scale,
    style: sinTocar
      ? {}
      : {
          transform: `scale(${scale}) translate(${offset.x}%, ${offset.y}%)`,
          transformOrigin: "center center",
          transition: dragRef.current ? "none" : "transform 120ms ease-out",
          cursor: "grab",
        },
    handlers: { onWheel, onPointerDown, onDoubleClick: reset },
    zoomIn: () => aplicarEscala(scale + STEP),
    zoomOut: () => aplicarEscala(scale - STEP),
    reset,
    isZoomed: scale > 1,
  };
}
