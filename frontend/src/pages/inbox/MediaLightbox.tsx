// Visor de medios (lightbox) estilo WhatsApp para la bandeja: foto/video a
// pantalla completa, con zoom (rueda del mouse, botones y doble-clic),
// arrastrar para desplazar cuando hay zoom, y navegación ← → entre TODOS
// los medios del hilo. Esc cierra; clic en el fondo cierra.
import {
  useState, useEffect, useRef, useCallback,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { X, ZoomIn, ZoomOut, RotateCcw, ChevronLeft, ChevronRight, Download } from "lucide-react";

export interface LightboxItem {
  id?: string;
  url: string;
  type: "image" | "video";
}

const MIN = 1;
const MAX = 6;
const STEP = 0.5;

export function MediaLightbox({
  items,
  index,
  onClose,
}: {
  items: LightboxItem[];
  index: number;
  onClose: () => void;
}) {
  const [i, setI] = useState(index);
  const [scale, setScale] = useState(1);
  const [tx, setTx] = useState(0);
  const [ty, setTy] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const areaRef = useRef<HTMLDivElement>(null);

  const cur = items[i];
  const isImage = cur?.type === "image";

  // El listener de rueda se monta una sola vez; este ref le dice si el
  // medio actual admite zoom (solo imágenes).
  const allowZoomRef = useRef(isImage);
  allowZoomRef.current = isImage;

  const reset = useCallback(() => { setScale(1); setTx(0); setTy(0); }, []);

  // Al cambiar de medio, resetear zoom/posición.
  useEffect(() => { reset(); }, [i, reset]);
  // Sincronizar con el índice externo (al reabrir en otra foto).
  useEffect(() => { setI(index); }, [index]);
  // Recentrar cuando el zoom vuelve a 1x.
  useEffect(() => { if (scale === 1) { setTx(0); setTy(0); } }, [scale]);
  // Bloquear el scroll del fondo mientras el visor está abierto.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  const go = useCallback((d: number) => {
    setI((p) => {
      const n = p + d;
      return n < 0 || n >= items.length ? p : n;
    });
  }, [items.length]);

  const zoomBy = useCallback((d: number) => {
    setScale((s) => Math.min(MAX, Math.max(MIN, +(s + d).toFixed(2))));
  }, []);

  // Teclado: Esc cierra, flechas navegan, +/- zoom.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "+" || e.key === "=") zoomBy(STEP);
      else if (e.key === "-" || e.key === "_") zoomBy(-STEP);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, go, zoomBy]);

  // Rueda = zoom (solo imágenes). Listener nativo NO pasivo para poder
  // preventDefault y que no scrollee el fondo.
  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (!allowZoomRef.current) return;
      e.preventDefault();
      zoomBy(e.deltaY < 0 ? STEP : -STEP);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomBy]);

  const onDoubleClick = () => {
    if (!isImage) return;
    if (scale > 1) reset();
    else setScale(2.5);
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLImageElement>) => {
    if (scale <= 1) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, tx, ty };
    setDragging(true);
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLImageElement>) => {
    if (!dragRef.current) return;
    setTx(dragRef.current.tx + (e.clientX - dragRef.current.x));
    setTy(dragRef.current.ty + (e.clientY - dragRef.current.y));
  };
  const onPointerUp = () => { dragRef.current = null; setDragging(false); };

  if (!cur) return null;

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-black/90 backdrop-blur-sm">
      {/* Barra superior */}
      <div className="flex items-center justify-between gap-2 px-4 py-3 text-white">
        <span className="min-w-[3rem] text-sm tabular-nums opacity-80">
          {items.length > 1 ? `${i + 1} / ${items.length}` : ""}
        </span>
        <div className="flex items-center gap-0.5">
          {isImage && (
            <>
              <button type="button" onClick={() => zoomBy(-STEP)} title="Alejar (−)" className="rounded-full p-2 hover:bg-white/15">
                <ZoomOut className="h-5 w-5" />
              </button>
              <span className="w-12 text-center text-xs tabular-nums opacity-80">{Math.round(scale * 100)}%</span>
              <button type="button" onClick={() => zoomBy(STEP)} title="Acercar (+)" className="rounded-full p-2 hover:bg-white/15">
                <ZoomIn className="h-5 w-5" />
              </button>
              <button type="button" onClick={reset} title="Restablecer (doble-clic)" className="rounded-full p-2 hover:bg-white/15">
                <RotateCcw className="h-5 w-5" />
              </button>
            </>
          )}
          <a href={cur.url} target="_blank" rel="noreferrer" download title="Descargar / abrir" className="rounded-full p-2 hover:bg-white/15">
            <Download className="h-5 w-5" />
          </a>
          <button type="button" onClick={onClose} title="Cerrar (Esc)" className="rounded-full p-2 hover:bg-white/15">
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Área del medio */}
      <div
        ref={areaRef}
        className="relative flex flex-1 items-center justify-center overflow-hidden p-2"
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      >
        {items.length > 1 && (
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={i === 0}
            title="Anterior (←)"
            className="absolute left-2 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronLeft className="h-7 w-7" />
          </button>
        )}

        {isImage ? (
          <img
            src={cur.url}
            alt=""
            draggable={false}
            onDoubleClick={onDoubleClick}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{
              transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
              cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in",
              transition: dragging ? "none" : "transform 0.12s ease-out",
              touchAction: "none",
            }}
            className="max-h-[88vh] max-w-[92vw] select-none object-contain"
          />
        ) : (
          <video src={cur.url} controls autoPlay className="max-h-[88vh] max-w-[92vw] rounded-lg" />
        )}

        {items.length > 1 && (
          <button
            type="button"
            onClick={() => go(1)}
            disabled={i === items.length - 1}
            title="Siguiente (→)"
            className="absolute right-2 z-10 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRight className="h-7 w-7" />
          </button>
        )}
      </div>
    </div>
  );
}
