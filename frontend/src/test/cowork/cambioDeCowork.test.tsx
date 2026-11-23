import { useState } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Link, MemoryRouter, useLocation } from "react-router-dom";
import { LanguageProvider } from "@/hooks/useLanguage";

const unirse = vi.fn();
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: false }) }));
vi.mock("@/hooks/useRoleTier", () => ({ useRoleTier: () => ({ isSupervisorOrAbove: false, isLoading: false }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ dataScope: () => "self", canFunction: () => false, explicitPermission: () => null, isLoading: false }) }));
vi.mock("@/components/CoworkSoloApp", () => ({ useCoworkSoloApp: () => ({ estado: "permitido" }), BloqueoSoloApp: () => null }));
vi.mock("@/pages/cowork/CoworkHostDashboard", () => ({ default: () => <div>Tablero de origen</div> }));
vi.mock("@/pages/cowork/CoworkParticipantView", () => ({ default: () => <div>Participante</div> }));
vi.mock("@/pages/cowork/CoworkRoomMonitor", () => ({ default: () => null }));
vi.mock("@/pages/cowork/CoworkSolicitud", () => ({ default: ({sessionId}: {sessionId:string}) => <div>Solicitud para {sessionId}</div> }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getUser: async () => ({ data: { user: { id: "me" } } }) } } }));
vi.mock("@/hooks/useCoworkSession", () => ({
  useCoworkSession: (id: string) => {
    // Datos ya leídos: el hook real también los conserva en useState entre
    // renders. Al cambiar de sesión deben quedar aislados del siguiente árbol.
    const [datos] = useState(() => ({
      session: { id, name: id, status: "active" },
      rooms: [], memberships: [], assignments: [], hostRequests: [], meets: [],
      myMembership: id === "origen" ? { role: "host" } : null,
      myAssignment: null, isHost: id === "origen", loading: false,
      profiles: {}, avatares: {}, membresiasCargadas: true,
      getMyLastRoomId: async () => "sala-anterior",
      joinSession: unirse, refetch: vi.fn(), pasoDeCarga: () => "",
    }));
    return datos;
  },
}));
import CoworkPage from "@/pages/cowork/CoworkPage";

function Controles() {
  const location = useLocation();
  return <><Link to="/cowork?session=destino&room=nueva">Invitación</Link>
    <Link to="/cowork?session=otro&room=otra">Otro Cowork</Link>
    <output data-testid="ruta">{location.pathname}{location.search}</output></>;
}
function montar(ruta = "/cowork?session=origen") {
  return render(<MemoryRouter initialEntries={[ruta]}><LanguageProvider><Controles/><CoworkPage/></LanguageProvider></MemoryRouter>);
}

beforeEach(() => { localStorage.clear(); unirse.mockReset(); unirse.mockResolvedValue({pendingApproval:true}); });

describe("Cambiar de Cowork con un enlace", () => {
  it("no hereda la membresía de host del origen ni pierde la sala del enlace", async () => {
    montar();
    expect(await screen.findByText("Tablero de origen")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("link", {name:"Invitación"}));
    expect(await screen.findByText("Solicitud para destino")).toBeInTheDocument();
    expect(unirse).toHaveBeenCalledWith("destino", "participant", undefined, "nueva", {porEnlace:true});
    expect(screen.queryByText("Tablero de origen")).toBeNull();
    expect(screen.getByTestId("ruta")).toHaveTextContent("/cowork?session=destino&solicitud=1");
  });

  it("una respuesta tardía del enlace anterior no devuelve al usuario al Cowork anterior", async () => {
    let resolver!: (r: {pendingApproval:boolean}) => void;
    unirse.mockImplementation((id: string) => id === "destino"
      ? new Promise(r => { resolver = r; }) : Promise.resolve({pendingApproval:true}));
    montar();
    fireEvent.click(screen.getByRole("link", {name:"Invitación"}));
    await waitFor(() => expect(unirse).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("link", {name:"Otro Cowork"}));
    expect(await screen.findByText("Solicitud para otro")).toBeInTheDocument();
    await act(async () => resolver({pendingApproval:true}));
    expect(screen.getByTestId("ruta")).toHaveTextContent("/cowork?session=otro&solicitud=1");
    expect(screen.queryByText("Solicitud para destino")).toBeNull();
  });
});
