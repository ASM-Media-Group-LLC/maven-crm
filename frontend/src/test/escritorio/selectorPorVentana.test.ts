import { describe, it, expect, vi } from "vitest";
// Doble de los eventos de Electron sin depender de tipos de Node en el frontend.
class EventEmitter {
  listeners = new Map<string, Set<(...args: unknown[]) => void>>();
  on(name: string, fn: (...args: unknown[]) => void) {
    if (!this.listeners.has(name)) this.listeners.set(name, new Set());
    this.listeners.get(name)!.add(fn); return this;
  }
  once(name: string, fn: (...args: unknown[]) => void) {
    const once = (...args: unknown[]) => { this.removeListener(name, once); fn(...args); };
    return this.on(name, once);
  }
  removeListener(name: string, fn: (...args: unknown[]) => void) { this.listeners.get(name)?.delete(fn); return this; }
  emit(name: string, ...args: unknown[]) { for (const fn of [...(this.listeners.get(name) ?? [])]) fn(...args); }
}
const path = { join: (...parts: string[]) => parts.join("/") };

const codigo = Object.values(import.meta.glob("../../../../desktop/src/compartirPantalla.js", { query: "?raw", import: "default", eager: true }))[0] as string;

function preparar() {
  const ventanas: Ventana[] = [];
  class IPC extends EventEmitter {
    handlers = new Map<string, (...args: unknown[]) => unknown>();
    handle(canal: string, fn: (...args: unknown[]) => unknown) { this.handlers.set(canal, fn); }
    removeHandler(canal: string) { this.handlers.delete(canal); }
  }
  class Ventana extends EventEmitter {
    destruida = false;
    webContents = Object.assign(new EventEmitter(), {
      ipc: new IPC(), getURL: () => "https://app.maven-ai.me/meet/uno", isDestroyed: () => this.destruida,
    });
    show = vi.fn(); focus = vi.fn(); setMenuBarVisibility = vi.fn();
    loadFile = vi.fn(async () => { this.emit("ready-to-show"); });
    constructor(public opciones: { parent?: Ventana } = {}) { super(); ventanas.push(this); }
    isDestroyed() { return this.destruida; }
    close() { this.destruida = true; this.emit("closed"); }
  }
  const getSources = vi.fn(async () => [
    { id: "screen:1", display_id: "1", name: "Pantalla", thumbnail: { toDataURL: () => "data:image/png;base64," } },
    { id: "window:2", name: "Documento", thumbnail: { toDataURL: () => "data:image/png;base64," } },
  ]);
  const permiso = {
    pantallaPermitida: vi.fn(() => true), primeraVezSinPermiso: vi.fn(() => false),
    pedirAMacOS: vi.fn(async () => {}), guiaPermisoPantalla: vi.fn(async () => {}),
  };
  const liberar = vi.fn();
  const mantenerDuranteDialogo = vi.fn(() => liberar);
  const showMessageBox = vi.fn(async () => ({}));
  const electron = {
    app: { getLocale: () => "en" },
    BrowserWindow: Object.assign(Ventana, { fromWebContents: (wc: unknown) => ventanas.find((w) => w.webContents === wc) }),
    webContents: { fromFrame: (frame: { wc: unknown }) => frame.wc },
    screen: { getPrimaryDisplay: () => ({ id: "1" }) }, desktopCapturer: { getSources }, dialog: { showMessageBox },
  };
  const modulo = { exports: {} as {
    crearManejadorDePantalla: (permitido: (url: string) => boolean) => (pedido: unknown, responder: ReturnType<typeof vi.fn>) => Promise<void>;
    ponerPantallaAutomatica: (wc: unknown, si: boolean) => void;
  } };
  new Function("require", "module", "__dirname", codigo)((id: string) => {
    if (id === "electron") return electron;
    if (id === "node:path") return path;
    if (id === "./permisoPantalla") return permiso;
    if (id === "./ventanaDeLlamada") return { mantenerDuranteDialogo };
    throw new Error(id);
  }, modulo, "/maven/desktop/src");
  const manejador = modulo.exports.crearManejadorDePantalla((url) => url.startsWith("https://app.maven-ai.me"));
  const pedir = (w: Ventana, origen = "https://app.maven-ai.me") => {
    const responder = vi.fn();
    const terminado = manejador({ frame: { wc: w.webContents }, securityOrigin: origen, audioRequested: true }, responder);
    return { responder, terminado };
  };
  return { Ventana, ventanas, pedir, ...modulo.exports, permiso, getSources, mantenerDuranteDialogo, liberar, showMessageBox };
}
const siguiente = async () => { await Promise.resolve(); await Promise.resolve(); };

describe("compartir desde la ventana que lo solicita", () => {
  it("Cowork automático no omite el selector de la llamada y cada selector tiene sus propios canales", async () => {
    const p = preparar();
    const cowork = new p.Ventana();
    const llamada = new p.Ventana();
    const otra = new p.Ventana();
    p.ponerPantallaAutomatica(cowork.webContents, true);
    const automatico = p.pedir(cowork);
    await automatico.terminado;
    expect(automatico.responder).toHaveBeenCalledWith(expect.objectContaining({ video: expect.objectContaining({ id: "screen:1" }) }));
    const manual = p.pedir(llamada);
    const manual2 = p.pedir(otra);
    await siguiente();
    const selector = p.ventanas.find((w) => w.opciones.parent === llamada)!;
    const selector2 = p.ventanas.find((w) => w.opciones.parent === otra)!;
    expect(selector.show).toHaveBeenCalled();
    expect(selector.focus).toHaveBeenCalled();
    expect(p.mantenerDuranteDialogo).toHaveBeenCalledWith(llamada);
    selector.webContents.ipc.emit("selector:elegir", {}, "window:2");
    await manual.terminado;
    expect(manual.responder).toHaveBeenCalledTimes(1);
    expect(manual.responder).toHaveBeenCalledWith(expect.objectContaining({ video: expect.objectContaining({ id: "window:2" }) }));
    expect(selector2.webContents.ipc.handlers.has("selector:fuentes")).toBe(true);
    selector2.webContents.ipc.emit("selector:elegir", {}, null);
    await manual2.terminado;
    expect(manual2.responder).toHaveBeenCalledExactlyOnceWith({});
    expect(p.liberar).toHaveBeenCalledTimes(2);
    expect(p.showMessageBox).not.toHaveBeenCalled();
  });

  it("denegar permiso explica el bloqueo en la llamada y nunca enumera pantallas", async () => {
    const p = preparar(); const llamada = new p.Ventana();
    p.permiso.pantallaPermitida.mockReturnValue(false);
    const pedido = p.pedir(llamada);
    await pedido.terminado;
    expect(p.permiso.guiaPermisoPantalla).toHaveBeenCalledWith(llamada, { explicito: true });
    expect(p.getSources).not.toHaveBeenCalled();
    expect(pedido.responder).toHaveBeenCalledExactlyOnceWith({});
    expect(p.liberar).toHaveBeenCalledOnce();
  });

  it("rechaza marcos ajenos antes de enumerar, y un fallo de captura no queda en silencio", async () => {
    const p = preparar(); const llamada = new p.Ventana();
    const ajeno = p.pedir(llamada, "https://externo.example");
    await ajeno.terminado;
    expect(p.getSources).not.toHaveBeenCalled();
    p.getSources.mockRejectedValueOnce(new Error("capture failed"));
    const fallo = p.pedir(llamada);
    await fallo.terminado;
    expect(p.showMessageBox).toHaveBeenCalledWith(llamada, expect.objectContaining({ type: "info" }));
    expect(fallo.responder).toHaveBeenCalledExactlyOnceWith({});
  });

  it("cerrar la llamada cancela su selector y libera el siguiente intento", async () => {
    const p = preparar(); const llamada = new p.Ventana();
    const pedido = p.pedir(llamada);
    await siguiente();
    llamada.close();
    await pedido.terminado;
    expect(pedido.responder).toHaveBeenCalledExactlyOnceWith({});
    expect(p.ventanas[p.ventanas.length - 1]?.isDestroyed()).toBe(true);
    expect(p.liberar).toHaveBeenCalledOnce();
  });
});
