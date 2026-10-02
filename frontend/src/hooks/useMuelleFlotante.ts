import { useCallback, useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from "react";

/**
 * Posición del MUELLE flotante de la esquina inferior derecha (la columna con
 * el botón de Mensajes y el de Clari), y su arrastre.
 *
 * Arranca SIEMPRE en la esquina, como en Facebook: quien no lo mueva nunca lo
 * va a ver siempre en el mismo lugar. Pero se puede arrastrar, y esa no es una
 * concesión estética — es la razón por la que el botón de Clari ya era movible:
 * tapaba la paginación de algunas tablas. Una ventana de chat (~330×450) tapa
 * mucho más que un botón de 56px, así que el problema empeora, no desaparece.
 *
 * La lógica salió tal cual de ClariAiFab, que ahora la consume desde acá.
 */
export const FAB_SIZE = 56; // h-14 w-14
export const MARGIN = 8; // margen mínimo al borde de la ventana
/** Ancla dentro de la pila del muelle (arriba de la nubecita del Messenger)
 *  donde otras pantallas pueden colgar un botón por portal. Hoy lo usa el
 *  Supervisor Hub de Cowork cuando está minimizado: así el «Hub» queda
 *  siempre en el mismo lugar y sigue al muelle si lo arrastran. */
export const MUELLE_EXTRA_ID = "muelle-flotante-extra";
const DEFAULT_GAP = 24; // bottom-6 right-6
const DRAG_THRESHOLD = 5; // px de movimiento para considerar "arrastre" (vs click)

const POS_KEY = "muelle.pos";
/** Clave vieja: los admin ya tenían el botón de Clari parkeado en algún lado y
 *  no queremos moverlo de lugar de un día para el otro. */
const POS_KEY_LEGACY = "clari.fab.pos";

export interface Pos { x: number; y: number }

const posPorDefecto = (): Pos => ({
  x: window.innerWidth - FAB_SIZE - DEFAULT_GAP,
  y: window.innerHeight - FAB_SIZE - DEFAULT_GAP,
});

export const clampToViewport = (p: Pos): Pos => {
  const maxX = window.innerWidth - FAB_SIZE - MARGIN;
  const maxY = window.innerHeight - FAB_SIZE - MARGIN;
  return {
    x: Math.max(MARGIN, Math.min(p.x, Math.max(MARGIN, maxX))),
    y: Math.max(MARGIN, Math.min(p.y, Math.max(MARGIN, maxY))),
  };
};

const leerGuardada = (): Pos | null => {
  for (const key of [POS_KEY, POS_KEY_LEGACY]) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const p = JSON.parse(raw);
      if (typeof p?.x === "number" && typeof p?.y === "number") return p;
    } catch {
      /* localStorage puede fallar */
    }
  }
  return null;
};

export function useMuelleFlotante() {
  const [pos, setPos] = useState<Pos>(() => {
    if (typeof window === "undefined") return { x: 0, y: 0 };
    const guardada = leerGuardada();
    return clampToViewport(guardada ?? posPorDefecto());
  });

  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number; moved: boolean } | null>(null);
  // Un arrastre que termina encima de un botón NO tiene que dispararlo.
  const tragarClickRef = useRef(false);

  // El alto vive en estado: el anclaje se calcula desde ABAJO, así que si la
  // ventana cambia de alto sin que `pos` se re-clampe, el muelle quedaba pegado
  // a una altura que ya no existe.
  const [altoVentana, setAltoVentana] = useState(() =>
    typeof window === "undefined" ? 0 : window.innerHeight);

  // Si la ventana se achica, que el muelle no quede fuera de pantalla.
  useEffect(() => {
    const onResize = () => {
      setAltoVentana(window.innerHeight);
      setPos((p) => clampToViewport(p));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Arrastre con escuchas en WINDOW, no con setPointerCapture.
  // Con pointer capture en el contenedor, el `click` se dispara en el
  // CONTENEDOR y no en el botón que tocaste: Clari y Mensajes dejarían de
  // responder. (El ClariAiFab original podía capturar porque el capturador era
  // el propio botón y sintetizaba el click a mano en pointerup; acá hay varios
  // botones dentro de la misma columna.)
  const onPointerDown = useCallback((e: ReactPointerEvent<HTMLElement>) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y, moved: false };

    const mover = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      // Sin botón apretado, el arrastre YA terminó y no nos enteramos: se soltó
      // encima de un iframe (el cuerpo de un correo se lee en uno) o fuera de
      // la ventana, y el pointerup se lo quedó otro. Sin esto el muelle
      // «perseguía el cursor» en el Correo (Keila, 02/10).
      if (ev.buttons === 0) { soltar(); return; }
      const dx = ev.clientX - d.startX;
      const dy = ev.clientY - d.startY;
      if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!d.moved) {
        // Recién acá (pasado el umbral) bloqueamos la selección de texto: al
        // arrastrar por encima del dashboard iba pintando de azul media
        // pantalla. No se hace en pointerdown para no romper el clic normal.
        d.moved = true;
        document.body.style.userSelect = "none";
        window.getSelection()?.removeAllRanges();
      }
      ev.preventDefault();
      setPos(clampToViewport({ x: d.origX + dx, y: d.origY + dy }));
    };

    const soltar = () => {
      const d = dragRef.current;
      dragRef.current = null;
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
      window.removeEventListener("blur", soltar);
      if (!d?.moved) return;
      // El click que viene después de soltar NO tiene que abrir nada.
      tragarClickRef.current = true;
      setPos((p) => {
        try { localStorage.setItem(POS_KEY, JSON.stringify(p)); } catch { /* noop */ }
        return p;
      });
    };

    window.addEventListener("pointermove", mover, { passive: false });
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
    // Soltar dentro de un iframe (o pasar a otra ventana) se lleva el foco.
    window.addEventListener("blur", soltar);
  }, [pos.x, pos.y]);

  const onClickCapture = useCallback((e: ReactMouseEvent) => {
    if (!tragarClickRef.current) return;
    tragarClickRef.current = false;
    e.preventDefault();
    e.stopPropagation();
  }, []);

  /**
   * Dónde dibujar un panel anclado al muelle: arriba si entra, si no abajo; y
   * hacia la izquierda o la derecha según de qué lado esté parkeado, para que
   * nunca se salga de la pantalla.
   */
  const anclarPanel = useCallback((ancho: number, alto: number): CSSProperties => {
    const altoReal = Math.min(alto, window.innerHeight - 2 * MARGIN);
    let top = pos.y - altoReal - MARGIN; // preferimos arriba del muelle
    if (top < MARGIN) top = pos.y + FAB_SIZE + MARGIN; // si no entra, abajo
    top = Math.max(MARGIN, Math.min(top, window.innerHeight - altoReal - MARGIN));
    // Alineado por el borde derecho del muelle; si eso lo saca por la izquierda,
    // se abre hacia la derecha.
    let left = pos.x + FAB_SIZE - ancho;
    left = Math.max(MARGIN, Math.min(left, window.innerWidth - ancho - MARGIN));
    return { left, top, height: altoReal };
  }, [pos.x, pos.y]);

  return {
    pos,
    /** Estilo del contenedor: la columna crece HACIA ARRIBA desde el anclaje. */
    estiloContenedor: {
      left: pos.x,
      bottom: altoVentana - pos.y - FAB_SIZE,
    } as CSSProperties,
    arrastreProps: { onPointerDown, onClickCapture },
    anclarPanel,
  };
}
