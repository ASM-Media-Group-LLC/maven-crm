import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import VideoRoomsPanel from "@/pages/messenger/VideoRoomsPanel";
import type { MeetRoom } from "@/hooks/useMeetRooms";

// El panel dejó de tener su propio mecanismo de salas en memoria: ahora es un
// atajo a las reuniones de Meet. Estos tests reemplazan a los que verificaban la
// UI muerta de antes (avatares de una lista siempre vacía y un badge "EN VIVO"
// que no podía encenderse nunca porque isActive quedaba en false para siempre).

const room: MeetRoom = {
  id: "meet-1",
  code: "ABC234",
  name: "Standup",
  livekit_room_name: "meet_ab12cd34",
  isHost: true,
};

const createRoom = vi.fn();
const joinByCode = vi.fn();
const resolveByLivekitRoom = vi.fn();
const endRoom = vi.fn();

vi.mock("@/hooks/useMeetRooms", () => ({
  useMeetRooms: () => ({
    myRooms: [room],
    loading: false,
    createRoom,
    joinByCode,
    resolveByLivekitRoom,
    endRoom,
    refresh: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const clipboard = { writeText: vi.fn().mockResolvedValue(undefined) };
Object.assign(navigator, { clipboard });

function renderPanel(onClose = vi.fn()) {
  return render(
    <MemoryRouter>
      <VideoRoomsPanel onClose={onClose} />
    </MemoryRouter>
  );
}

describe("VideoRoomsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createRoom.mockResolvedValue({ ...room });
    joinByCode.mockResolvedValue({ ...room });
    resolveByLivekitRoom.mockResolvedValue({ ...room });
    window.open = vi.fn();
  });

  it("muestra el título del panel", () => {
    renderPanel();
    expect(screen.getByText("Reuniones")).toBeInTheDocument();
  });

  it("lista las reuniones abiertas con su código", () => {
    renderPanel();
    expect(screen.getByText("Standup")).toBeInTheDocument();
    expect(screen.getByText("ABC234")).toBeInTheDocument();
  });

  it("crear una reunión la abre en otra pestaña", async () => {
    renderPanel();
    fireEvent.click(screen.getByText("Nueva"));

    await waitFor(() => expect(createRoom).toHaveBeenCalled());
    await waitFor(() => expect(window.open).toHaveBeenCalled());
    const url = (window.open as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(url).toContain("/call/meet_ab12cd34");
    // El creador entra como anfitrión.
    expect(url).toContain("admin=1");
  });

  it("el link que se copia es el de invitación, NO el de la llamada", async () => {
    // /call/<sala> deja al invitado sin cuenta en el login; /entrar/<código> lo
    // manda a la sala de espera. Es la diferencia entre que el link sirva o no.
    renderPanel();
    fireEvent.click(screen.getByTitle("Copiar link de invitación"));

    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalled());
    const copied = clipboard.writeText.mock.calls.at(-1)![0] as string;
    expect(copied).toContain("/entrar/ABC234");
    expect(copied).not.toContain("/call/");
  });

  it("copia el código solo, para dictarlo", async () => {
    renderPanel();
    fireEvent.click(screen.getByTitle("Copiar código"));
    await waitFor(() => expect(clipboard.writeText).toHaveBeenCalledWith("ABC234"));
  });

  it("entrar con un código pega contra joinByCode", async () => {
    renderPanel();
    // Se escribe sucio y en minúscula, como llega por chat: el panel normaliza
    // antes de canjearlo.
    fireEvent.change(screen.getByPlaceholderText(/Código o enlace/i), { target: { value: " xyz-789 " } });
    fireEvent.click(screen.getByTitle("Entrar con el código o el link"));

    await waitFor(() => expect(joinByCode).toHaveBeenCalledWith("XYZ789"));
    expect(resolveByLivekitRoom).not.toHaveBeenCalled();
  });

  it("entrar pegando el link de una llamada resuelve por sala", async () => {
    renderPanel();
    fireEvent.change(screen.getByPlaceholderText(/Código o enlace/i), {
      target: { value: "https://maven.asmtech.ai/call/meet_zz99" },
    });
    fireEvent.click(screen.getByTitle("Entrar con el código o el link"));

    await waitFor(() => expect(resolveByLivekitRoom).toHaveBeenCalledWith("meet_zz99"));
    expect(joinByCode).not.toHaveBeenCalled();
  });

  it("terminar una reunión pide confirmación antes", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderPanel();

    fireEvent.click(screen.getByTitle("Terminar reunión"));

    expect(confirmSpy).toHaveBeenCalled();
    expect(endRoom).not.toHaveBeenCalled();

    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByTitle("Terminar reunión"));
    await waitFor(() => expect(endRoom).toHaveBeenCalledWith("meet-1"));
  });

  it("el botón de cerrar avisa al contenedor", () => {
    const onClose = vi.fn();
    renderPanel(onClose);
    // El único icon-button del header es el de cerrar.
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(onClose).toHaveBeenCalled();
  });
});
