import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock livekit-client
vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

vi.mock("livekit-client", () => ({
  createLocalTracks: vi.fn().mockRejectedValue(new Error("mocked")),
  LocalAudioTrack: vi.fn(),
  LocalVideoTrack: vi.fn(),
}));

// El procesador de fondo (lib/fondoFino) se simula: en jsdom no hay WebGL.
vi.mock("@/lib/fondoFino/procesador", () => ({
  ProcesadorDeFondo: vi.fn().mockReturnValue({
    switchTo: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn().mockResolvedValue(undefined),
  }),
  soportaProcesadorDeFondo: vi.fn().mockReturnValue(true),
  precalentarFondo: vi.fn(async () => true),
  fondoPrecalentado: vi.fn(() => true),
  topeParaPonerFondo: vi.fn((ms: number) => ms),
}));

import PreJoinLobby from "@/pages/messenger/videocall/PreJoinLobby";
import { guardarFondo } from "@/lib/fondoDeLlamada";

describe("PreJoinLobby", () => {
  const defaultProps = {
    roomName: "test-room",
    displayName: "Juan Pérez",
    callDisplayName: "Daily Standup",
    onJoin: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // La sala de espera arranca con el ÚLTIMO fondo elegido (localStorage), así
    // que sin limpiar, un test que elige fondo le cambia el arranque al siguiente.
    localStorage.clear();
  });

  // El nombre AMIGABLE de la llamada SÍ se dibuja: lo volvió a poner el rediseño
  // de la sala de espera (56db2358 "Revamp pre-lobby and video UI"), que borró el
  // comentario "Room/call name hidden by design" y lo reemplazó por un render
  // condicional de SOLO `callDisplayName`. Lo que se pedía esconder el día antes
  // (12da73ba "Hide room name in PreJoinLobby") era el nombre TÉCNICO de la sala
  // —`meet_ab12cd34ef56`, `call-<uuid>`—, y eso sigue oculto: el componente nunca
  // dibuja `roomName`. Por eso el test comprueba las dos cosas juntas.
  it("renders the call display name but never the technical room name", () => {
    render(<PreJoinLobby {...defaultProps} />);
    expect(screen.getByText("Daily Standup")).toBeInTheDocument();
    expect(screen.queryByText("test-room")).not.toBeInTheDocument();
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

  // El renglón del fondo dejó de anunciar "Sin fondo virtual" en el rediseño
  // (56db2358): pasó de "Fondo seleccionado: X" siempre visible a "Fondo: X"
  // SOLO cuando hay fondo elegido. Con la cámara apagada y sin efecto, decir
  // "Sin fondo virtual" era ruido en una pantalla que ya tiene el botón de fondo.
  it("shows no background line when no background is picked (default)", () => {
    render(<PreJoinLobby {...defaultProps} />);
    expect(screen.queryByText(/Sin fondo virtual/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Fondo:/)).not.toBeInTheDocument();
  });

  it("shows the background line with the chosen background", () => {
    // Se guarda por la misma vía que usa el componente al elegir fondo, para no
    // depender del nombre de la clave de localStorage.
    guardarFondo("blur");
    render(<PreJoinLobby {...defaultProps} />);
    expect(screen.getByText("Difuminar fondo")).toBeInTheDocument();
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

  // Sin nombre amigable NO se cae al nombre de la sala: el renglón simplemente
  // no se dibuja (así se escondió el nombre técnico en 12da73ba).
  it("does not fall back to the room name when there is no call display name", () => {
    render(<PreJoinLobby {...defaultProps} callDisplayName={undefined} />);
    expect(screen.queryByText("test-room")).not.toBeInTheDocument();
  });

  it("does not render video when camera is off (default state)", () => {
    const { container } = render(<PreJoinLobby {...defaultProps} />);
    expect(container.querySelector("video")).not.toBeInTheDocument();
  });
});
