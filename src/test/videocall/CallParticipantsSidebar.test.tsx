import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CallParticipantsSidebar from "@/pages/messenger/videocall/CallParticipantsSidebar";
import { LKParticipant } from "@/hooks/useLiveKit";

describe("CallParticipantsSidebar", () => {
  const mockParticipants: LKParticipant[] = [
    { sid: "s1", identity: "user-1", name: "Yo", isSpeaking: false, isMuted: false, isCameraOff: false, isScreenSharing: false, isLocal: true, handRaised: false, reactions: [], connectionQuality: "excellent" },
    { sid: "s2", identity: "user-2", name: "Juan Pérez", isSpeaking: true, isMuted: false, isCameraOff: false, isScreenSharing: false, isLocal: false, handRaised: false, reactions: [], connectionQuality: "good" },
    { sid: "s3", identity: "user-3", name: "María López", isSpeaking: false, isMuted: true, isCameraOff: true, isScreenSharing: false, isLocal: false, handRaised: true, reactions: [], connectionQuality: "poor" },
  ];

  const defaultProps = {
    participants: mockParticipants,
    isAdmin: false,
    onMuteParticipant: vi.fn(),
    onRemoveParticipant: vi.fn(),
    onClose: vi.fn(),
  };

  it("renders participant count", () => {
    render(<CallParticipantsSidebar {...defaultProps} />);
    expect(screen.getByText("Participantes (3)")).toBeInTheDocument();
  });

  it("shows local participant as 'Tú'", () => {
    render(<CallParticipantsSidebar {...defaultProps} />);
    expect(screen.getByText("Tú")).toBeInTheDocument();
  });

  it("shows remote participant names", () => {
    render(<CallParticipantsSidebar {...defaultProps} />);
    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByText("María López")).toBeInTheDocument();
  });

  it("does not show moderation menu when not admin", () => {
    render(<CallParticipantsSidebar {...defaultProps} isAdmin={false} />);
    // Should not have any MoreVertical buttons
    const moreButtons = screen.queryAllByRole("button").filter(
      btn => btn.querySelector('[class*="lucide-more-vertical"]')
    );
    // Only the close button should exist
    expect(screen.getAllByRole("button")).toHaveLength(1); // just close
  });

  it("shows moderation menu when admin", () => {
    render(<CallParticipantsSidebar {...defaultProps} isAdmin={true} />);
    // Should have moderation buttons for non-local participants
    const buttons = screen.getAllByRole("button");
    // Close + 2 moderation dropdowns (for 2 remote participants)
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });

  it("sorts hand-raised participants first (after local)", () => {
    const { container } = render(<CallParticipantsSidebar {...defaultProps} />);
    const names = container.querySelectorAll("span.truncate");
    // Local first, then hand-raised (María), then Juan
    const nameTexts = Array.from(names).map(n => n.textContent);
    expect(nameTexts[0]).toBe("Tú");
    expect(nameTexts[1]).toBe("María López"); // hand raised
    expect(nameTexts[2]).toBe("Juan Pérez");
  });

  it("calls onClose when close button is clicked", () => {
    render(<CallParticipantsSidebar {...defaultProps} />);
    // Find close button (only non-admin button when not admin)
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });
});
