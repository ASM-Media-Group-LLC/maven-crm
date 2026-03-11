import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CallChatSidebar from "@/pages/messenger/videocall/CallChatSidebar";
import { LKChatMessage } from "@/hooks/useLiveKit";

describe("CallChatSidebar", () => {
  const mockOnSend = vi.fn();
  const mockOnClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  const defaultProps = {
    messages: [] as LKChatMessage[],
    onSend: mockOnSend,
    onClose: mockOnClose,
    localIdentity: "user-1_abc12345",
  };

  it("renders empty state", () => {
    render(<CallChatSidebar {...defaultProps} />);
    expect(screen.getByText("Los mensajes del chat aparecerán aquí")).toBeInTheDocument();
  });

  it("renders header with title", () => {
    render(<CallChatSidebar {...defaultProps} />);
    expect(screen.getByText("Chat de la llamada")).toBeInTheDocument();
  });

  it("calls onClose when close button is clicked", () => {
    render(<CallChatSidebar {...defaultProps} />);
    const buttons = screen.getAllByRole("button");
    // First button is the close button
    fireEvent.click(buttons[0]);
    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("renders messages", () => {
    const messages: LKChatMessage[] = [
      { id: "1", sender: "other-user", senderName: "Juan", content: "Hola!", timestamp: Date.now() },
      { id: "2", sender: "user-1_abc12345", senderName: "Tú", content: "Hey!", timestamp: Date.now() },
    ];
    render(<CallChatSidebar {...defaultProps} messages={messages} />);
    expect(screen.getByText("Hola!")).toBeInTheDocument();
    expect(screen.getByText("Hey!")).toBeInTheDocument();
  });

  it("shows sender name for other users", () => {
    const messages: LKChatMessage[] = [
      { id: "1", sender: "other-user", senderName: "Juan", content: "Hola!", timestamp: Date.now() },
    ];
    render(<CallChatSidebar {...defaultProps} messages={messages} />);
    expect(screen.getByText("Juan")).toBeInTheDocument();
  });

  it("sends message on Enter key", () => {
    render(<CallChatSidebar {...defaultProps} />);
    const input = screen.getByPlaceholderText("Escribe un mensaje...");
    fireEvent.change(input, { target: { value: "Test message" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockOnSend).toHaveBeenCalledWith("Test message");
  });

  it("does not send empty messages", () => {
    render(<CallChatSidebar {...defaultProps} />);
    const input = screen.getByPlaceholderText("Escribe un mensaje...");
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(mockOnSend).not.toHaveBeenCalled();
  });

  it("clears input after sending", () => {
    render(<CallChatSidebar {...defaultProps} />);
    const input = screen.getByPlaceholderText("Escribe un mensaje...") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "Test" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(input.value).toBe("");
  });

  it("disables send button when input is empty", () => {
    render(<CallChatSidebar {...defaultProps} />);
    const sendBtn = screen.getAllByRole("button").find(b => b.querySelector("svg"));
    // The send button should be disabled
    const buttons = screen.getAllByRole("button");
    const lastBtn = buttons[buttons.length - 1];
    expect(lastBtn).toBeDisabled();
  });
});
