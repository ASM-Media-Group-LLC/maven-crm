import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock livekit-client
vi.mock("livekit-client", () => ({
  Room: vi.fn().mockImplementation(() => ({
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn(),
    on: vi.fn().mockReturnThis(),
    localParticipant: {
      identity: "user-1",
      name: "Test User",
      sid: "sid-local",
      isSpeaking: false,
      isMicrophoneEnabled: true,
      isCameraEnabled: true,
      audioTrackPublications: new Map(),
      videoTrackPublications: new Map(),
      connectionQuality: 3,
      setMicrophoneEnabled: vi.fn().mockResolvedValue(undefined),
      setCameraEnabled: vi.fn().mockResolvedValue(undefined),
      setScreenShareEnabled: vi.fn().mockResolvedValue(undefined),
      publishData: vi.fn(),
      permissions: { canPublish: true, canSubscribe: true },
      metadata: '{"isAdmin":false}',
    },
    remoteParticipants: new Map(),
    startAudio: vi.fn().mockResolvedValue(undefined),
    canPlaybackAudio: true,
  })),
  RoomEvent: {
    ConnectionStateChanged: "connectionStateChanged",
    ParticipantConnected: "participantConnected",
    ParticipantDisconnected: "participantDisconnected",
    TrackSubscribed: "trackSubscribed",
    TrackUnsubscribed: "trackUnsubscribed",
    TrackPublished: "trackPublished",
    TrackMuted: "trackMuted",
    TrackUnmuted: "trackUnmuted",
    LocalTrackPublished: "localTrackPublished",
    LocalTrackUnpublished: "localTrackUnpublished",
    ActiveSpeakersChanged: "activeSpeakersChanged",
    DataReceived: "dataReceived",
    Disconnected: "disconnected",
    AudioPlaybackStatusChanged: "audioPlaybackStatusChanged",
    ConnectionQualityChanged: "connectionQualityChanged",
    Reconnecting: "reconnecting",
    Reconnected: "reconnected",
  },
  Track: { Source: { Camera: "camera", Microphone: "microphone", ScreenShare: "screen_share" } },
  ConnectionState: { Disconnected: "disconnected", Connecting: "connecting", Connected: "connected" },
  VideoPresets: { h1080: { resolution: { width: 1920, height: 1080 } }, h720: { resolution: { width: 1280, height: 720 } }, h180: {}, h360: {} },
  // useLiveKit lo lee al importar, para el perfil de la pantalla compartida.
  ScreenSharePresets: { h360fps3: { width: 640, height: 360, encoding: { maxBitrate: 200000, maxFramerate: 3 } } },
  ConnectionQuality: { Excellent: 3, Good: 2, Poor: 1, Lost: 0, Unknown: -1 },
  createLocalTracks: vi.fn().mockResolvedValue([]),
  LocalAudioTrack: vi.fn(),
  LocalVideoTrack: vi.fn(),
}));

vi.mock("@livekit/track-processors", () => ({
  BackgroundProcessor: vi.fn().mockReturnValue({
    switchTo: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
  }),
  supportsBackgroundProcessors: vi.fn().mockReturnValue(true),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: vi.fn().mockResolvedValue({
        data: { token: "mock-token", url: "wss://mock.livekit.cloud" },
        error: null,
      }),
    },
  },
}));

vi.mock("@/pages/messenger/videocall/BackgroundSelector", () => ({
  BACKGROUND_TEMPLATES: [
    { id: "tpl-office", label: "Oficina", src: "/backgrounds/bg-office.jpg" },
  ],
}));

import { useLiveKit, LKParticipant, LKChatMessage, ConnectionQualityLevel } from "@/hooks/useLiveKit";
import { renderHook, act } from "@testing-library/react";

describe("useLiveKit hook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("initializes with correct default state", () => {
    const { result } = renderHook(() => useLiveKit());

    expect(result.current.connectionState).toBe("disconnected");
    expect(result.current.participants).toEqual([]);
    expect(result.current.chatMessages).toEqual([]);
    expect(result.current.isMicOn).toBe(true);
    expect(result.current.isCamOn).toBe(true);
    expect(result.current.isScreenSharing).toBe(false);
    expect(result.current.isHandRaised).toBe(false);
    expect(result.current.activeSpeaker).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.isReconnecting).toBe(false);
  });

  it("exports all required functions", () => {
    const { result } = renderHook(() => useLiveKit());

    expect(typeof result.current.connect).toBe("function");
    expect(typeof result.current.disconnect).toBe("function");
    expect(typeof result.current.toggleMic).toBe("function");
    expect(typeof result.current.toggleCam).toBe("function");
    expect(typeof result.current.toggleScreenShare).toBe("function");
    expect(typeof result.current.toggleHand).toBe("function");
    expect(typeof result.current.sendReaction).toBe("function");
    expect(typeof result.current.sendChatMessage).toBe("function");
    expect(typeof result.current.muteParticipant).toBe("function");
    expect(typeof result.current.removeParticipant).toBe("function");
    expect(typeof result.current.getRoom).toBe("function");
    expect(typeof result.current.setBackgroundEffect).toBe("function");
  });

  it("getRoom returns null when disconnected", () => {
    const { result } = renderHook(() => useLiveKit());
    expect(result.current.getRoom()).toBeNull();
  });

  it("disconnect resets all state", () => {
    const { result } = renderHook(() => useLiveKit());

    act(() => {
      result.current.disconnect();
    });

    expect(result.current.participants).toEqual([]);
    expect(result.current.chatMessages).toEqual([]);
    expect(result.current.isScreenSharing).toBe(false);
    expect(result.current.isHandRaised).toBe(false);
    expect(result.current.isReconnecting).toBe(false);
    expect(result.current.activeSpeaker).toBeNull();
    expect(result.current.connectionState).toBe("disconnected");
  });
});

describe("LKParticipant type", () => {
  it("has correct shape", () => {
    const participant: LKParticipant = {
      sid: "sid-1",
      identity: "user-1",
      name: "Test User",
      isSpeaking: false,
      isMuted: false,
      isCameraOff: false,
      isScreenSharing: false,
      isLocal: true,
      handRaised: false,
      reactions: [],
      connectionQuality: "excellent",
      hasVideoTrack: false,
    };

    expect(participant.sid).toBe("sid-1");
    expect(participant.reactions).toEqual([]);
  });
});

describe("ConnectionQualityLevel type", () => {
  it("covers all expected levels", () => {
    const levels: ConnectionQualityLevel[] = ["excellent", "good", "poor", "lost", "unknown"];
    expect(levels).toHaveLength(5);
  });
});

describe("LKChatMessage type", () => {
  it("has correct shape", () => {
    const msg: LKChatMessage = {
      id: "msg-1",
      sender: "user-1",
      senderName: "Test",
      content: "Hello",
      timestamp: Date.now(),
    };
    expect(msg.content).toBe("Hello");
  });
});
