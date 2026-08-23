import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import ParticipantTile from "@/pages/messenger/videocall/ParticipantTile";
import type { LKParticipant } from "@/hooks/useLiveKit";

// Mock livekit-client
vi.mock("livekit-client", () => ({
  Track: { Source: { Camera: "camera", ScreenShare: "screen_share", Microphone: "microphone" } },
  Room: vi.fn(),
}));

function makeMockParticipant(overrides: Partial<LKParticipant> = {}): LKParticipant {
  return {
    sid: "sid-1",
    identity: "user-1",
    name: "Juan Pérez",
    isSpeaking: false,
    isMuted: false,
    isCameraOff: true,
    isScreenSharing: false,
    isLocal: false,
    handRaised: false,
    reactions: [],
    connectionQuality: "excellent",
    hasVideoTrack: false,
    ...overrides,
  };
}

describe("ParticipantTile", () => {
  it("renders participant name when remote", () => {
    render(<ParticipantTile participant={makeMockParticipant()} room={null} />);
    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
  });

  it("renders 'Tú' when local participant", () => {
    render(<ParticipantTile participant={makeMockParticipant({ isLocal: true })} room={null} />);
    expect(screen.getByText("Tú")).toBeInTheDocument();
  });

  it("shows avatar (muñequito determinista) when camera is off", () => {
    render(<ParticipantTile participant={makeMockParticipant({ isCameraOff: true })} room={null} />);
    // Con cámara apagada cae al UserAvatar: muñequito DiceBear por seed
    // (identity), renderizado como <img> con el nombre en el alt.
    const img = screen.getByAltText("Juan Pérez") as HTMLImageElement;
    expect(img.src.startsWith("data:image/svg+xml")).toBe(true);
  });

  it("renders video element when camera is on", () => {
    const { container } = render(
      <ParticipantTile participant={makeMockParticipant({ isCameraOff: false })} room={null} />
    );
    expect(container.querySelector("video")).toBeInTheDocument();
  });

  it("does NOT render video when camera is off", () => {
    const { container } = render(
      <ParticipantTile participant={makeMockParticipant({ isCameraOff: true })} room={null} />
    );
    expect(container.querySelector("video")).not.toBeInTheDocument();
  });

  it("renders audio element for remote participants only", () => {
    const { container } = render(
      <ParticipantTile participant={makeMockParticipant({ isLocal: false })} room={null} />
    );
    expect(container.querySelector("audio")).toBeInTheDocument();
  });

  it("does NOT render audio element for local participant", () => {
    const { container } = render(
      <ParticipantTile participant={makeMockParticipant({ isLocal: true })} room={null} />
    );
    expect(container.querySelector("audio")).not.toBeInTheDocument();
  });

  it("shows muted icon when participant is muted", () => {
    const { container } = render(
      <ParticipantTile participant={makeMockParticipant({ isMuted: true })} room={null} />
    );
    // MicOff icon should be present
    const micOff = container.querySelector("svg");
    expect(micOff).toBeInTheDocument();
  });

  it("applies speaking ring when participant is speaking", () => {
    const { container } = render(
      <ParticipantTile participant={makeMockParticipant({ isSpeaking: true })} room={null} />
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain("ring-2");
  });

  it("does NOT apply speaking ring when not speaking", () => {
    const { container } = render(
      <ParticipantTile participant={makeMockParticipant({ isSpeaking: false })} room={null} />
    );
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).not.toContain("ring-2");
  });

  it("shows hand raised indicator", () => {
    const { container } = render(
      <ParticipantTile participant={makeMockParticipant({ handRaised: true })} room={null} />
    );
    // Hand icon in amber container with animate-pulse
    const handContainer = container.querySelector(".animate-pulse");
    expect(handContainer).toBeInTheDocument();
  });

  it("shows reactions when present", () => {
    render(
      <ParticipantTile participant={makeMockParticipant({ reactions: ["🎉", "👏"] })} room={null} />
    );
    expect(screen.getByText("🎉")).toBeInTheDocument();
    expect(screen.getByText("👏")).toBeInTheDocument();
  });

  it("shows screen sharing badge", () => {
    render(
      <ParticipantTile
        participant={makeMockParticipant({ isScreenSharing: true, isCameraOff: false })}
        room={null}
      />
    );
    expect(screen.getByText("Compartiendo pantalla")).toBeInTheDocument();
  });

  it("mirrors video for local camera (not screen share)", () => {
    const { container } = render(
      <ParticipantTile
        participant={makeMockParticipant({ isLocal: true, isCameraOff: false, isScreenSharing: false })}
        room={null}
      />
    );
    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video.style.transform).toBe("scaleX(-1)");
  });

  it("does NOT mirror video for screen share", () => {
    const { container } = render(
      <ParticipantTile
        participant={makeMockParticipant({ isLocal: true, isCameraOff: false, isScreenSharing: true })}
        room={null}
      />
    );
    const video = container.querySelector("video") as HTMLVideoElement;
    expect(video.style.transform).toBeFalsy();
  });

  it("shows connection quality indicator bars", () => {
    const { container } = render(
      <ParticipantTile participant={makeMockParticipant({ connectionQuality: "good" })} room={null} />
    );
    // Should have 3 bar divs in the connection indicator
    const bars = container.querySelectorAll('[title="Calidad: good"] > div');
    expect(bars.length).toBe(3);
  });

  it("shows WifiOff icon for lost connection", () => {
    const { container } = render(
      <ParticipantTile participant={makeMockParticipant({ connectionQuality: "lost" })} room={null} />
    );
    expect(container.querySelector('[title="Conexión perdida"]')).toBeInTheDocument();
  });

  it("uses large avatar when large prop is true and camera off", () => {
    const { container } = render(
      <ParticipantTile participant={makeMockParticipant({ isCameraOff: true })} room={null} large />
    );
    const avatar = container.querySelector(".h-24");
    expect(avatar).toBeInTheDocument();
  });

  it("uses standard avatar when large prop is false and camera off", () => {
    const { container } = render(
      <ParticipantTile participant={makeMockParticipant({ isCameraOff: true })} room={null} />
    );
    const avatar = container.querySelector(".h-16");
    expect(avatar).toBeInTheDocument();
  });
});
