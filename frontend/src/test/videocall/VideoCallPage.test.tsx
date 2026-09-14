import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Mock react-router-dom.
//
// Partimos del módulo REAL (`original`) y solo pisamos los tres hooks que la
// página maneja desde la prueba. Enumerar a mano lo que usa la página fue
// justamente lo que dejó este archivo en rojo: cuando VideoCallPage empezó a
// desviar las salas de Cowork con `useNavigate`, el doble no lo tenía y todas
// las pruebas reventaban al montar.
const mockUseParams = vi.fn().mockReturnValue({ roomName: "" });
const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (original) => ({
  ...(await original<typeof import("react-router-dom")>()),
  useParams: () => mockUseParams(),
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
  useNavigate: () => mockNavigate,
}));

// La página dispara VARIAS consultas (link público de Meet, perfil, quiénes
// están en la sala). Solo la del perfil decide qué se dibuja, así que
// `mockUseQuery` gobierna esa y las demás devuelven vacío: si respondieran
// todas lo mismo, "perfil cargado" también le metería un perfil a la lista de
// gente de la sala de espera.
const mockUseQuery = vi.fn().mockReturnValue({ data: null, isLoading: false });
vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey?: readonly unknown[] }) =>
    opts.queryKey?.[0] === "profile-for-call"
      ? mockUseQuery(opts)
      : { data: undefined, isLoading: false, isError: false },
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: { id: "user-1" }, session: null, loading: false, signOut: vi.fn() }),
}));

// Las consultas van mockeadas, así que del cliente solo se ejerce de verdad la
// cadena del desvío a Cowork: `.from().select().eq().maybeSingle()`.
interface ConsultaEncadenada {
  select: () => ConsultaEncadenada;
  eq: () => ConsultaEncadenada;
  maybeSingle: () => Promise<{ data: { id?: string; session_id?: string } | null }>;
}
const mockMaybeSingle = vi.fn().mockResolvedValue({ data: null });
vi.mock("@/integrations/supabase/client", () => {
  const cadena: ConsultaEncadenada = {
    select: () => cadena,
    eq: () => cadena,
    maybeSingle: () => mockMaybeSingle(),
  };
  return { supabase: { from: vi.fn(() => cadena) } };
});

vi.mock("@/pages/messenger/videocall/LiveKitCallView", () => ({
  default: () => <div data-testid="live-kit-call">LiveKit Call</div>,
}));

vi.mock("@/pages/messenger/videocall/PreJoinLobby", () => ({
  default: () => <div data-testid="pre-join-lobby">Pre Join Lobby</div>,
}));

import VideoCallPage from "@/pages/VideoCallPage";

describe("VideoCallPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockMaybeSingle.mockResolvedValue({ data: null });
  });

  it("shows error when roomName is missing", () => {
    mockUseParams.mockReturnValue({ roomName: "" });
    mockUseQuery.mockReturnValue({ data: null, isLoading: false });
    render(<VideoCallPage />);
    expect(screen.getByText("Sala no especificada")).toBeInTheDocument();
  });

  it("shows loader when profile is loading", () => {
    mockUseParams.mockReturnValue({ roomName: "test-room" });
    mockUseQuery.mockReturnValue({ data: null, isLoading: true });

    const { container } = render(<VideoCallPage />);
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });

  it("shows loader when profile is null (not yet loaded)", () => {
    mockUseParams.mockReturnValue({ roomName: "test-room" });
    mockUseQuery.mockReturnValue({ data: null, isLoading: false });

    const { container } = render(<VideoCallPage />);
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });

  it("renders PreJoinLobby when profile is loaded and not yet joined", () => {
    mockUseParams.mockReturnValue({ roomName: "test-room" });
    mockUseQuery.mockReturnValue({ data: { full_name: "Test User" }, isLoading: false });

    render(<VideoCallPage />);
    expect(screen.getByTestId("pre-join-lobby")).toBeInTheDocument();
  });

  // Este es el comportamiento que trajo `useNavigate` a la página: una sala de
  // Cowork NO se atiende acá, se manda al tablero de Cowork. Y no se dibuja
  // nada de la llamada mientras se resuelve el desvío.
  it("sends Cowork rooms to the Cowork dashboard instead of showing the lobby", async () => {
    mockUseParams.mockReturnValue({ roomName: "cowork_hub_abc" });
    mockUseQuery.mockReturnValue({ data: { full_name: "Test User" }, isLoading: false });
    mockMaybeSingle.mockResolvedValue({ data: { id: "sesion-1" } });

    const { container } = render(<VideoCallPage />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByTestId("pre-join-lobby")).not.toBeInTheDocument();

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith("/cowork?session=sesion-1&role=host", {
        replace: true,
      }),
    );
  });
});
