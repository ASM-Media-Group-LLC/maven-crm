import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CallControls from "@/pages/messenger/videocall/CallControls";
import BackgroundSelector from "@/pages/messenger/videocall/BackgroundSelector";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));

const props = {
  isMicOn: true, isCamOn: true, isScreenSharing: false, isHandRaised: false,
  isChatOpen: false, unreadChatCount: 0, isParticipantsOpen: false,
  onToggleMic: vi.fn(), onToggleCam: vi.fn(), onToggleScreenShare: vi.fn(),
  onToggleHand: vi.fn(), onToggleChat: vi.fn(), onToggleParticipants: vi.fn(),
  onSendReaction: vi.fn(), onLeave: vi.fn(), onAudioInputChange: vi.fn(),
  onAudioOutputChange: vi.fn(), onVideoInputChange: vi.fn(),
  onOpenVideoSettings: vi.fn(), onOpenMetrics: vi.fn(),
  isNoiseCancellationOn: false, onToggleNoiseCancellation: vi.fn(),
  onToggleBlurBackground: vi.fn(),
};

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, "mediaDevices", {
    configurable: true,
    value: { enumerateDevices: vi.fn().mockResolvedValue([]), getUserMedia: vi.fn() },
  });
});

/** La fila "Difuminar fondo" del menú del teléfono, con su estado activo. */
function filaDifuminar(): HTMLElement {
  const fila = screen.getAllByRole("button").find((b) => b.textContent?.includes("Difuminar fondo"));
  if (!fila) throw new Error("no se encontró la fila de difuminar");
  return fila;
}

describe("el botón de difuminar no miente con el nivel fuerte", () => {
  // Antes comparaba contra el literal "blur", así que con el nivel fuerte
  // encendido el botón se veía APAGADO: la persona lo tocaba creyendo que lo
  // prendía y en realidad lo apagaba.
  it("con blur fuerte, el menú marca difuminar como activo", async () => {
    render(<CallControls {...props} compact tactil backgroundEffect="blur-strong" />);
    fireEvent.click(await screen.findByTitle("Más opciones"));
    expect(filaDifuminar().className).toMatch(/primary/);
  });

  it("sin efecto, no lo marca", async () => {
    render(<CallControls {...props} compact tactil backgroundEffect="none" />);
    fireEvent.click(await screen.findByTitle("Más opciones"));
    expect(filaDifuminar().className).not.toMatch(/primary/);
  });
});

describe("el selector ofrece los dos niveles", () => {
  it("dibuja 'Difuminar' y 'Difuminar más' como opciones distintas", () => {
    const onSelect = vi.fn();
    render(<BackgroundSelector selected="none" onSelect={onSelect} />);
    fireEvent.click(screen.getByTitle("Fondo virtual"));
    expect(screen.getByText("Difuminar")).toBeInTheDocument();
    expect(screen.getByText("Difuminar más")).toBeInTheDocument();
  });

  it("elegir el nivel fuerte avisa con su propio valor, no con 'blur'", () => {
    const onSelect = vi.fn();
    render(<BackgroundSelector selected="none" onSelect={onSelect} />);
    fireEvent.click(screen.getByTitle("Fondo virtual"));
    fireEvent.click(screen.getByText("Difuminar más"));
    expect(onSelect).toHaveBeenCalledWith("blur-strong");
  });
});
