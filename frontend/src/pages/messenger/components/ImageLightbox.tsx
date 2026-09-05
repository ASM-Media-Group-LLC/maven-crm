import { useState, useEffect, useCallback, useRef } from "react";
import { X, Download, ZoomIn, ZoomOut, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { descargarArchivo } from "../downloadFile";

interface MediaLightboxProps {
  src: string;
  alt?: string;
  isOpen: boolean;
  onClose: () => void;
  type?: "image" | "video";
}

export default function ImageLightbox({ src, alt, isOpen, onClose, type = "image" }: MediaLightboxProps) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [gesturing, setGesturing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Refs con el valor vigente para leerlos desde listeners táctiles nativos sin re-suscribir.
  const containerRef = useRef<HTMLDivElement>(null);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;
  const positionRef = useRef(position);
  positionRef.current = position;

  useEffect(() => {
    if (!isOpen) { setScale(1); setRotation(0); setPosition({ x: 0, y: 0 }); }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "+" || e.key === "=") setScale(s => Math.min(s + 0.25, 5));
      if (e.key === "-") setScale(s => Math.max(s - 0.25, 0.25));
      if (e.key === "0") { setScale(1); setPosition({ x: 0, y: 0 }); setRotation(0); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  // Mouse wheel zoom
  useEffect(() => {
    if (!isOpen) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      setScale(s => Math.min(Math.max(s + delta, 0.25), 5));
    };
    window.addEventListener("wheel", onWheel, { passive: false });
    return () => window.removeEventListener("wheel", onWheel);
  }, [isOpen]);

  // Gestos táctiles (móvil): pellizcar para zoom, arrastrar con un dedo cuando hay zoom,
  // doble tap para acercar/alejar. Listeners NATIVOS con passive:false para poder
  // preventDefault (React los registra como passivos y el preventDefault no aplicaría).
  useEffect(() => {
    if (!isOpen) return;
    const el = containerRef.current;
    if (!el) return;
    const gesture = { mode: "none" as "none" | "pan" | "pinch", startDist: 0, startScale: 1, startX: 0, startY: 0, startPosX: 0, startPosY: 0, lastTap: 0 };
    const dist = (t: TouchList) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);

    const onStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        gesture.mode = "pinch";
        gesture.startDist = dist(e.touches);
        gesture.startScale = scaleRef.current;
        setGesturing(true);
      } else if (e.touches.length === 1) {
        const now = Date.now();
        if (now - gesture.lastTap < 300) {
          // doble tap → alternar zoom
          if (scaleRef.current === 1) setScale(2.5);
          else { setScale(1); setPosition({ x: 0, y: 0 }); }
          gesture.lastTap = 0;
          gesture.mode = "none";
          return;
        }
        gesture.lastTap = now;
        if (scaleRef.current > 1) {
          gesture.mode = "pan";
          gesture.startX = e.touches[0].clientX;
          gesture.startY = e.touches[0].clientY;
          gesture.startPosX = positionRef.current.x;
          gesture.startPosY = positionRef.current.y;
          setGesturing(true);
        } else {
          gesture.mode = "none";
        }
      }
    };
    const onMove = (e: TouchEvent) => {
      if (gesture.mode === "pinch" && e.touches.length === 2) {
        e.preventDefault();
        const ratio = dist(e.touches) / (gesture.startDist || 1);
        setScale(Math.min(Math.max(gesture.startScale * ratio, 0.5), 5));
      } else if (gesture.mode === "pan" && e.touches.length === 1) {
        e.preventDefault();
        setPosition({
          x: gesture.startPosX + (e.touches[0].clientX - gesture.startX),
          y: gesture.startPosY + (e.touches[0].clientY - gesture.startY),
        });
      }
    };
    const onEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) gesture.mode = "none";
      if (e.touches.length === 0) {
        if (scaleRef.current <= 1) setPosition({ x: 0, y: 0 });
        setGesturing(false);
      }
    };

    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: false });
    el.addEventListener("touchcancel", onEnd, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [isOpen]);

  // fetch→blob: `<a download>` directo sobre la URL del bucket es cross-origin
  // y el navegador lo ignoraba (guardaba "la página", no el archivo).
  const handleDownload = useCallback(() => {
    void descargarArchivo(src, alt || (type === "video" ? "video.mp4" : "imagen"));
  }, [src, alt, type]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    e.preventDefault();
    setDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };

  const handleMouseUp = () => setDragging(false);

  const handleDoubleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (scale === 1) {
      setScale(2.5);
    } else {
      setScale(1);
      setPosition({ x: 0, y: 0 });
    }
  };

  if (!isOpen) return null;

  const mediaTransition = gesturing ? "" : "transition-transform duration-200";

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center animate-fade-in touch-none"
      onClick={onClose}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Toolbar */}
      <div className="absolute top-4 right-4 flex items-center gap-1 z-10" onClick={e => e.stopPropagation()}>
        <span className="text-white/50 text-xs mr-2">{Math.round(scale * 100)}%</span>
        <Button variant="ghost" size="icon" className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10" onClick={() => setScale(s => Math.min(s + 0.25, 5))}>
          <ZoomIn className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10" onClick={() => setScale(s => Math.max(s - 0.25, 0.25))}>
          <ZoomOut className="h-5 w-5" />
        </Button>
        {type === "image" && (
          <Button variant="ghost" size="icon" className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10" onClick={() => setRotation(r => r + 90)}>
            <RotateCw className="h-5 w-5" />
          </Button>
        )}
        {/* Descargar aplica a TODO: imagen y video (antes el video no tenía botón). */}
        <Button variant="ghost" size="icon" className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10" onClick={handleDownload} title="Descargar">
          <Download className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/40 text-xs select-none pointer-events-none text-center px-4">
        <span className="[@media(hover:hover)]:inline hidden">Doble clic para zoom · Scroll para ajustar · Arrastra para mover</span>
        <span className="[@media(hover:hover)]:hidden inline">Pellizca para zoom · Doble toque para acercar · Arrastra para mover</span>
      </div>

      {/* Media */}
      {type === "video" ? (
        <video
          src={src}
          controls
          autoPlay
          controlsList="nodownload noremoteplayback"
          disablePictureInPicture
          onContextMenu={(e) => e.preventDefault()}
          className={`max-w-[90vw] max-h-[90vh] rounded-lg select-none ${mediaTransition}`}
          style={{
            transform: `scale(${scale}) translate(${position.x / scale}px, ${position.y / scale}px)`,
            cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "default",
          }}
          onClick={e => e.stopPropagation()}
          draggable={false}
        />
      ) : (
        <img
          src={src}
          alt={alt || ""}
          decoding="async"
          className={`max-w-[90vw] max-h-[90vh] object-contain select-none ${mediaTransition}`}
          style={{
            transform: `scale(${scale}) rotate(${rotation}deg) translate(${position.x / scale}px, ${position.y / scale}px)`,
            cursor: scale > 1 ? (dragging ? "grabbing" : "grab") : "zoom-in",
          }}
          onClick={e => e.stopPropagation()}
          onDoubleClick={handleDoubleClick}
          onMouseDown={handleMouseDown}
          draggable={false}
        />
      )}
    </div>
  );
}
