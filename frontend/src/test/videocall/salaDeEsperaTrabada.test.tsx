// LA SALA DE ESPERA SE QUEDABA EN "APLICANDO FONDO…" Y LA PERSONA NO SE VEÍA.
//
// Grace, 29/09/2026: "cada vez que voy a prender mi cámara se queda así" — la
// foto del café con la ruedita, y ella no aparece. Mientras se prepara el fondo
// el video se esconde a propósito; el defecto era que dos esperas no tenían tope
// (pedir la cámara y precargar la foto), nada sacaba el velo si la cadena se
// trababa, y el cartel se prendía ANTES de pedir la cámara (una cámara trabada
// también decía "Aplicando fondo…").
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";

vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

const crearPista = () => ({
  kind: "video",
  attach: vi.fn(),
  detach: vi.fn(),
  stop: vi.fn(),
  setProcessor: vi.fn(async () => {}),
  stopProcessor: vi.fn(async () => {}),
  mediaStreamTrack: { getSettings: () => ({ deviceId: "cam-1" }) },
});

const createLocalTracks = vi.fn();
vi.mock("livekit-client", () => ({
  createLocalTracks: (...args: unknown[]) => createLocalTracks(...args),
  LocalAudioTrack: vi.fn(),
  LocalVideoTrack: vi.fn(),
}));

const procesadores: Array<{ switchTo: ReturnType<typeof vi.fn>; destroy: ReturnType<typeof vi.fn> }> = [];
vi.mock("@livekit/track-processors", () => ({
  BackgroundProcessor: vi.fn(() => {
    const p = { switchTo: vi.fn(async () => {}), destroy: vi.fn(async () => {}) };
    procesadores.push(p);
    return p;
  }),
  supportsBackgroundProcessors: vi.fn(() => true),
}));

import PreJoinLobby from "@/pages/messenger/videocall/PreJoinLobby";
import { guardarFondo } from "@/lib/fondoDeLlamada";

const props = { roomName: "sala", displayName: "Grace Gelves", callDisplayName: "Reunión", onJoin: vi.fn() };

/** Deja correr promesas y temporizadores simulados. */
const avanzar = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
const prenderCamara = () => fireEvent.click(screen.getByTitle("Activar cámara"));
const apagarCamara = () => fireEvent.click(screen.getByTitle("Desactivar cámara"));
const videoEscondido = () => document.querySelector("video")?.className.includes("opacity-0") ?? true;

// Como Chrome: ANTES de dar permiso, la lista de aparatos viene sin id ni
// nombre; recién después de abrir la cámara aparecen. Ese cambio de "" al id de
// verdad es el que reabría la cámara la primera vez.
let hayPermiso = false;
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  procesadores.length = 0;
  hayPermiso = false;
  createLocalTracks.mockReset();
  // jsdom no implementa play() (no devuelve promesa): el `.catch` reventaba y la
  // vista nunca llegaba a listar los aparatos. El navegador devuelve una promesa.
  vi.spyOn(HTMLMediaElement.prototype, "play").mockImplementation(() => Promise.resolve());
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: {
      enumerateDevices: vi.fn(async () => [hayPermiso
        ? { kind: "videoinput", deviceId: "cam-1", label: "Cámara de la MacBook" }
        : { kind: "videoinput", deviceId: "", label: "" }]),
    },
  });
});
/** Una pista, y de paso "da permiso" (como el primer getUserMedia). */
const conPermiso = () => { hayPermiso = true; return [crearPista()]; };
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("⚠️ la sala de espera no deja a la persona sin verse", () => {
  it("con el fondo del café: aunque la foto nunca termine de bajar, a los segundos ella SE VE", async () => {
    // En jsdom una imagen nunca dispara onload: es exactamente la foto que no
    // termina de bajar. Antes esa espera no tenía tope y el velo no se iba nunca.
    guardarFondo("tpl-cafe");
    createLocalTracks.mockResolvedValue([crearPista()]);
    render(<PreJoinLobby {...props} />);
    prenderCamara();
    await avanzar(50);
    expect(screen.getByText("Aplicando fondo…")).toBeInTheDocument();
    expect(videoEscondido()).toBe(true);
    await avanzar(10_500);
    expect(screen.queryByText("Aplicando fondo…")).not.toBeInTheDocument();
    expect(videoEscondido()).toBe(false);
    // Y se le dice lo que pasó: que el fondo tardó, NO que su navegador no sirve.
    expect(screen.getByText(/El fondo tardó demasiado/)).toBeInTheDocument();
    expect(screen.queryByText(/no soporta vista previa/)).not.toBeInTheDocument();
  });

  it("⚠️ si CADA paso del fondo llega tarde, el tope total igual la muestra a los 10 s", async () => {
    // Cada paso contesta justo antes de su propio tope (enganche 4 s, foto 5 s,
    // cambio de modo 5 s): sumados pasan de 13 s de pantalla sin verse. El tope
    // total corta la espera a los 10 s y la muestra sin fondo, con un aviso.
    guardarFondo("tpl-cafe");
    const ImagenOriginal = globalThis.Image;
    class ImagenLenta { onload: (() => void) | null = null; onerror: (() => void) | null = null;
      set src(_v: string) { setTimeout(() => this.onload?.(), 4_900); } }
    globalThis.Image = ImagenLenta as never;
    try {
      const pista = crearPista();
      pista.setProcessor.mockImplementation(() => new Promise((r) => setTimeout(r, 3_900)));
      createLocalTracks.mockResolvedValue([pista]);
      render(<PreJoinLobby {...props} />);
      await avanzar(10);
      procesadores.length = 0;
      prenderCamara();
      await avanzar(20);
      const motor = procesadores[0];
      motor.switchTo.mockImplementation(() => new Promise((r) => setTimeout(r, 4_900)));
      await avanzar(10_300);
      expect(videoEscondido()).toBe(false);
      expect(screen.queryByText("Aplicando fondo…")).not.toBeInTheDocument();
      expect(screen.getByText(/El fondo tardó demasiado/)).toBeInTheDocument();
    } finally {
      globalThis.Image = ImagenOriginal;
    }
  });

  it("⚠️ el cartel dice 'Abriendo la cámara…' mientras espera la cámara, no 'Aplicando fondo…'", async () => {
    guardarFondo("tpl-cafe");
    createLocalTracks.mockImplementation(() => new Promise(() => {}));
    render(<PreJoinLobby {...props} />);
    prenderCamara();
    await avanzar(50);
    expect(screen.getByText("Abriendo la cámara…")).toBeInTheDocument();
    expect(screen.queryByText("Aplicando fondo…")).not.toBeInTheDocument();
  });

  it("⚠️ una cámara que no contesta no gira para siempre: dice qué revisar", async () => {
    createLocalTracks.mockImplementation(() => new Promise(() => {}));
    render(<PreJoinLobby {...props} />);
    prenderCamara();
    await avanzar(12_100);
    expect(screen.queryByText("Abriendo la cámara…")).not.toBeInTheDocument();
    expect(screen.getByText(/La cámara no responde/)).toBeInTheDocument();
  });

  it("⚠️ si el navegador está pidiendo permiso, eso es lo que se le dice", async () => {
    Object.defineProperty(navigator, "permissions", {
      configurable: true, value: { query: vi.fn(async () => ({ state: "prompt" })) },
    });
    try {
      createLocalTracks.mockImplementation(() => new Promise(() => {}));
      render(<PreJoinLobby {...props} />);
      prenderCamara();
      await avanzar(12_100);
      expect(screen.getByText(/esperando que permitas la cámara/)).toBeInTheDocument();
    } finally {
      Object.defineProperty(navigator, "permissions", { configurable: true, value: undefined });
    }
  });

  it("⚠️ si da el permiso TARDE (pasado el tope), la cámara se usa: no se apaga en su cara", async () => {
    let contestar: (v: unknown) => void = () => {};
    createLocalTracks.mockImplementation(() => new Promise((r) => { contestar = r; }));
    render(<PreJoinLobby {...props} />);
    prenderCamara();
    await avanzar(12_100);
    expect(screen.getByText(/La cámara no responde/)).toBeInTheDocument();
    const tarde = crearPista();
    await act(async () => { contestar([tarde]); await vi.advanceTimersByTimeAsync(50); });
    expect(tarde.stop).not.toHaveBeenCalled();
    expect(tarde.attach).toHaveBeenCalled();
    expect(screen.queryByText(/La cámara no responde/)).not.toBeInTheDocument();
  });

  it("si la apagó mientras esperaba, la que contesta tarde SÍ se apaga", async () => {
    let contestar: (v: unknown) => void = () => {};
    createLocalTracks.mockImplementation(() => new Promise((r) => { contestar = r; }));
    render(<PreJoinLobby {...props} />);
    prenderCamara();
    await avanzar(12_100);
    apagarCamara();
    await avanzar(50);
    const tarde = crearPista();
    await act(async () => { contestar([tarde]); await vi.advanceTimersByTimeAsync(50); });
    expect(tarde.stop).toHaveBeenCalled();
  });

  it("⚠️ el aviso de error no tapa el botón de la cámara (si no, no se puede volver a intentar)", async () => {
    createLocalTracks.mockImplementation(() => new Promise(() => {}));
    render(<PreJoinLobby {...props} />);
    prenderCamara();
    await avanzar(12_100);
    const boton = screen.getByTitle("Desactivar cámara");
    const barra = boton.closest("div.absolute") as HTMLElement;
    const aviso = screen.getByText(/La cámara no responde/).closest("div.absolute") as HTMLElement;
    const z = (el: HTMLElement) => Number((el.className.match(/\bz-(\d+)\b/) ?? [])[1] ?? 0);
    expect(z(barra)).toBeGreaterThan(z(aviso));
  });

  it("⚠️ cambiar el fondo MIENTRAS abre la cámara se respeta (antes ganaba el viejo)", async () => {
    guardarFondo("tpl-cafe");
    let contestar: (v: unknown) => void = () => {};
    createLocalTracks.mockImplementation(() => new Promise((r) => { contestar = r; }));
    render(<PreJoinLobby {...props} />);
    prenderCamara();
    await avanzar(50);
    fireEvent.click(screen.getByTitle("Fondo virtual"));
    fireEvent.click(screen.getByText("Sin efecto"));
    await avanzar(50);
    const pista = crearPista();
    await act(async () => { contestar([pista]); await vi.advanceTimersByTimeAsync(200); });
    // Eligió "sin fondo": no se arma el motor del café ni se la esconde.
    expect(pista.setProcessor).not.toHaveBeenCalled();
    expect(videoEscondido()).toBe(false);
  });

  it("⚠️ el micrófono: una apertura vieja que contesta tarde no queda grabando", async () => {
    let contestarPrimero: (v: unknown) => void = () => {};
    const microViejo = { kind: "audio", stop: vi.fn() };
    const microNuevo = { kind: "audio", stop: vi.fn() };
    createLocalTracks
      .mockImplementationOnce(() => new Promise((r) => { contestarPrimero = r; }))
      .mockImplementationOnce(async () => [microNuevo]);
    render(<PreJoinLobby {...props} />);
    fireEvent.click(screen.getByTitle("Activar micrófono"));
    await avanzar(50);
    fireEvent.click(screen.getByTitle("Desactivar micrófono"));
    await avanzar(50);
    fireEvent.click(screen.getByTitle("Activar micrófono"));
    await avanzar(100);
    await act(async () => { contestarPrimero([microViejo]); await vi.advanceTimersByTimeAsync(10); });
    expect(microViejo.stop).toHaveBeenCalled();
    expect(microNuevo.stop).not.toHaveBeenCalled();
  });

  it("⚠️ prender la cámara la abre UNA vez (antes, al conocer el aparato, se reabría)", async () => {
    createLocalTracks.mockImplementation(async () => conPermiso());
    render(<PreJoinLobby {...props} />);
    prenderCamara();
    await avanzar(500);
    // Que PUEDA fallar: tiene que haber llegado a listar los aparatos con permiso,
    // que es lo que antes reabría la cámara.
    expect(navigator.mediaDevices.enumerateDevices).toHaveBeenCalled();
    expect(createLocalTracks).toHaveBeenCalledTimes(1);
  });

  it("⚠️ apagar la cámara con un fondo elegido suelta el motor del fondo", async () => {
    // Antes se reutilizaba entre pistas: cada apagar/prender dejaba otro
    // segmentador y otro contexto de WebGL colgados.
    guardarFondo("blur");
    createLocalTracks.mockImplementation(async () => [crearPista()]);
    render(<PreJoinLobby {...props} />);
    prenderCamara();
    await avanzar(200);
    expect(procesadores.length).toBe(1);
    apagarCamara();
    await avanzar(200);
    expect(procesadores[0].destroy).toHaveBeenCalled();
  });

  it("⚠️ un encendido viejo que contesta tarde no deja la cámara prendida por fuera", async () => {
    let contestarPrimero: (v: unknown) => void = () => {};
    const primera = crearPista();
    const segunda = crearPista();
    createLocalTracks
      .mockImplementationOnce(() => new Promise((r) => { contestarPrimero = r; }))
      .mockImplementationOnce(async () => [segunda]);
    render(<PreJoinLobby {...props} />);
    prenderCamara();
    await avanzar(50);
    apagarCamara();
    await avanzar(50);
    prenderCamara();
    await avanzar(200);
    await act(async () => { contestarPrimero([primera]); await vi.advanceTimersByTimeAsync(10); });
    expect(primera.stop).toHaveBeenCalled();
    expect(segunda.stop).not.toHaveBeenCalled();
  });
});
