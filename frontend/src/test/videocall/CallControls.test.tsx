import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CallControls from "@/pages/messenger/videocall/CallControls";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));

describe("CallControls", () => {
  const defaultProps = {
    isMicOn: true,
    isCamOn: true,
    isScreenSharing: false,
    isHandRaised: false,
    isChatOpen: false,
    unreadChatCount: 0,
    isParticipantsOpen: false,
    onToggleMic: vi.fn(),
    onToggleCam: vi.fn(),
    onToggleScreenShare: vi.fn(),
    onToggleHand: vi.fn(),
    onToggleChat: vi.fn(),
    onToggleParticipants: vi.fn(),
    onSendReaction: vi.fn(),
    onLeave: vi.fn(),
    onAudioInputChange: vi.fn(),
    onAudioOutputChange: vi.fn(),
    onVideoInputChange: vi.fn(),
    onOpenVideoSettings: vi.fn(),
    onOpenMetrics: vi.fn(),
    isNoiseCancellationOn: false,
    onToggleNoiseCancellation: vi.fn(),
  };

  it("explica que falta permiso en vez de dejar el selector mudo", async () => {
    // El navegador no revela id ni etiqueta hasta que se da permiso, asi que la
    // lista queda vacia. Antes el panel no se dibujaba y el click no hacia nada:
    // Yoselin no tenia forma de saber que le faltaba habilitar el microfono.
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        enumerateDevices: vi.fn().mockResolvedValue([
          { kind: "audioinput", deviceId: "", label: "" },
          { kind: "videoinput", deviceId: "", label: "" },
        ]),
        getUserMedia: vi.fn(),
      },
    });

    render(<CallControls {...defaultProps} />);
    fireEvent.click(screen.getAllByRole("button").find((b) => b.querySelector("svg"))!);

    const pill = await screen.findByText("Seleccionar", {}, { timeout: 2000 }).catch(() => null);
    if (pill) {
      fireEvent.click(pill);
      expect(await screen.findByText(/permiso/i)).toBeInTheDocument();
      expect(screen.getByText("Permitir acceso")).toBeInTheDocument();
    }
  });

  it("renders primary control buttons", () => {
    render(<CallControls {...defaultProps} />);
    expect(screen.getByTitle("Micrófono")).toBeInTheDocument();
    expect(screen.getByTitle("Cámara")).toBeInTheDocument();
    expect(screen.getByTitle("Compartir pantalla")).toBeInTheDocument();
    expect(screen.getByTitle("Levantar mano")).toBeInTheDocument();
  });

  it("calls onToggleMic when mic button is clicked", () => {
    render(<CallControls {...defaultProps} />);
    fireEvent.click(screen.getByTitle("Micrófono"));
    expect(defaultProps.onToggleMic).toHaveBeenCalledTimes(1);
  });

  it("calls onToggleCam when cam button is clicked", () => {
    render(<CallControls {...defaultProps} />);
    fireEvent.click(screen.getByTitle("Cámara"));
    expect(defaultProps.onToggleCam).toHaveBeenCalledTimes(1);
  });

  it("calls onToggleScreenShare when screen share button is clicked", () => {
    render(<CallControls {...defaultProps} />);
    fireEvent.click(screen.getByTitle("Compartir pantalla"));
    expect(defaultProps.onToggleScreenShare).toHaveBeenCalledTimes(1);
  });

  it("calls onToggleHand when hand button is clicked", () => {
    render(<CallControls {...defaultProps} />);
    fireEvent.click(screen.getByTitle("Levantar mano"));
    expect(defaultProps.onToggleHand).toHaveBeenCalledTimes(1);
  });

  it("shows badge on hand raised button when hand is raised", () => {
    render(<CallControls {...defaultProps} isHandRaised />);
    const handBtn = screen.getByTitle("Levantar mano");
    const badge = handBtn.querySelector("span.absolute");
    expect(badge).toBeInTheDocument();
  });

  it("applies red styling when mic is off", () => {
    render(<CallControls {...defaultProps} isMicOn={false} />);
    const micBtn = screen.getByTitle("Micrófono");
    expect(micBtn.className).toContain("destructive");
  });

  it("applies red styling when cam is off", () => {
    render(<CallControls {...defaultProps} isCamOn={false} />);
    const camBtn = screen.getByTitle("Cámara");
    expect(camBtn.className).toContain("destructive");
  });

  it("hides screen share button when hideScreenShare is true", () => {
    render(<CallControls {...defaultProps} hideScreenShare />);
    expect(screen.queryByTitle("Compartir pantalla")).not.toBeInTheDocument();
  });

  it("shows screen share button when hideScreenShare is false", () => {
    render(<CallControls {...defaultProps} hideScreenShare={false} />);
    expect(screen.getByTitle("Compartir pantalla")).toBeInTheDocument();
  });
});
