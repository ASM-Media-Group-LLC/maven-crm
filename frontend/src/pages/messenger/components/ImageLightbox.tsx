import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Download, ZoomIn, ZoomOut, RotateCw, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { descargarArchivo } from "../downloadFile";
import { useLanguage } from "@/hooks/useLanguage";
import type { MediaDelChat } from "../galeriaDelChat";

interface MediaLightboxProps {
  src: string;
  alt?: string;
  isOpen: boolean;
  onClose: () => void;
  type?: "image" | "video";
  /** Todas las fotos y videos del chat, en orden. Con esto aparecen las
   *  flechas ← → para pasar de una a otra sin cerrar el visor (Jhon, 28/09).
   *  Vacía o sin la foto abierta adentro = visor de una sola, como antes. */
  galeria?: MediaDelChat[];
}

export default function ImageLightbox({ src, alt, isOpen, onClose, type = "image", galeria = [] }: MediaLightboxProps) {
  const { t } = useLanguage();
  // Lo que se está MIRANDO. Arranca en la que se tocó y cambia con las
  // flechas; al cerrar y volver a abrir, vuelve a la que se tocó.
  const [actual, setActual] = useState<{ src: string; type: "image" | "video"; alt?: string }>({ src, type, alt });
  useEffect(() => {
    if (isOpen) setActual({ src, type, alt });
  }, [isOpen, src, type, alt]);
  const indice = galeria.findIndex((g) => g.src === actual.src);
  const hayGaleria = indice >= 0 && galeria.length > 1;
  const anterior = hayGaleria && indice > 0 ? galeria[indice - 1] : null;
  const siguiente = hayGaleria && indice < galeria.length - 1 ? galeria[indice + 1] : null;
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

  /** Pasar a la anterior (-1) o a la siguiente (+1). No da la vuelta: en la
   *  última, → no hace nada (como WhatsApp); la flecha ni se dibuja. Cada foto
   *  arranca sin zoom ni giro: el zoom de una no tiene sentido en la otra. */
  const ir = useCallback((paso: -1 | 1) => {
    const destino = paso < 0 ? anterior : siguiente;
    if (!destino) return;
    setActual({ src: destino.src, type: destino.tipo, alt: destino.nombre ?? undefined });
    setScale(1); setRotation(0); setPosition({ x: 0, y: 0 });
  }, [anterior, siguiente]);
  // Para los gestos táctiles, que se registran UNA vez y leen de acá.
  const irRef = useRef(ir);
  irRef.current = ir;

  // La de al lado se baja antes de que la pidan: al tocar → ya está.
  useEffect(() => {
    if (!isOpen) return;
    for (const g of [anterior, siguiente]) {
      if (g?.tipo === "image") { const img = new Image(); img.src = g.src; }
    }
  }, [isOpen, anterior, siguiente]);

  useEffect(() => {
    if (!isOpen) { setScale(1); setRotation(0); setPosition({ x: 0, y: 0 }); }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") ir(-1);
      if (e.key === "ArrowRight") ir(1);
      if (e.key === "+" || e.key === "=") setScale(s => Math.min(s + 0.25, 5));
      if (e.key === "-") setScale(s => Math.max(s - 0.25, 0.25));
      if (e.key === "0") { setScale(1); setPosition({ x: 0, y: 0 }); setRotation(0); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isOpen, onClose, ir]);

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
    const gesture = { mode: "none" as "none" | "pan" | "pinch" | "swipe", startDist: 0, startScale: 1, startX: 0, startY: 0, startPosX: 0, startPosY: 0, lastTap: 0 };
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
          // Sin zoom, arrastrar de costado pasa de foto (como en el celular).
          gesture.mode = "swipe";
          gesture.startX = e.touches[0].clientX;
          gesture.startY = e.touches[0].clientY;
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
      if (gesture.mode === "swipe" && e.changedTouches.length) {
        const dx = e.changedTouches[0].clientX - gesture.startX;
        const dy = e.changedTouches[0].clientY - gesture.startY;
        // Tiene que ser un gesto de COSTADO y largo: un toque o un scroll
        // vertical no pueden cambiar de foto.
        if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) irRef.current(dx < 0 ? 1 : -1);
      }
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
    void descargarArchivo(actual.src, actual.alt || (actual.type === "video" ? "video.mp4" : t("messenger.bubble.imagen")));
  }, [actual, t]);

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

  // Por PORTAL a document.body, no inline. Desde la ventanita flotante (glass-panel)
  // el visor salía preso en la columna de la ventana y la página se dibujaba
  // ENCIMA de la imagen (Jhon, 14/09): backdrop-filter crea bloque contenedor para
  // los descendientes `fixed` —el inset-0 pasa a ser la caja de la ventana— y el
  // overflow-hidden remata. El z-[100] no servía de nada dentro de ese contexto.
  return createPortal(
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
        <Button variant="ghost" size="icon" className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10" onClick={() => setScale(s => Math.min(s + 0.25, 5))} title={t("lightbox.zoomIn")} aria-label={t("lightbox.zoomIn")}>
          <ZoomIn className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10" onClick={() => setScale(s => Math.max(s - 0.25, 0.25))} title={t("lightbox.zoomOut")} aria-label={t("lightbox.zoomOut")}>
          <ZoomOut className="h-5 w-5" />
        </Button>
        {actual.type === "image" && (
          <Button variant="ghost" size="icon" className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10" onClick={() => setRotation(r => r + 90)} title={t("messenger.lightbox.rotar")} aria-label={t("messenger.lightbox.rotar")}>
            <RotateCw className="h-5 w-5" />
          </Button>
        )}
        {/* Descargar aplica a TODO: imagen y video (antes el video no tenía botón). */}
        <Button variant="ghost" size="icon" className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10" onClick={handleDownload} title={t("common.download")} aria-label={t("common.download")}>
          <Download className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-9 w-9 text-white/80 hover:text-white hover:bg-white/10" onClick={onClose} title={t("lightbox.close")} aria-label={t("lightbox.close")}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* Hint */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/40 text-xs select-none pointer-events-none text-center px-4">
        <span className="[@media(hover:hover)]:inline hidden">
          {hayGaleria && `${t("messenger.lightbox.ayudaFlechas")} · `}{t("messenger.lightbox.ayudaMouse")}
        </span>
        <span className="[@media(hover:hover)]:hidden inline">
          {hayGaleria && `${t("messenger.lightbox.ayudaDeslizar")} · `}{t("messenger.lightbox.ayudaTactil")}
        </span>
      </div>

      {/* Cuál de cuántas, como el «3 / 12» de WhatsApp. */}
      {hayGaleria && (
        <div className="absolute left-4 top-5 z-10 select-none text-sm text-white/70" aria-live="polite">
          {t("messenger.lightbox.posicion", { n: indice + 1, total: galeria.length })}
        </div>
      )}
      {anterior && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); ir(-1); }}
          aria-label={t("messenger.lightbox.anterior")}
          title={t("messenger.lightbox.anterior")}
          className="absolute left-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white/90 transition-colors hover:bg-white/20 sm:left-4"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {siguiente && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); ir(1); }}
          aria-label={t("messenger.lightbox.siguiente")}
          title={t("messenger.lightbox.siguiente")}
          className="absolute right-2 top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white/90 transition-colors hover:bg-white/20 sm:right-4"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      {/* Media */}
      {actual.type === "video" ? (
        <video
          key={actual.src}
          src={actual.src}
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
          key={actual.src}
          src={actual.src}
          alt={actual.alt || ""}
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
    </div>,
    document.body,
  );
}
