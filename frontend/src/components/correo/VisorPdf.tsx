import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2, Maximize2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/hooks/useLanguage";

// Tipos mínimos de pdf.js — se carga por `import()` dinámico (ver abajo), así
// que no hay tipos estáticos disponibles en el punto de uso.
interface PaginaPdf {
  getViewport: (o: { scale: number }) => { width: number; height: number };
  getTextContent: () => Promise<unknown>;
  render: (o: { canvasContext: CanvasRenderingContext2D; viewport: unknown }) => {
    promise: Promise<void>;
    cancel: () => void;
  };
}
interface DocumentoPdf {
  numPages: number;
  getPage: (n: number) => Promise<PaginaPdf>;
  destroy: () => Promise<void>;
}

/** pdf.js se trae UNA vez y se comparte. Es un `import()` dinámico a propósito:
 *  son ~1 MB entre librería y worker, y solo los paga quien abre un PDF. */
let pdfjsPromesa: Promise<typeof import("pdfjs-dist")> | null = null;
function cargarPdfjs() {
  if (!pdfjsPromesa) {
    pdfjsPromesa = (async () => {
      const pdfjs = await import("pdfjs-dist");
      // El worker se empaqueta como archivo aparte y se sirve desde nuestro
      // propio origen: pdf.js por defecto lo busca en un CDN, que acá no
      // resolvería.
      const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
      pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
      return pdfjs;
    })();
  }
  return pdfjsPromesa;
}

/** Pasos del zoom, como múltiplo del tamaño que entra a lo ancho. 1 = ajustado.
 *  Discretos y no continuos: un botón que salta a un valor conocido es más
 *  predecible que uno que suma de a poquito. */
const PASOS_ZOOM = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4] as const;

/** Tope de píxeles por lado del canvas. Una hoja grande al 400% con la densidad
 *  de una pantalla retina pediría un canvas de cientos de MB y el navegador lo
 *  devuelve en blanco, sin error. */
const LADO_MAXIMO = 6000;

/** Dibuja un PDF en un canvas propio.
 *
 *  ⚠️ NO se usa un <iframe> con el visor de Chrome, aunque sea una línea de
 *  código. El plugin de PDF mide su viewport una sola vez al engancharse: si el
 *  iframe se monta dentro de un diálogo que ya estaba abierto —o sea, al pasar
 *  al archivo siguiente— carga la barra y la miniatura pero NUNCA dibuja la
 *  página, y se ve un panel negro que parece un PDF roto. Se probaron seis
 *  formas de despertarlo (elemento nuevo por documento, revocado diferido del
 *  blob, empujón de tamaño, `resize` sintético por tiempo y en `onLoad`,
 *  remontar el diálogo entero) y ninguna es confiable: `onLoad` llega antes de
 *  que el plugin se enganche, y un `resize` disparado demasiado pronto lo deja
 *  peor. Dibujarlo nosotros saca el problema de raíz y además evita la barra de
 *  herramientas de Chrome, que duplicaba nuestros botones de descarga. */
export default function VisorPdf({ bytes, nombre }: { bytes: Uint8Array; nombre: string }) {
  const { t } = useLanguage();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const hojaRef = useRef<HTMLDivElement | null>(null);
  const textoRef = useRef<HTMLDivElement | null>(null);
  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const docRef = useRef<DocumentoPdf | null>(null);

  const [paginas, setPaginas] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ancho, setAncho] = useState(0);
  /** Múltiplo sobre el ajuste a lo ancho; 1 = ajustado al diálogo. */
  const [zoom, setZoom] = useState(1);
  /** Escala real con la que se dibujó, para mostrar el porcentaje de verdad. */
  const [escalaReal, setEscalaReal] = useState(0);

  // Abrir el documento.
  useEffect(() => {
    let vivo = true;
    setCargando(true);
    setError(null);
    setPagina(1);
    setZoom(1);
    (async () => {
      try {
        const pdfjs = await cargarPdfjs();
        // pdf.js se queda con el buffer que le pasan (lo deja vacío), así que va
        // una copia: el mismo Uint8Array puede volver a usarse al descargar.
        const doc = (await pdfjs.getDocument({ data: bytes.slice() }).promise) as unknown as DocumentoPdf;
        if (!vivo) {
          void doc.destroy();
          return;
        }
        docRef.current = doc;
        setPaginas(doc.numPages);
        setCargando(false);
      } catch (e) {
        if (vivo) {
          // Sin mensaje queda "" (y no null): el título del error ya lo dice.
          setError(e instanceof Error ? e.message : "");
          setCargando(false);
        }
      }
    })();
    return () => {
      vivo = false;
      void docRef.current?.destroy();
      docRef.current = null;
    };
  }, [bytes]);

  // El ancho disponible manda: la página se dibuja para llenarlo.
  useEffect(() => {
    const el = contenedorRef.current;
    if (!el) return;
    const medir = () => setAncho(el.clientWidth);
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  // Dibujar la página actual.
  useEffect(() => {
    const doc = docRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas || cargando || error !== null || ancho === 0) return;
    let tarea: { cancel: () => void } | null = null;
    let vivo = true;
    (async () => {
      const p = await doc.getPage(pagina);
      if (!vivo) return;
      const base = p.getViewport({ scale: 1 });
      // Un poco de margen para que la hoja no pegue contra los bordes.
      const ajuste = Math.max(0.1, (ancho - 32) / base.width);
      const escala = ajuste * zoom;
      const vp = p.getViewport({ scale: escala });
      // `devicePixelRatio` para que el texto no salga borroso en pantallas
      // retina, pero bajándolo si el canvas se iría del tope.
      const dprIdeal = Math.min(window.devicePixelRatio || 1, 2);
      const lado = Math.max(vp.width, vp.height);
      const dpr = Math.max(1, Math.min(dprIdeal, LADO_MAXIMO / lado));
      setEscalaReal(escala);
      canvas.width = Math.floor(vp.width * dpr);
      canvas.height = Math.floor(vp.height * dpr);
      canvas.style.width = `${Math.floor(vp.width)}px`;
      canvas.style.height = `${Math.floor(vp.height)}px`;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      if (hojaRef.current) {
        hojaRef.current.style.width = `${Math.floor(vp.width)}px`;
        hojaRef.current.style.height = `${Math.floor(vp.height)}px`;
      }
      const t = p.render({ canvasContext: ctx, viewport: vp });
      tarea = t;
      try {
        await t.promise;
      } catch {
        /* cancelada al cambiar de página o de archivo: no es un error */
      }
      if (!vivo) return;

      // La capa de texto va DESPUÉS del dibujo: son spans transparentes puestos
      // justo encima de cada palabra. No se ven, pero se pueden seleccionar,
      // copiar y encontrar con Ctrl+F. Sin esto el CV es una foto.
      const capa = textoRef.current;
      if (!capa) return;
      capa.replaceChildren();
      // pdf.js posiciona cada span con calc() sobre esta variable.
      capa.style.setProperty("--scale-factor", String(escala));
      try {
        const pdfjs = await cargarPdfjs();
        const contenido = await p.getTextContent();
        if (!vivo) return;
        await new pdfjs.TextLayer({
          textContentSource: contenido as never,
          container: capa,
          viewport: vp as never,
        }).render();
      } catch {
        /* sin capa de texto el PDF igual se ve; solo no se puede seleccionar */
      }
    })();
    return () => {
      vivo = false;
      tarea?.cancel();
    };
  }, [pagina, ancho, zoom, cargando, error]);

  const cambiarZoom = useCallback((dir: 1 | -1) => {
    setZoom((z) => {
      const i = PASOS_ZOOM.indexOf(z as (typeof PASOS_ZOOM)[number]);
      // Si el valor actual no es un paso exacto, se busca el más cercano.
      const actual =
        i >= 0 ? i : PASOS_ZOOM.reduce((mejor, v, j) => (Math.abs(v - z) < Math.abs(PASOS_ZOOM[mejor] - z) ? j : mejor), 0);
      return PASOS_ZOOM[Math.min(PASOS_ZOOM.length - 1, Math.max(0, actual + dir))];
    });
  }, []);

  // Teclado: + acerca, - aleja, 0 vuelve a ajustado. Las flechas NO se tocan:
  // son del visor de arriba, que cambia de ARCHIVO.
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      // Con Ctrl/⌘ el atajo es del NAVEGADOR (Ctrl+- , Ctrl+0): si lo tomáramos
      // también nosotros, una sola pulsación movería los dos zooms.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "+" || e.key === "=") cambiarZoom(1);
      else if (e.key === "-") cambiarZoom(-1);
      else if (e.key === "0") setZoom(1);
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [cambiarZoom]);

  // Ctrl/⌘ + rueda, que es el gesto que la gente ya tiene en los dedos.
  // `passive: false` porque hay que cancelar el zoom del navegador entero.
  useEffect(() => {
    const el = contenedorRef.current;
    if (!el) return;
    const alRodar = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      cambiarZoom(e.deltaY < 0 ? 1 : -1);
    };
    el.addEventListener("wheel", alRodar, { passive: false });
    return () => el.removeEventListener("wheel", alRodar);
  }, [cambiarZoom]);

  const irA = useCallback(
    (n: number) => setPagina((p) => Math.min(paginas, Math.max(1, n || p))),
    [paginas],
  );

  if (error !== null) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center">
        <div>
          <p className="text-sm font-medium">{t("mail.pdf.readError")}</p>
          {error && <p className="mt-1 text-xs text-muted-foreground">{error}</p>}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div ref={contenedorRef} className="min-h-0 flex-1 overflow-auto px-4 py-4">
        {cargando ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div ref={hojaRef} className="relative mx-auto w-fit rounded-sm bg-white shadow-sm">
            <canvas
              ref={canvasRef}
              aria-label={t("mail.pdf.canvasAria", { name: nombre, page: pagina, pages: paginas })}
              className="block"
            />
            <div ref={textoRef} className="capa-texto-pdf" />
          </div>
        )}
      </div>

      {!cargando && (
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-border/60 px-3 py-1.5">
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-full"
              disabled={zoom <= PASOS_ZOOM[0]}
              onClick={() => cambiarZoom(-1)}
              aria-label={t("mail.pdf.zoomOut")}
              title={t("mail.pdf.zoomOutTitle")}
            >
              <Minus className="h-4 w-4" />
            </Button>
            <span className="min-w-[3.25rem] text-center text-xs tabular-nums text-muted-foreground">
              {escalaReal > 0 ? `${Math.round(escalaReal * 100)}%` : "—"}
            </span>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 rounded-full"
              disabled={zoom >= PASOS_ZOOM[PASOS_ZOOM.length - 1]}
              onClick={() => cambiarZoom(1)}
              aria-label={t("mail.pdf.zoomIn")}
              title={t("mail.pdf.zoomInTitle")}
            >
              <Plus className="h-4 w-4" />
            </Button>
            {zoom !== 1 && (
              <Button
                size="sm"
                variant="ghost"
                className="ml-1 h-7 rounded-full px-2 text-xs"
                onClick={() => setZoom(1)}
                title={t("mail.pdf.fitTitle")}
              >
                <Maximize2 className="mr-1 h-3.5 w-3.5" />
                {t("mail.pdf.fit")}
              </Button>
            )}
          </div>

          {paginas > 1 && (
            <div className="flex items-center gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 rounded-full"
                disabled={pagina <= 1}
                onClick={() => irA(pagina - 1)}
                aria-label={t("mail.pdf.prevPage")}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs tabular-nums text-muted-foreground">
                {t("mail.pdf.pageOf", { page: pagina, pages: paginas })}
              </span>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 rounded-full"
                disabled={pagina >= paginas}
                onClick={() => irA(pagina + 1)}
                aria-label={t("mail.pdf.nextPage")}

              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
