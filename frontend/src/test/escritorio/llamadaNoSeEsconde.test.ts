import { describe, expect, it, vi } from "vitest";

// LA LLAMADA NO SE ESCONDE (Alvaro, 18/11/2026: «se escondió la llamada y no
// encontraba dónde colgar»). En la app, la ventana de una llamada que pierde el
// foco se achica a una ventanita. «Expandir» conserva el tamaño previo de la
// ventana. «Volver a la llamada» (la barra de Maven) la trae al frente
// por maven:mostrar-esta-ventana, que solo una ventana de llamada puede pedir.
const leer = (g: Record<string, unknown>) => Object.values(g)[0] as string;
const ventana = leer(import.meta.glob("../../../../desktop/src/ventanaDeLlamada.js", { query: "?raw", import: "default", eager: true }));
const main = leer(import.meta.glob("../../../../desktop/src/main.js", { query: "?raw", import: "default", eager: true }));
const preload = leer(import.meta.glob("../../../../desktop/src/preload.js", { query: "?raw", import: "default", eager: true }));

describe("la ventana de la llamada", () => {
  it("se leyeron las fuentes", () => {
    for (const f of [ventana, main, preload]) expect(f?.length).toBeGreaterThan(500);
  });

  it("cada ventana de llamada de Maven se prepara al abrirse", () => {
    expect(main).toMatch(/webContents\.on\("did-create-window", \(hija, \{ url \}\) => \{\s*if \(esDeMaven\(url\) && esLlamada\(url\)\) prepararVentanaDeLlamada\(hija\);/);
  });

  it("permite mover y desanclar sin expandir al recuperar el foco", () => {
    vi.useFakeTimers();
    try {
      const original = { x: 100, y: 100, width: 820, height: 620 };
      let bounds = original;
      let cursor = { x: 800, y: 40 };
      const eventos = new Map<string, () => void>();
      const hija = {
        getBounds: () => bounds,
        setBounds: vi.fn((nuevo) => { bounds = nuevo; }),
        isDestroyed: () => false, isMinimized: () => false, isFullScreen: () => false,
        isFocused: () => false, isMaximized: () => false,
        setAlwaysOnTop: vi.fn(), setVisibleOnAllWorkspaces: vi.fn(),
        show: vi.fn(), focus: vi.fn(),
        webContents: { isDestroyed: () => false, send: vi.fn() },
        on: (evento: string, fn: () => void) => eventos.set(evento, fn),
      };
      const pantalla = () => ({ workArea: { x: 0, y: 0, width: 1200, height: 800 } });
      const electron = { screen: { getDisplayMatching: pantalla, getDisplayNearestPoint: pantalla, getCursorScreenPoint: () => cursor } };
      const modulo = { exports: {
        prepararVentanaDeLlamada: (_hija: typeof hija) => {},
        controlarMiniatura: (_hija: typeof hija, _accion: string): unknown => null,
        arrastrarMiniatura: (_hija: typeof hija, _fase: string) => {},
        mantenerDuranteDialogo: (_hija: typeof hija): (() => void) => () => {},
      } };
      new Function("require", "module", ventana)(() => electron, modulo);
      const { prepararVentanaDeLlamada, controlarMiniatura, arrastrarMiniatura, mantenerDuranteDialogo } = modulo.exports;
      prepararVentanaDeLlamada(hija);
      controlarMiniatura(hija, "estado");
      const perderFoco = () => { eventos.get("blur")?.(); vi.advanceTimersByTime(400); };
      const terminarDialogo = mantenerDuranteDialogo(hija);
      perderFoco();
      expect(bounds).toEqual(original);
      terminarDialogo();
      perderFoco();
      expect(bounds.width).toBeLessThan(original.width);
      expect(hija.setAlwaysOnTop).toHaveBeenLastCalledWith(true, "floating");
      const movida = { ...bounds, x: 34, y: 54 };
      const inicio = bounds;
      eventos.get("focus")?.();
      expect(bounds).toEqual(inicio);
      arrastrarMiniatura(hija, "inicio");
      cursor = { x: cursor.x + movida.x - inicio.x, y: cursor.y + movida.y - inicio.y };
      arrastrarMiniatura(hija, "mover");
      arrastrarMiniatura(hija, "fin");
      expect(bounds).toEqual(movida);
      expect(controlarMiniatura(hija, "anclaje")).toEqual({ miniatura: true, anclada: false });
      expect(hija.setAlwaysOnTop).toHaveBeenLastCalledWith(false, "floating");
      controlarMiniatura(hija, "expandir");
      expect(bounds).toEqual(original);
      perderFoco();
      expect(bounds).toEqual(movida);
      expect(hija.setAlwaysOnTop).toHaveBeenLastCalledWith(false, "floating");
      expect(controlarMiniatura(hija, "arbitraria")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reconoce llamadas y enlaces públicos, pero no rutas de otras áreas", () => {
    const modulo = { exports: {} as { esLlamada: (url: string) => boolean } };
    new Function("require", "module", ventana)(() => ({ screen: {} }), modulo);
    for (const ruta of ["/call/abc", "/meet/abc", "/entrar/F4KP43", "/unirse/abc"]) {
      expect(modulo.exports.esLlamada("https://app.maven-ai.me" + ruta)).toBe(true);
    }
    for (const ruta of ["/cowork", "/meetings", "/entrar/", "/login"]) {
      expect(modulo.exports.esLlamada("https://app.maven-ai.me" + ruta)).toBe(false);
    }
  });

  it("«Volver a la llamada» solo lo pide una ventana de llamada de Maven, para sí misma", () => {
    expect(main).toMatch(/ipcMain\.handle\("maven:mostrar-esta-ventana", \(e\) => \{\s*const url = e\.sender\.getURL\(\);\s*if \(!esDeMaven\(url\) \|\| !esLlamada\(url\)\) return false;\s*return mostrarVentana\(BrowserWindow\.fromWebContents\(e\.sender\)\);/);
    expect(preload).toMatch(/mostrarEstaVentana: \(\) => ipcRenderer\.invoke\("maven:mostrar-esta-ventana"\)/);
  });
});
