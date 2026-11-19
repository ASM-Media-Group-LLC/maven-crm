import { describe, it, expect, vi, afterEach } from "vitest";

// MODO LIVIANO (19/11/2026: «Maven abierto todo el día en un portátil promedio o
// viejo, por debajo del 15 % de CPU»). Lo que no puede volver:
//  · el fondo de la app animado (repintaba la ventana entera en cada cuadro y
//    obligaba a recalcular cada blur que tenía encima);
//  · vidrio esmerilado y animaciones sin fin en equipos débiles, sin GPU o con
//    la página fuera de la vista;
//  · relojes de 1 s que redibujan pantallas enteras o siguen igual de rápido
//    con la página oculta.
// Las fuentes TSX se leen con import.meta.glob.

// El CSS no: con ?raw (o ?inline) Vitest lo entrega vacío. Se lee del disco
// como las otras guardas de index.css, pero con import dinámico para no sumar
// errores de tipos (el tsconfig no trae los de Node). La ruta pasa por una
// variable: con el texto literal Vite reescribe el new URL.
const fs = (await import(/* @vite-ignore */ ["node", "fs"].join(":"))) as { readFileSync: (p: URL, c: "utf8") => string };
const rutaCss = "../../index.css";
const css = fs.readFileSync(new URL(rutaCss, import.meta.url), "utf8");
const main = Object.values(import.meta.glob("../../main.tsx", { query: "?raw", import: "default", eager: true }))[0] as string;
const fuentes = import.meta.glob(
  [
    "../../components/turno/TurnoEnMenu.tsx",
    "../../components/BarraDeLlamada.tsx",
    "../../pages/cowork/RelojCowork.tsx",
    "../../pages/cowork/CoworkParticipantView.tsx",
  ],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

/** El cuerpo de la primera regla cuyo selector contiene `sel`. */
const regla = (sel: string) => {
  const i = css.indexOf(sel);
  if (i < 0) return "";
  const a = css.indexOf("{", i);
  return css.slice(a + 1, css.indexOf("}", a));
};

describe("el CSS del modo liviano", () => {
  it("apaga el vidrio esmerilado en html.liviano", () => {
    expect(regla("html.liviano *:not(.pt *),")).toMatch(/backdrop-filter: none !important/);
    expect(regla("html.liviano *:not(.pt *),")).toMatch(/-webkit-backdrop-filter: none !important/);
  });
  it("las animaciones sin fin dan una vuelta y paran (la ruedita de cargando sigue)", () => {
    const sel = 'html.liviano *:not(.animate-spin):not([class*="loading-bar"])';
    expect(css).toContain(sel);
    expect(regla(sel)).toMatch(/animation-iteration-count: 1 !important/);
  });
  it("con la página fuera de la vista no se mueve nada", () => {
    expect(regla('html.liviano[data-liviano~="oculta"] *')).toMatch(/animation-play-state: paused !important/);
  });
  it("el vidrio sin blur va más denso para que se lea", () => {
    expect(css).toMatch(/html\.liviano[^{]*\.vidrio \{ background:/);
    expect(css).toMatch(/html\.liviano \.glass-panel/);
  });
  it("el fondo de la app ya no se anima, ni con la máquina fuerte", () => {
    expect(css).not.toMatch(/\.fondo-glass \{ animation: vidrio-deriva/);
    expect(css).not.toMatch(/@keyframes vidrio-deriva/);
  });
  it("el tile de la cámara (fondo opaco) no paga un blur que no se ve", () => {
    expect(regla(".tile-estudio {")).not.toMatch(/backdrop-filter:/);
  });
  it("vidrio dentro de vidrio: solo el de afuera difumina", () => {
    expect(css).toMatch(/:is\(\.vidrio, \.vidrio-barra, \.glass-panel, \.tarjeta-sesion, \[data-sidebar="sidebar"\]\) :is\([^)]*\) \{\s*-webkit-backdrop-filter: none;\s*backdrop-filter: none;/);
  });
  it("main.tsx lo instala antes de montar React", () => {
    expect(main).toContain("instalarModoLiviano();");
    expect(main.indexOf("instalarModoLiviano();")).toBeLessThan(main.indexOf("createRoot("));
  });
});

const equipoFuerte = () => {
  Object.defineProperty(navigator, "hardwareConcurrency", { configurable: true, value: 16 });
  Object.defineProperty(navigator, "deviceMemory", { configurable: true, value: 8 });
};

describe("cuándo se prende", () => {
  afterEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    document.documentElement.classList.remove("liviano");
    delete document.documentElement.dataset.liviano;
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });

  it("equipo débil: 4 núcleos o menos, o 4 GB o menos", async () => {
    const { equipoDebil } = await import("@/lib/modoLiviano");
    expect(equipoDebil({ hardwareConcurrency: 4, deviceMemory: 8 })).toBe(true);
    expect(equipoDebil({ hardwareConcurrency: 8, deviceMemory: 4 })).toBe(true);
    expect(equipoDebil({ hardwareConcurrency: 8, deviceMemory: 8 })).toBe(false);
    expect(equipoDebil({ hardwareConcurrency: 12 })).toBe(false);
    expect(equipoDebil({})).toBe(false);
  });

  it("sin GPU: WebGL solo por software, o sin WebGL", async () => {
    const { dibujaSinGpu } = await import("@/lib/modoLiviano");
    const canvas = (rapido: boolean, lento: boolean) => () => ({
      getContext: (_: string, o?: { failIfMajorPerformanceCaveat?: boolean }) =>
        (o?.failIfMajorPerformanceCaveat ? rapido : lento) ? { getExtension: () => null } : null,
    }) as unknown as HTMLCanvasElement;
    expect(dibujaSinGpu(canvas(true, true))).toBe(false);
    expect(dibujaSinGpu(canvas(false, true))).toBe(true);
    expect(dibujaSinGpu(canvas(false, false))).toBe(true);
  });

  it("con la pestaña oculta se prende, y al volver se apaga (equipo fuerte)", async () => {
    equipoFuerte();
    vi.stubGlobal("requestIdleCallback", () => 0);
    const m = await import("@/lib/modoLiviano");
    m.instalarModoLiviano();
    const html = document.documentElement;
    expect(html.classList.contains("liviano")).toBe(false);

    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(html.classList.contains("liviano")).toBe(true);
    expect(html.dataset.liviano).toContain("oculta");

    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(html.classList.contains("liviano")).toBe(false);
  });
});

/** Los ms del último setInterval que se armó. */
const ultimoMs = (llamadas: unknown[][]) => llamadas[llamadas.length - 1]?.[1];

describe("los relojes de un segundo", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.resetModules();
    vi.unstubAllGlobals();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
  });

  it("el reloj compartido va a 1 s a la vista y a 30 s con la página oculta", async () => {
    vi.useFakeTimers();
    equipoFuerte();
    vi.stubGlobal("requestIdleCallback", () => 0);
    const espia = vi.spyOn(globalThis, "setInterval");
    const liviano = await import("@/lib/modoLiviano");
    liviano.instalarModoLiviano();
    const m = await import("@/lib/ahoraCompartido");
    const { renderHook } = await import("@testing-library/react");
    const r = renderHook(() => m.useAhoraCadaSegundo());
    expect(ultimoMs(espia.mock.calls)).toBe(m.TIC_A_LA_VISTA_MS);

    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(ultimoMs(espia.mock.calls)).toBe(m.TIC_OCULTA_MS);

    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(ultimoMs(espia.mock.calls)).toBe(m.TIC_A_LA_VISTA_MS);
    r.unmount();
    expect(m.oyentesDelReloj()).toBe(0);
  });

  it("apagado (activo = false) no se suscribe", async () => {
    const m = await import("@/lib/ahoraCompartido");
    const { renderHook } = await import("@testing-library/react");
    const r = renderHook(() => m.useAhoraCadaSegundo(false));
    expect(m.oyentesDelReloj()).toBe(0);
    r.unmount();
  });

  it("el menú del turno, la barra de llamada, el reloj y la pausa de Cowork usan el reloj compartido", () => {
    const archivos = Object.entries(fuentes);
    expect(archivos).toHaveLength(4);
    for (const [ruta, src] of archivos) {
      expect(src, ruta).not.toMatch(/setInterval\([^)]*\)\s*=>[^;]*,\s*1_?000\)/);
      expect(src, ruta).not.toMatch(/setInterval\(tick, 1000\)/);
      expect(src, ruta).toMatch(/useAhoraCadaSegundo|SegundosDesde/);
    }
  });
});
