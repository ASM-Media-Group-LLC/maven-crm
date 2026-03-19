import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ConnectionState } from "livekit-client";

// Default mock state
const makeParticipant = (overrides: Record<string, any> = {}) => ({
  sid: "local-sid",
  identity: "user-1",
  name: "Test User",
  isSpeaking: false,
  isMuted: false,
  isCameraOff: true,
  isScreenSharing: false,
  isLocal: true,
  handRaised: false,
  reactions: [] as string[],
  connectionQuality: "excellent" as string,
  hasVideoTrack: false,
  ...overrides,
});

const defaultLkState = {
  connectionState: ConnectionState.Connected,
  participants: [makeParticipant()],
  activeSpeaker: null,
  isMicOn: true,
  isCamOn: true,
  isScreenSharing: false,
  isHandRaised: false,
  chatMessages: [],
  error: null,
  isReconnecting: false,
  connect: vi.fn(),
  disconnect: vi.fn(),
  toggleMic: vi.fn(),
  toggleCam: vi.fn(),
  toggleScreenShare: vi.fn(),
  toggleHand: vi.fn(),
  sendChatMessage: vi.fn(),
  sendReaction: vi.fn(),
  muteParticipant: vi.fn(),
  removeParticipant: vi.fn(),
  setBackgroundEffect: vi.fn(),
  getRoom: vi.fn().mockReturnValue({ localParticipant: { identity: "user-1" } }),
};

let lkState = { ...defaultLkState };

vi.mock("@/hooks/useLiveKit", () => ({
  useLiveKit: () => lkState,
}));

vi.mock("livekit-client", async () => {
  const actual = await vi.importActual("livekit-client");
  return {
    ...actual,
    ConnectionState: {
      Connecting: "connecting",
      Connected: "connected",
      Disconnected: "disconnected",
      Reconnecting: "reconnecting",
    },
    Track: { Source: { Camera: "camera", ScreenShare: "screen_share", Microphone: "microphone" } },
    Room: vi.fn(),
  };
});

vi.mock("@/pages/messenger/videocall/ParticipantTile", () => ({
  default: ({ participant }: any) => (
    <div data-testid={`participant-${participant.identity}`}>
      {participant.isLocal ? "Tú" : participant.name}
    </div>
  ),
}));

vi.mock("sonner", () => ({ toast: { info: vi.fn(), success: vi.fn() } }));

import LiveKitCallView from "@/pages/messenger/videocall/LiveKitCallView";

describe("LiveKitCallView", () => {
  const defaultProps = {
    roomName: "test-room",
    displayName: "Test User",
    callDisplayName: "My Call",
    isAdmin: false,
    onLeave: vi.fn(),
    initialMicOn: true,
    initialCamOn: true,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    lkState = { ...defaultLkState, connect: vi.fn(), disconnect: vi.fn() };
  });

  it("shows loading spinner when connecting", () => {
    lkState = { ...defaultLkState, connectionState: "connecting" as any };
    const { container } = render(<LiveKitCallView {...defaultProps} />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.getByText("Conectando a la sala...")).toBeInTheDocument();
  });

  it("shows error state with message and back button", () => {
    lkState = { ...defaultLkState, error: "Connection failed" };
    render(<LiveKitCallView {...defaultProps} />);
    expect(screen.getByText("Error de conexión")).toBeInTheDocument();
    expect(screen.getByText("Connection failed")).toBeInTheDocument();
    expect(screen.getByText("Volver")).toBeInTheDocument();
  });

  it("renders call top bar (room name hidden by design)", () => {
    lkState = { ...defaultLkState };
    render(<LiveKitCallView {...defaultProps} />);
    // Room name is hidden; just verify top bar renders with timer
    expect(screen.getByText("00:00")).toBeInTheDocument();
  });

  it("renders call controls with leave button", () => {
    lkState = { ...defaultLkState };
    render(<LiveKitCallView {...defaultProps} />);
    expect(screen.getByText("Salir")).toBeInTheDocument();
  });

  it("shows waiting message when alone", () => {
    lkState = { ...defaultLkState };
    render(<LiveKitCallView {...defaultProps} />);
    expect(screen.getByText("Esperando a que otros participantes se unan...")).toBeInTheDocument();
  });

  it("does NOT show waiting message with multiple participants", () => {
    lkState = {
      ...defaultLkState,
      participants: [
        makeParticipant(),
        makeParticipant({ sid: "remote-sid", identity: "user-2", name: "Remote User", isLocal: false, connectionQuality: "good" }),
      ],
    };
    render(<LiveKitCallView {...defaultProps} />);
    expect(screen.queryByText("Esperando a que otros participantes se unan...")).not.toBeInTheDocument();
  });

  it("shows reconnecting banner", () => {
    lkState = { ...defaultLkState, isReconnecting: true };
    render(<LiveKitCallView {...defaultProps} />);
    expect(screen.getByText("Reconectando...")).toBeInTheDocument();
  });

  it("does NOT show reconnecting banner when connected normally", () => {
    lkState = { ...defaultLkState, isReconnecting: false };
    render(<LiveKitCallView {...defaultProps} />);
    expect(screen.queryByText("Reconectando...")).not.toBeInTheDocument();
  });

  it("renders participant tiles", () => {
    lkState = { ...defaultLkState };
    render(<LiveKitCallView {...defaultProps} />);
    // Local participant should show "Tú" label
    expect(screen.getByText("Tú")).toBeInTheDocument();
  });

  it("calls connect on mount with correct args", () => {
    lkState = { ...defaultLkState };
    render(<LiveKitCallView {...defaultProps} />);
    expect(lkState.connect).toHaveBeenCalledWith(
      "test-room",
      "Test User",
      false,
      expect.objectContaining({ initialMicOn: true, initialCamOn: true })
    );
  });

  it("calls disconnect on unmount", () => {
    lkState = { ...defaultLkState };
    const { unmount } = render(<LiveKitCallView {...defaultProps} />);
    unmount();
    expect(lkState.disconnect).toHaveBeenCalled();
  });
});
