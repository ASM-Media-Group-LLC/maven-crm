import { useEffect, useState, type MouseEvent, type PointerEvent } from "react";
import { CameraOff, ChevronLeft, ChevronRight, Loader2, ScreenShareOff } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { separarPantalla } from "@/hooks/useDondeEsta";
import { hora, type Tr } from "./piezas";

// EL VISOR DE LAS FOTOS DE ARGOS, MEJORADO (Alvaro, 11/11/2026: «ahí se mira
// algo, quiero verlo mejor»). La pantalla ENTERA y grande (sin recortar), la
// cámara de ese momento AL LADO (ya no tapando la pantalla), la hora y la app
// grandes, lo que dijo Argos completo y anterior / siguiente (también con las
// flechas del teclado). Tocar la foto la ACERCA (2,5×) donde tocaste; moviendo el
// mouse o el dedo se recorre; otro toque la aleja. Mismo diálogo de siempre.

export interface FotoEvidencia {
  id: string;
  at: string;
  pantallaUrl: string | undefined;
  camaraUrl: string | undefined;
  tienePantalla: boolean;
  tieneCamara: boolean;
  veredicto: string | null;
  fueraDeLugar: boolean;
}

export function VisorEvidencia({ fotos, indice, onIndice, onCerrar, t, lang }: {
  fotos: FotoEvidencia[];
  indice: number | null;
  onIndice: (i: number) => void;
  onCerrar: () => void;
  t: Tr;
  lang: string;
}) {
  const abierto = indice !== null && !!fotos[indice];
  const [zoom, setZoom] = useState(1);
  const [origen, setOrigen] = useState({ x: 50, y: 50 });
  useEffect(() => { setZoom(1); }, [indice]);
  const punto = (e: { clientX: number; clientY: number; currentTarget: HTMLElement }) => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  };
  const alternarZoom = (e: MouseEvent<HTMLDivElement>) => { setOrigen(punto(e)); setZoom((z) => (z === 1 ? 2.5 : 1)); };
  const recorrer = (e: PointerEvent<HTMLDivElement>) => { if (zoom !== 1) setOrigen(punto(e)); };
  useEffect(() => {
    if (!abierto || indice === null) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && indice > 0) onIndice(indice - 1);
      if (e.key === "ArrowRight" && indice < fotos.length - 1) onIndice(indice + 1);
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [abierto, indice, fotos.length, onIndice]);
  if (!abierto || indice === null) return null;

  const f = fotos[indice];
  const { app, que } = separarPantalla(f.veredicto);
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onCerrar(); }}>
      <DialogContent className="max-h-[94dvh] max-w-6xl overflow-y-auto rounded-panel bg-none from-transparent p-3 sm:p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_17rem]">
          {/* La pantalla, entera */}
          <div onClick={f.pantallaUrl ? alternarZoom : undefined} onPointerMove={recorrer}
            style={{ touchAction: zoom === 1 ? "auto" : "none" }}
            className={`relative aspect-[16/10] w-full overflow-hidden rounded-panel border border-border/50 bg-black ${f.pantallaUrl ? (zoom === 1 ? "cursor-zoom-in" : "cursor-zoom-out") : ""}`}>
            {f.tienePantalla ? (
              f.pantallaUrl ? <img src={f.pantallaUrl} alt="" draggable={false} className="h-full w-full select-none object-contain transition-transform duration-150"
                style={{ transform: `scale(${zoom})`, transformOrigin: `${origen.x}% ${origen.y}%` }} />
                : <div className="flex h-full items-center justify-center text-white/60"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 text-white/70"><ScreenShareOff className="h-8 w-8" /><span className="text-xs font-semibold">{t("argos.visor.sinPantalla")}</span></div>
            )}
            {f.pantallaUrl && (
              <span className="pointer-events-none absolute bottom-2 left-2 rounded-control bg-black/65 px-2 py-1 text-[11px] text-white/90">
                {zoom === 1 ? t("argos.visor.acercar") : t("argos.visor.alejar")}
              </span>
            )}
            {f.fueraDeLugar && <span className="pointer-events-none absolute left-0 top-0 rounded-br-control bg-destructive px-2.5 py-1 text-xs font-bold text-destructive-foreground">{t("argos.foto.flojo")}</span>}
          </div>

          {/* Al lado: la hora, la app, lo que dijo Argos y la cámara de ese momento */}
          <div className="flex min-w-0 flex-col gap-3">
            <div className="pr-8">
              <DialogTitle className="font-display text-2xl font-bold tabular-nums leading-none">{hora(f.at, lang)}</DialogTitle>
              <DialogDescription className="mt-1 text-xs tabular-nums text-muted-foreground">{t("argos.visor.deN", { i: indice + 1, n: fotos.length })}</DialogDescription>
            </div>
            <div className="rounded-panel border border-border/50 bg-card/50 p-3">
              {app && <p className="text-sm font-semibold">{app}</p>}
              <p className="mt-0.5 text-sm leading-snug text-foreground/80">{que ?? t("argos.visor.sinJuzgar")}</p>
              <p className={`mt-2 text-xs font-semibold ${f.fueraDeLugar ? "text-destructive" : f.veredicto ? "text-success" : "text-muted-foreground"}`}>
                {f.fueraDeLugar ? t("argos.visor.flojo") : f.veredicto ? t("argos.visor.enLoSuyo") : t("argos.visor.sinJuzgar")}
              </p>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-medium text-muted-foreground">{t("argos.visor.camara")}</p>
              <div className="relative aspect-[4/3] w-full max-w-[17rem] overflow-hidden rounded-panel border border-border/50 bg-black">
                {f.tieneCamara && f.camaraUrl ? <img src={f.camaraUrl} alt="" className="h-full w-full object-cover" />
                  : <div className="flex h-full flex-col items-center justify-center gap-1.5 text-destructive"><CameraOff className="h-5 w-5" /><span className="text-[11px] font-semibold">{t("argos.visor.camaraApagada")}</span></div>}
              </div>
            </div>
            <div className="mt-auto flex items-center gap-2">
              <button type="button" onClick={() => onIndice(indice - 1)} disabled={indice <= 0}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-control border border-border/60 bg-card/40 text-sm font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-40">
                <ChevronLeft className="h-4 w-4" />{t("argos.visor.anterior")}
              </button>
              <button type="button" onClick={() => onIndice(indice + 1)} disabled={indice >= fotos.length - 1}
                className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-control border border-border/60 bg-card/40 text-sm font-medium text-muted-foreground transition hover:text-foreground disabled:opacity-40">
                {t("argos.visor.siguiente")}<ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
