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

  it("Shift+Enter hace un renglon en vez de enviar", () => {
    render(<CallChatSidebar {...defaultProps} />);
    const input = screen.getByPlaceholderText("Escribe un mensaje...");
    fireEvent.change(input, { target: { value: "primera linea" } });
    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(mockOnSend).not.toHaveBeenCalled();
  });

  it("el cajon crece con el texto en vez de dejarlo en una linea", () => {
    render(<CallChatSidebar {...defaultProps} />);
    const input = screen.getByPlaceholderText("Escribe un mensaje...") as HTMLTextAreaElement;
    // Es un <textarea>, no un <input>: un <input> no puede crecer, y era la causa
    // de que un mensaje largo corriera fuera de vista.
    expect(input.tagName).toBe("TEXTAREA");

    // jsdom no hace layout, asi que scrollHeight es siempre 0 y no se puede medir
    // el alto real. Lo que si se puede verificar es que el auto-grow LO ESCRIBE:
    // sin el hook, el style.height queda vacio.
    fireEvent.change(input, { target: { value: "linea\n".repeat(8) } });
    expect(input.style.height).not.toBe("");
  });

  it("respeta los saltos de linea de los mensajes recibidos", () => {
    const messages = [
      { id: "1", sender: "otro", senderName: "Otro", content: "uno\ndos", timestamp: Date.now() },
    ];
    render(<CallChatSidebar {...defaultProps} messages={messages} />);
    const burbuja = screen.getByText((_, el) => el?.textContent === "uno\ndos" && el.className.includes("rounded-2xl"));
    expect(burbuja.className).toContain("whitespace-pre-wrap");
    expect(burbuja.className).toContain("break-words");
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
