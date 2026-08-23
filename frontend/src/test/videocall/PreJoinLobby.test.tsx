import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock livekit-client
vi.mock("livekit-client", () => ({
  createLocalTracks: vi.fn().mockRejectedValue(new Error("mocked")),
  LocalAudioTrack: vi.fn(),
  LocalVideoTrack: vi.fn(),
}));

// Mock track-processors
vi.mock("@livekit/track-processors", () => ({
  BackgroundProcessor: vi.fn().mockReturnValue({
    switchTo: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
  }),
  supportsBackgroundProcessors: vi.fn().mockReturnValue(true),
}));

import PreJoinLobby from "@/pages/messenger/videocall/PreJoinLobby";

describe("PreJoinLobby", () => {
  const defaultProps = {
    roomName: "test-room",
    displayName: "Juan Pérez",
    callDisplayName: "Daily Standup",
    onJoin: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not render the call display name (hidden by design)", () => {
    render(<PreJoinLobby {...defaultProps} />);
    expect(screen.queryByText("Daily Standup")).not.toBeInTheDocument();
  });

  it("renders the user display name", () => {
    render(<PreJoinLobby {...defaultProps} />);
    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
  });

  it("renders the '¿Listo para unirte?' heading", () => {
    render(<PreJoinLobby {...defaultProps} />);
    expect(screen.getByText("¿Listo para unirte?")).toBeInTheDocument();
  });

  it("renders 'Unirse ahora' join button", () => {
    render(<PreJoinLobby {...defaultProps} />);
    expect(screen.getByText("Unirse ahora")).toBeInTheDocument();
  });

  it("shows avatar initials when camera is off (default)", () => {
    render(<PreJoinLobby {...defaultProps} />);
    // Sin foto ni muñequito elegido, UserAvatar cae a las iniciales.
    expect(screen.getByText("JP")).toBeInTheDocument();
  });

  it("toggles microphone button (starts OFF)", () => {
    render(<PreJoinLobby {...defaultProps} />);
    // Mic starts OFF
    const micBtn = screen.getByTitle("Activar micrófono");
    fireEvent.click(micBtn);
    expect(screen.getByTitle("Desactivar micrófono")).toBeInTheDocument();
  });

  it("toggles camera button (starts OFF)", () => {
    render(<PreJoinLobby {...defaultProps} />);
    // Cam starts OFF
    const camBtn = screen.getByTitle("Activar cámara");
    fireEvent.click(camBtn);
    expect(screen.getByTitle("Desactivar cámara")).toBeInTheDocument();
  });

  it("shows background selector button", () => {
    render(<PreJoinLobby {...defaultProps} />);
    expect(screen.getByTitle("Fondo virtual")).toBeInTheDocument();
  });

  it("shows default background label", () => {
    render(<PreJoinLobby {...defaultProps} />);
    expect(screen.getByText(/Sin fondo virtual/)).toBeInTheDocument();
  });

  it("shows helper text about changing settings during call", () => {
    render(<PreJoinLobby {...defaultProps} />);
    expect(
      screen.getByText("Tu micrófono y cámara se pueden cambiar durante la llamada")
    ).toBeInTheDocument();
  });

  it("calls onJoin when join button is clicked", async () => {
    render(<PreJoinLobby {...defaultProps} />);
    fireEvent.click(screen.getByText("Unirse ahora"));
    await vi.waitFor(() => {
      expect(defaultProps.onJoin).toHaveBeenCalledTimes(1);
    });
  });

  it("passes correct options to onJoin (defaults to mic/cam OFF)", async () => {
    render(<PreJoinLobby {...defaultProps} />);
    fireEvent.click(screen.getByText("Unirse ahora"));
    await vi.waitFor(() => {
      expect(defaultProps.onJoin).toHaveBeenCalledWith(
        expect.objectContaining({ micOn: false, camOn: false, backgroundEffect: "none" })
      );
    });
  });

  it("does not render callDisplayName or roomName (hidden by design)", () => {
    render(<PreJoinLobby {...defaultProps} callDisplayName={undefined} />);
    expect(screen.queryByText("test-room")).not.toBeInTheDocument();
  });

  it("does not render video when camera is off (default state)", () => {
    const { container } = render(<PreJoinLobby {...defaultProps} />);
    expect(container.querySelector("video")).not.toBeInTheDocument();
  });
});
