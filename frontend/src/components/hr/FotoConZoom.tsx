import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ZoomIn, ZoomOut, Maximize2, ExternalLink } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";

// Una foto que se puede acercar (Alvaro, 12/11: «quiero ver súper claro y en el
// teléfono y en todos lados que se pueda hacer zoom»).
//  - Tocar / clic: acerca 2.5× donde tocaste; otra vez, vuelve.
//  - Pellizcar (celular) o rueda / pellizco del trackpad (computadora): zoom fino.
//  - Acercada: se arrastra con un dedo o el mouse.
//  - Botones +, − y volver; y abrir la foto original en otra pestaña.
// Mientras está acercada avisa (`onZoom`) para esconder lo que tapa (la cámara).

const MAX = 5;
const PASO = 2.5;

type Vista = { s: number; x: number; y: number };

export function FotoConZoom({ src, alt = "", onZoom, children }: {
  src: string;
  alt?: string;
  onZoom?: (acercada: boolean) => void;
  children?: ReactNode;
}) {
  const { t } = useLanguage();
  const caja = useRef<HTMLDivElement>(null);
  const [v, setV] = useState<Vista>({ s: 1, x: 0, y: 0 });
  const [animar, setAnimar] = useState(false);
  const vRef = useRef(v);
  vRef.current = v;

  const acotar = useCallback((n: Vista): Vista => {
    const el = caja.current;
    if (!el) return n;
    const W = el.clientWidth, H = el.clientHeight;
    const s = Math.min(MAX, Math.max(1, n.s));
    if (s === 1) return { s: 1, x: 0, y: 0 };
    return { s, x: Math.min(0, Math.max(W - s * W, n.x)), y: Math.min(0, Math.max(H - s * H, n.y)) };
  }, []);

  /** Zoom a `s` dejando quieto el punto (cx, cy) de la caja. */
  const zoomEn = useCallback((s: number, cx: number, cy: number, conAnimacion: boolean) => {
    const a = vRef.current;
    const px = (cx - a.x) / a.s, py = (cy - a.y) / a.s;
    setAnimar(conAnimacion);
    setV(acotar({ s, x: cx - s * px, y: cy - s * py }));
  }, [acotar]);

  const centro = () => {
    const el = caja.current;
    return el ? { cx: el.clientWidth / 2, cy: el.clientHeight / 2 } : { cx: 0, cy: 0 };
  };

  useEffect(() => { onZoom?.(v.s > 1.01); }, [v.s, onZoom]);
  useEffect(() => { setV({ s: 1, x: 0, y: 0 }); }, [src]);

  // Rueda / pellizco del trackpad: listener propio (React lo deja pasivo y no
  // se puede frenar el scroll de la página).
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const h = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const f = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.002));
      zoomEn(vRef.current.s * f, e.clientX - r.left, e.clientY - r.top, false);
    };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, [zoomEn]);

  // Dedos / mouse: arrastrar, pellizcar y tocar.
  const punteros = useRef(new Map<number, { x: number; y: number }>());
  const gesto = useRef<{ x0: number; y0: number; vx: number; vy: number; t0: number; movio: boolean; pellizco: { d0: number; s0: number; px: number; py: number } | null } | null>(null);

  const local = (e: React.PointerEvent) => {
    const r = caja.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const onDown = (e: React.PointerEvent) => {
    caja.current?.setPointerCapture(e.pointerId);
    punteros.current.set(e.pointerId, local(e));
    const p = local(e);
    if (punteros.current.size === 1) {
      gesto.current = { x0: p.x, y0: p.y, vx: vRef.current.x, vy: vRef.current.y, t0: Date.now(), movio: false, pellizco: null };
    } else if (punteros.current.size === 2 && gesto.current) {
      const [a, b] = [...punteros.current.values()];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const cur = vRef.current;
      gesto.current.movio = true;
      gesto.current.pellizco = { d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, s0: cur.s, px: (mx - cur.x) / cur.s, py: (my - cur.y) / cur.s };
    }
  };

  const onMove = (e: React.PointerEvent) => {
    if (!punteros.current.has(e.pointerId) || !gesto.current) return;
    punteros.current.set(e.pointerId, local(e));
    const g = gesto.current;
    setAnimar(false);
    if (g.pellizco && punteros.current.size >= 2) {
      const [a, b] = [...punteros.current.values()];
      const s = g.pellizco.s0 * (Math.hypot(a.x - b.x, a.y - b.y) / g.pellizco.d0);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      setV(acotar({ s, x: mx - s * g.pellizco.px, y: my - s * g.pellizco.py }));
      return;
    }
    const p = local(e);
    const dx = p.x - g.x0, dy = p.y - g.y0;
    if (Math.abs(dx) + Math.abs(dy) > 6) g.movio = true;
    if (vRef.current.s > 1 && g.movio) setV(acotar({ s: vRef.current.s, x: g.vx + dx, y: g.vy + dy }));
  };

  const onUp = (e: React.PointerEvent) => {
    const p = punteros.current.get(e.pointerId);
    punteros.current.delete(e.pointerId);
    const g = gesto.current;
    if (punteros.current.size > 0) {
      // Quedó un dedo tras pellizcar: sigue arrastrando desde donde está.
      if (g) { const [q] = [...punteros.current.values()]; g.x0 = q.x; g.y0 = q.y; g.vx = vRef.current.x; g.vy = vRef.current.y; g.pellizco = null; }
      return;
    }
    gesto.current = null;
    if (!g || g.movio || Date.now() - g.t0 > 400 || !p) return;
    // Un toque: acerca donde tocaste, o vuelve si ya estaba acercada.
    if (vRef.current.s > 1.01) { setAnimar(true); setV({ s: 1, x: 0, y: 0 }); }
    else zoomEn(PASO, p.x, p.y, true);
  };

  const acercada = v.s > 1.01;
  const BTN = "flex h-8 w-8 items-center justify-center rounded-full text-white/90 transition hover:bg-white/15 hover:text-white disabled:opacity-35";

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div
        ref={caja}
        className={`h-full w-full select-none ${acercada ? "cursor-grab active:cursor-grabbing" : "cursor-zoom-in"}`}
        style={{ touchAction: acercada ? "none" : "pan-y" }}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={onUp}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="h-full w-full object-contain"
          style={{
            transformOrigin: "0 0",
            transform: `translate(${v.x}px, ${v.y}px) scale(${v.s})`,
            transition: animar ? "transform 220ms ease-out" : "none",
            willChange: "transform",
          }}
        />
      </div>

      {children}

      {/* La barrita: alejar, acercar, volver y abrir la original. */}
      <div className="absolute bottom-2.5 left-2.5 flex items-center gap-0.5 rounded-full bg-black/55 p-1 ring-1 ring-white/15 backdrop-blur-md">
        <button type="button" className={BTN} aria-label={t("hr.exp.zoom.alejar")} disabled={!acercada}
          onClick={() => { const { cx, cy } = centro(); zoomEn(vRef.current.s / 1.6, cx, cy, true); }}>
          <ZoomOut className="h-4 w-4" />
        </button>
        <button type="button" className={BTN} aria-label={t("hr.exp.zoom.acercar")} disabled={v.s >= MAX}
          onClick={() => { const { cx, cy } = centro(); zoomEn(vRef.current.s * 1.6, cx, cy, true); }}>
          <ZoomIn className="h-4 w-4" />
        </button>
        {acercada && (
          <button type="button" className={BTN} aria-label={t("hr.exp.zoom.volver")}
            onClick={() => { setAnimar(true); setV({ s: 1, x: 0, y: 0 }); }}>
            <Maximize2 className="h-4 w-4" />
          </button>
        )}
        <a href={src} target="_blank" rel="noreferrer" className={BTN} aria-label={t("hr.exp.zoom.original")} title={t("hr.exp.zoom.original")}>
          <ExternalLink className="h-4 w-4" />
        </a>
        {!acercada && <span className="hidden pl-1 pr-2.5 text-[11px] text-white/75 sm:inline">{t("hr.exp.zoom.ayuda")}</span>}
      </div>
    </div>
  );
}
