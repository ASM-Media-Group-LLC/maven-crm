// MODO LIVIANO (19/11/2026: «Maven abierto todo el día en un portátil promedio o
// viejo tiene que gastar menos del 15 % de CPU»).
//
// Medido hoy: con Chrome SIN aceleración gráfica, la mayor parte de la CPU se iba
// en el vidrio esmerilado (backdrop-filter) y en las animaciones que nunca paran.
// Sin GPU cada blur se calcula con el procesador en cada cuadro, y como el fondo
// se movía, se recalculaba sin fin. En equipos débiles pasa lo mismo.
//
// Aquí se decide cuándo poner la clase `liviano` en <html>. Con ella, index.css
// cambia el vidrio por un fondo semiopaco equivalente y detiene las animaciones
// infinitas (la ruedita de «cargando» sigue). Se prende sola si:
//   · el equipo parece débil (4 núcleos o menos, o 4 GB de memoria o menos);
//   · el navegador dibuja sin GPU (WebGL por software o sin WebGL);
//   · la persona pidió menos movimiento en su sistema;
//   · nadie está viendo la página (pestaña oculta, o la app de computador
//     minimizada: allá la página cree que siempre está a la vista).
// En un equipo fuerte y a la vista, Maven se ve igual que siempre.
//
// `localStorage["maven.liviano"]` = "si" | "no" lo fuerza (para soporte).

import { escritorio } from "@/lib/escritorio";

export const CLASE_LIVIANO = "liviano";

type NavegadorConMemoria = { hardwareConcurrency?: number; deviceMemory?: number };

/** ¿El equipo parece débil? 4 núcleos o menos, o 4 GB de memoria o menos. */
export function equipoDebil(nav: NavegadorConMemoria | undefined = typeof navigator === "undefined" ? undefined : navigator): boolean {
  if (!nav) return false;
  const nucleos = nav.hardwareConcurrency;
  const memoria = nav.deviceMemory;
  return (typeof nucleos === "number" && nucleos > 0 && nucleos <= 4)
    || (typeof memoria === "number" && memoria > 0 && memoria <= 4);
}

/** ¿El navegador dibuja sin GPU? WebGL que solo arranca aceptando «bajo
 *  rendimiento» es WebGL por software (SwiftShader/llvmpipe); sin WebGL, la
 *  aceleración está apagada del todo. */
export function dibujaSinGpu(crearCanvas: () => HTMLCanvasElement = () => document.createElement("canvas")): boolean {
  try {
    const c = crearCanvas();
    const rapido = c.getContext("webgl", { failIfMajorPerformanceCaveat: true }) as WebGLRenderingContext | null;
    if (rapido) {
      rapido.getExtension("WEBGL_lose_context")?.loseContext();
      return false;
    }
    const lento = crearCanvas().getContext("webgl") as WebGLRenderingContext | null;
    lento?.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function pideMenosMovimiento(): boolean {
  try { return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; }
}

function forzado(): boolean | null {
  try {
    const v = localStorage.getItem("maven.liviano");
    return v === "si" ? true : v === "no" ? false : null;
  } catch { return null; }
}

// ── ¿Alguien ve la página? ─────────────────────────────────────────────────
let appEscondida = false;
const oyentesVista = new Set<(aLaVista: boolean) => void>();

/** true si la página está a la vista: pestaña visible y, en la app de
 *  computador, la ventana ni minimizada ni escondida en la barra. */
export function paginaALaVista(): boolean {
  if (typeof document !== "undefined" && document.visibilityState === "hidden") return false;
  return !appEscondida;
}

/** Avisa cada vez que la página pasa a estar (o deja de estar) a la vista. */
export function alCambiarALaVista(cb: (aLaVista: boolean) => void): () => void {
  oyentesVista.add(cb);
  return () => { oyentesVista.delete(cb); };
}

// ── La clase en <html> ─────────────────────────────────────────────────────
const motivos = { debil: false, sinGpu: false, menosMovimiento: false };
let ultimaVista = true;

/** Los motivos por los que el modo liviano está prendido ahora mismo. */
export function motivosLiviano(): string[] {
  const m: string[] = [];
  if (motivos.debil) m.push("equipo");
  if (motivos.sinGpu) m.push("sin-gpu");
  if (motivos.menosMovimiento) m.push("movimiento");
  if (!paginaALaVista()) m.push("oculta");
  return m;
}

function aplicar(): void {
  if (typeof document === "undefined") return;
  const f = forzado();
  const m = motivosLiviano();
  const prender = f ?? m.length > 0;
  const html = document.documentElement;
  html.classList.toggle(CLASE_LIVIANO, prender);
  if (prender) html.dataset.liviano = f ? "forzado" : m.join(" ");
  else delete html.dataset.liviano;
  const vista = paginaALaVista();
  if (vista !== ultimaVista) {
    ultimaVista = vista;
    oyentesVista.forEach((cb) => { try { cb(vista); } catch { /* un oyente roto no frena a los demás */ } });
  }
}

let instalado = false;

/** Se llama una vez al arrancar (main.tsx), antes de montar React. Devuelve
 *  cómo soltar la escucha de la pestaña (lo usan las pruebas). */
export function instalarModoLiviano(): () => void {
  if (instalado || typeof document === "undefined") return () => {};
  instalado = true;
  motivos.debil = equipoDebil();
  motivos.menosMovimiento = pideMenosMovimiento();
  aplicar();

  document.addEventListener("visibilitychange", aplicar);
  try {
    matchMedia("(prefers-reduced-motion: reduce)").addEventListener?.("change", (e) => {
      motivos.menosMovimiento = e.matches;
      aplicar();
    });
  } catch { /* navegador viejo */ }

  // La app de computador corre sin frenar la página escondida: avisa ella.
  const app = escritorio();
  if (app?.alCambiarVisibilidad) {
    app.alCambiarVisibilidad((visible) => { appEscondida = !visible; aplicar(); });
    void app.visible?.().then((v) => { if (v === false) { appEscondida = true; aplicar(); } }).catch(() => {});
  }

  // Revisar la GPU crea un contexto WebGL (unos milisegundos): va cuando el
  // navegador esté libre, no en el arranque.
  const revisarGpu = () => { motivos.sinGpu = dibujaSinGpu(); aplicar(); };
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
  if (typeof w.requestIdleCallback === "function") w.requestIdleCallback(revisarGpu, { timeout: 5000 });
  else window.setTimeout(revisarGpu, 2000);
  return () => {
    document.removeEventListener("visibilitychange", aplicar);
    instalado = false;
  };
}
