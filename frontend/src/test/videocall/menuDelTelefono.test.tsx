import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import CallControls from "@/pages/messenger/videocall/CallControls";

vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));

// En un teléfono, la llamada se dibuja en MODO COMPACTO — el que se inventó
// para la ventanita flotante de 340px. Ese modo no trae selector de cámara, ni
// de micrófono, ni de altavoz, ni fondos: se usa con mouse y no hacen falta.
// Pero en un teléfono el mismo modo se enciende por tamaño de pantalla, y ahí
// se lleva puesto lo más básico: pasar a la cámara TRASERA.
//
// El menú "Más opciones" repone todo eso sin agregar ni un botón a la fila
// (ocupa el lugar del de métricas, que pasa a ser una fila adentro).

const CAMARAS = [
  { deviceId: "cam-frontal", kind: "videoinput", label: "Cámara frontal" },
  { deviceId: "cam-trasera", kind: "videoinput", label: "Cámara trasera" },
];

const props = {
  isMicOn: true, isCamOn: true, isScreenSharing: false, isHandRaised: false,
  isChatOpen: false, unreadChatCount: 0, isParticipantsOpen: false,
  onToggleMic: vi.fn(), onToggleCam: vi.fn(), onToggleScreenShare: vi.fn(),
  onToggleHand: vi.fn(), onToggleChat: vi.fn(), onToggleParticipants: vi.fn(),
  onSendReaction: vi.fn(), onLeave: vi.fn(),
  onAudioInputChange: vi.fn(), onAudioOutputChange: vi.fn(), onVideoInputChange: vi.fn(),
  onOpenVideoSettings: vi.fn(), onOpenMetrics: vi.fn(), onOpenAdjustView: vi.fn(),
  estadoNC: "activa" as const,
};

const abrirMenu = async () => {
  const boton = await screen.findByTitle("Más opciones");
  fireEvent.click(boton);
  await screen.findByText("Girar cámara");
};

// Radix necesita estas tres cosas que jsdom no trae; sin ellas el panel no se
// monta y el test parece decir "el menú no funciona" cuando en realidad no se
// llegó a abrir. El test que ya existía en CallControls.test.tsx lo esquivaba
// con un `.catch(() => null)`, o sea que nunca llegó a probar el contenido.
beforeAll(() => {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe() {} unobserve() {} disconnect() {}
  };
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => {};
  Element.prototype.releasePointerCapture = () => {};
});

beforeEach(() => {
  vi.clearAllMocks();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { enumerateDevices: vi.fn().mockResolvedValue(CAMARAS) },
  });
});
afterEach(cleanup);

describe("el menú del teléfono", () => {
  it("en la ventanita flotante NO aparece: ahí se usa con mouse", () => {
    render(<CallControls {...props} compact />);
    expect(screen.queryByTitle("Más opciones")).toBeNull();
    // Y métricas sigue siendo un botón directo, como siempre.
    expect(screen.getByTitle("Métricas")).toBeTruthy();
  });

  it("en escritorio tampoco", () => {
    render(<CallControls {...props} />);
    expect(screen.queryByTitle("Más opciones")).toBeNull();
  });

  it("en el teléfono sí, y no agrega un botón: reemplaza al de métricas", async () => {
    render(<CallControls {...props} compact tactil />);
    expect(await screen.findByTitle("Más opciones")).toBeTruthy();
    // Métricas no se pierde: pasa a ser una fila adentro del panel.
    expect(screen.queryByTitle("Métricas")).toBeNull();
    await abrirMenu();
    expect(screen.getByText("Métricas")).toBeTruthy();
  });

  // EL CASO QUE MOTIVÓ TODO: en un teléfono hay que poder pasar a la trasera.
  //
  // Y ojo con el índice: casi ningún caller pasa `initialVideoDeviceId`, así
  // que lo normal es que NO haya cámara elegida. Con `findIndex` eso da -1, y
  // `(-1 + 1) % 2` da 0 — o sea la MISMA cámara que ya está en uso. El primer
  // toque no hacía nada y había que tocar dos veces.
  it("girar cámara pasa a la trasera al PRIMER toque, sin cámara elegida", async () => {
    render(<CallControls {...props} compact tactil />);
    await abrirMenu();
    fireEvent.click(screen.getByText("Girar cámara"));
    expect(props.onVideoInputChange).toHaveBeenCalledWith("cam-trasera");
  });

  it("y si ya estaba en la trasera, vuelve a la frontal", async () => {
    render(<CallControls {...props} compact tactil currentVideoInputId="cam-trasera" />);
    await abrirMenu();
    fireEvent.click(screen.getByText("Girar cámara"));
    expect(props.onVideoInputChange).toHaveBeenCalledWith("cam-frontal");
  });

  it("con una sola cámara no ofrece girarla", async () => {
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { enumerateDevices: vi.fn().mockResolvedValue([CAMARAS[0]]) },
    });
    render(<CallControls {...props} compact tactil />);
    fireEvent.click(await screen.findByTitle("Más opciones"));
    await screen.findByText("Fondos y efectos");
    expect(screen.queryByText("Girar cámara")).toBeNull();
  });

  it("desde el menú se llega a fondos, a ajustar vista y a métricas", async () => {
    render(<CallControls {...props} compact tactil />);
    await abrirMenu();
    fireEvent.click(screen.getByText("Ajustar vista"));
    expect(props.onOpenAdjustView).toHaveBeenCalled();

    await abrirMenu();
    fireEvent.click(screen.getByText("Fondos y efectos"));
    expect(props.onOpenVideoSettings).toHaveBeenCalled();

    await abrirMenu();
    fireEvent.click(screen.getByText("Métricas"));
    expect(props.onOpenMetrics).toHaveBeenCalled();
  });

  // Si no se cerrara, el panel queda tapando justo el video que se fue a
  // ajustar — en un teléfono ocupa media pantalla.
  it("elegir algo cierra el menú", async () => {
    render(<CallControls {...props} compact tactil />);
    await abrirMenu();
    fireEvent.click(screen.getByText("Girar cámara"));
    await waitFor(() => expect(screen.queryByText("Girar cámara")).toBeNull());
  });

  it("lista las cámaras para elegir una puntual", async () => {
    render(<CallControls {...props} compact tactil />);
    await abrirMenu();
    await waitFor(() => expect(screen.getByText("Cámara trasera")).toBeTruthy());
    fireEvent.click(screen.getByText("Cámara trasera"));
    expect(props.onVideoInputChange).toHaveBeenCalledWith("cam-trasera");
  });
});
