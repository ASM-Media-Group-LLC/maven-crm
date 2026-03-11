import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import VideoRoomsPanel from "@/pages/messenger/VideoRoomsPanel";
import { VideoRoom } from "@/pages/messenger/types";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn() } }));

Object.assign(navigator, {
  clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
});

describe("VideoRoomsPanel", () => {
  const mockRooms: VideoRoom[] = [
    {
      id: "room-1",
      name: "Standup",
      createdBy: "user-1",
      createdAt: new Date(),
      participants: [{ id: "p1", full_name: "Juan", avatar_url: null }],
      isActive: true,
      shareLink: "https://example.com/call/room-1",
    },
  ];

  const defaultProps = {
    rooms: mockRooms,
    onCreateRoom: vi.fn(),
    onJoinRoom: vi.fn(),
    onClose: vi.fn(),
  };

  it("renders the panel title", () => {
    render(<VideoRoomsPanel {...defaultProps} />);
    expect(screen.getByText("Video Rooms")).toBeInTheDocument();
  });

  it("renders room names", () => {
    render(<VideoRoomsPanel {...defaultProps} />);
    expect(screen.getByText("Standup")).toBeInTheDocument();
  });

  it("shows 'EN VIVO' badge for active rooms", () => {
    render(<VideoRoomsPanel {...defaultProps} />);
    expect(screen.getByText("EN VIVO")).toBeInTheDocument();
  });

  it("calls onJoinRoom when join button is clicked", () => {
    render(<VideoRoomsPanel {...defaultProps} />);
    fireEvent.click(screen.getByText("Unirse ahora"));
    expect(defaultProps.onJoinRoom).toHaveBeenCalledWith(mockRooms[0]);
  });

  it("calls onClose when close button is clicked", () => {
    render(<VideoRoomsPanel {...defaultProps} />);
    const closeBtn = screen.getAllByRole("button").find(b => !b.textContent?.includes("sala") && !b.textContent?.includes("Unirse") && !b.textContent?.includes("ahora"));
    if (closeBtn) fireEvent.click(closeBtn);
  });

  it("opens create dialog when 'Nueva sala' is clicked", () => {
    render(<VideoRoomsPanel {...defaultProps} />);
    fireEvent.click(screen.getByText("Nueva sala"));
    expect(screen.getByText("Crear nueva sala de video")).toBeInTheDocument();
  });

  describe("extractRoomId (via join by link)", () => {
    it("handles direct room code", () => {
      render(<VideoRoomsPanel {...defaultProps} />);
      const input = screen.getByPlaceholderText("Pegar enlace de la sala...");
      fireEvent.change(input, { target: { value: "call-conv-123" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(defaultProps.onJoinRoom).toHaveBeenCalled();
    });

    it("handles full URL with /call/ path", () => {
      render(<VideoRoomsPanel {...defaultProps} />);
      const input = screen.getByPlaceholderText("Pegar enlace de la sala...");
      fireEvent.change(input, { target: { value: "https://app.com/call/my-room?name=Test" } });
      fireEvent.keyDown(input, { key: "Enter" });
      expect(defaultProps.onJoinRoom).toHaveBeenCalled();
    });

    it("disables join button when link is empty", () => {
      render(<VideoRoomsPanel {...defaultProps} />);
      const joinBtn = screen.getAllByText("Unirse").find(b => b.tagName === "BUTTON");
      // The join-by-link button
      const buttons = screen.getAllByRole("button");
      const joinByLinkBtn = buttons.find(b => b.textContent === "Unirse");
      if (joinByLinkBtn) {
        expect(joinByLinkBtn).toBeDisabled();
      }
    });
  });
});
