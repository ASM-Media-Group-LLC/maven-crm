import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CallTopBar from "@/pages/messenger/videocall/CallTopBar";

// Mock sonner
vi.mock("sonner", () => ({ toast: { success: vi.fn(), info: vi.fn(), error: vi.fn() } }));

// Mock clipboard
Object.assign(navigator, {
  clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
});

describe("CallTopBar", () => {
  const defaultProps = {
    roomName: "Reunión de equipo",
    participantCount: 3,
    onOpenAdjustView: vi.fn(),
    shareLink: "https://example.com/call/test-room",
  };

  it("renders room name", () => {
    render(<CallTopBar {...defaultProps} />);
    expect(screen.getByText("Reunión de equipo")).toBeInTheDocument();
  });

  it("hides share link when hideShareLink is true", () => {
    render(<CallTopBar {...defaultProps} hideShareLink />);
    expect(screen.queryByText("Copiar enlace")).not.toBeInTheDocument();
  });

  it("renders participant count", () => {
    render(<CallTopBar {...defaultProps} />);
    expect(screen.getByText("3 participantes")).toBeInTheDocument();
  });

  it("renders singular participant count", () => {
    render(<CallTopBar {...defaultProps} participantCount={1} />);
    expect(screen.getByText("1 participante")).toBeInTheDocument();
  });

  it("starts timer at 00:00", () => {
    render(<CallTopBar {...defaultProps} />);
    expect(screen.getByText("00:00")).toBeInTheDocument();
  });

  it("calls onOpenAdjustView when adjust view button clicked", () => {
    render(<CallTopBar {...defaultProps} />);
    const buttons = screen.getAllByRole("button");
    const adjustBtn = buttons.find(b => b.getAttribute("title") === "Ajustar vista");
    if (adjustBtn) {
      fireEvent.click(adjustBtn);
      expect(defaultProps.onOpenAdjustView).toHaveBeenCalled();
    }
  });

  it("copies share link when copy button clicked", () => {
    render(<CallTopBar {...defaultProps} />);
    const copyBtn = screen.getByText("Copiar enlace");
    fireEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(defaultProps.shareLink);
  });

  it("shows E2E badge when encrypted", () => {
    render(<CallTopBar {...defaultProps} isEncrypted />);
    expect(screen.getByText("E2E")).toBeInTheDocument();
  });

  it("does not show E2E badge by default", () => {
    render(<CallTopBar {...defaultProps} />);
    expect(screen.queryByText("E2E")).not.toBeInTheDocument();
  });
});
