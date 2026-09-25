import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import CallParticipantsSidebar from "@/pages/messenger/videocall/CallParticipantsSidebar";
import { LKParticipant } from "@/hooks/useLiveKit";

vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

describe("CallParticipantsSidebar", () => {
  const mockParticipants: LKParticipant[] = [
    { sid: "s1", identity: "user-1", name: "Yo", isSpeaking: false, isMuted: false, isCameraOff: false, isScreenSharing: false, isLocal: true, handRaised: false, reactions: [], connectionQuality: "excellent", hasVideoTrack: false },
    { sid: "s2", identity: "user-2", name: "Juan Pérez", isSpeaking: true, isMuted: false, isCameraOff: false, isScreenSharing: false, isLocal: false, handRaised: false, reactions: [], connectionQuality: "good", hasVideoTrack: false },
    { sid: "s3", identity: "user-3", name: "María López", isSpeaking: false, isMuted: true, isCameraOff: true, isScreenSharing: false, isLocal: false, handRaised: true, reactions: [], connectionQuality: "poor", hasVideoTrack: false },
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

  it("shows local participant label", () => {
    render(<CallParticipantsSidebar {...defaultProps} />);
    // "Tú" appears both as name and badge
    const tuElements = screen.getAllByText("Tú");
    expect(tuElements.length).toBeGreaterThanOrEqual(1);
  });

  it("shows remote participant names", () => {
    render(<CallParticipantsSidebar {...defaultProps} />);
    expect(screen.getByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByText("María López")).toBeInTheDocument();
  });

  it("sin ser anfitrión el menú existe, pero SOLO con silenciar", () => {
    // Cambió la regla (27/08): silenciar lo puede hacer cualquiera, como en
    // Google, porque el servidor ejecuta la orden de verdad y verifica que
    // quien la pide esté en la llamada. Expulsar y el resto siguen siendo del
    // anfitrión. Antes el menú se ocultaba entero porque quedaba vacío.
    render(<CallParticipantsSidebar {...defaultProps} isAdmin={false} />);
    // Cerrar + un menú por cada participante remoto (2). Antes era 1: el menú
    // se ocultaba entero. El CONTENIDO del menú no se puede afirmar acá porque
    // Radix lo monta en un portal al abrirlo y jsdom no dispara esa apertura con
    // un click simple; lo que sí garantiza el test es que el acceso existe.
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("shows moderation menu when admin", () => {
    render(<CallParticipantsSidebar {...defaultProps} isAdmin={true} />);
    const buttons = screen.getAllByRole("button");
    // Close + 2 moderation dropdowns (for 2 remote participants)
    expect(buttons.length).toBeGreaterThanOrEqual(3);
  });

  // ── Controles de anfitrión ────────────────────────────────────────────
  // La moderación pasó de honor system (un mensaje por el canal de datos que el
  // cliente de la víctima podía ignorar) a órdenes server-side. Estos casos
  // fijan lo que la UI puede ofrecer y a quién.

  it("no ofrece los controles de anfitrión a quien no lo es", () => {
    render(
      <CallParticipantsSidebar
        {...defaultProps}
        isAdmin={false}
        onMuteAll={vi.fn()}
        onEndForAll={vi.fn()}
      />
    );
    expect(screen.queryByText("Silenciar a todos")).not.toBeInTheDocument();
    expect(screen.queryByText("Terminar para todos")).not.toBeInTheDocument();
  });

  it("ofrece silenciar a todos y terminar para todos al anfitrión", () => {
    render(
      <CallParticipantsSidebar
        {...defaultProps}
        isAdmin={true}
        onMuteAll={vi.fn()}
        onEndForAll={vi.fn()}
      />
    );
    expect(screen.getByText("Silenciar a todos")).toBeInTheDocument();
    expect(screen.getByText("Terminar para todos")).toBeInTheDocument();
  });

  it("silenciar a todos dispara la acción", () => {
    const onMuteAll = vi.fn();
    render(<CallParticipantsSidebar {...defaultProps} isAdmin={true} onMuteAll={onMuteAll} />);
    fireEvent.click(screen.getByText("Silenciar a todos"));
    expect(onMuteAll).toHaveBeenCalled();
  });

  it("sin las acciones cableadas no muestra la sección (una llamada 1:1 no modera)", () => {
    render(<CallParticipantsSidebar {...defaultProps} isAdmin={true} />);
    expect(screen.queryByText("Controles de anfitrión")).not.toBeInTheDocument();
  });

  it("sorts hand-raised participants first (after local)", () => {
    const { container } = render(<CallParticipantsSidebar {...defaultProps} />);
    const names = container.querySelectorAll("span.truncate");
    const nameTexts = Array.from(names).map((n) => n.textContent);
    expect(nameTexts[0]).toBe("Tú");
    expect(nameTexts[1]).toBe("María López"); // hand raised
    expect(nameTexts[2]).toBe("Juan Pérez");
  });

  it("calls onClose when close button is clicked", () => {
    render(<CallParticipantsSidebar {...defaultProps} />);
    const buttons = screen.getAllByRole("button");
    fireEvent.click(buttons[0]);
    expect(defaultProps.onClose).toHaveBeenCalledTimes(1);
  });
});
