// La entrada a Cowork en INGLÉS: la lista de sesiones (con sus diálogos de
// finalizar y de crear), la pantalla de sesión finalizada, el lobby y la vista de
// incógnito. Nada visible en español; los nombres de sesión y de sala son datos.
//
// El tablero y la vista del participante tienen su propia prueba (acá se
// reemplazan: CoworkPage solo decide cuál mostrar).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LanguageProvider } from "@/hooks/useLanguage";
import { enEspanol, pareceEspanol, textosDeAvisos } from "./enIngles";

// Lo que cambia entre pruebas. Las fábricas de vi.mock lo leen al dibujar, no al crearse.
let esAdmin = true;
let sesion: Record<string, unknown> | null = null;
let membresia: Record<string, unknown> | null = null;

const avisos: unknown[][] = [];
vi.mock("sonner", () => {
  const registrar = (...args: unknown[]) => { avisos.push(args); return "id"; };
  return { toast: Object.assign(registrar, { success: registrar, error: registrar, warning: registrar, info: registrar, dismiss: () => {} }) };
});
// El aviso con la cara de quien finalizó: se mira su texto, no se dibuja.
vi.mock("@/lib/avisoPersona", () => ({
  avisarPersona: (a: { titulo: string; detalle?: string }) => { avisos.push([a.titulo, { description: a.detalle }]); },
}));
vi.mock("@/pages/cowork/CoworkHostDashboard", () => ({ default: () => <div>host-dashboard</div> }));
vi.mock("@/pages/cowork/CoworkParticipantView", () => ({ default: () => <div>participant-view</div> }));
vi.mock("@/pages/cowork/CoworkRoomMonitor", () => ({ default: () => null }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: esAdmin }) }));
vi.mock("@/hooks/useRoleTier", () => ({ useRoleTier: () => ({ isSupervisorOrAbove: true, isLoading: false }) }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({ dataScope: () => "all", explicitPermission: () => null, isLoading: false }),
}));
vi.mock("@/integrations/supabase/client", () => {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) q[m] = () => q;
  q.maybeSingle = async () => ({ data: { full_name: "Ana Torres", avatar_url: null, avatar_seed: null } });
  return { supabase: { auth: { getUser: async () => ({ data: { user: { id: "me" } } }) }, from: () => q } };
});

const endSessionById = vi.fn(async () => ({}));
// UN objeto por prueba, no uno por render: la página depende de la identidad de
// sus métodos (como los useCallback del hook real) y uno nuevo en cada render la
// hace recargar las listas sin parar.
let cowork: Record<string, unknown> | null = null;
vi.mock("@/hooks/useCoworkSession", () => ({
  useCoworkSession: () => (cowork ??= coworkFalso()),
}));
function coworkFalso(): Record<string, unknown> {
  return {
    session: sesion, rooms: [], memberships: [], assignments: [], hostRequests: [], meets: [],
    myMembership: membresia, myAssignment: null, isHost: false, loading: false, profiles: {}, avatares: {},
    listMyActiveSessions: async () => [
      { id: "s1", name: "Morning shift", description: null, role: "host", members: 3, created_at: "2026-09-20T12:00:00Z", lastRoomId: null, createdBy: "me" },
    ],
    listMyEndedSessions: async () => [
      { id: "e1", name: "Night shift", endedAt: "2026-09-22T03:10:00Z", endedBy: null, endedByName: null, createdBy: "x", createdByName: "Pedro Castro", members: 1 },
      { id: "e2", name: "Weekend", endedAt: "2026-09-21T20:00:00Z", endedBy: "u9", endedByName: "Ana Torres", createdBy: "me", createdByName: null, members: 4 },
    ],
    adminListSessions: async () => [
      { id: "s1", name: "Morning shift", description: null, members: 3, created_at: "2026-09-20T12:00:00Z", host_name: "Jhon Lopez",
        my_role: "host", online: 2, hubOnline: 1, incognito: ["Laura Admin"], rooms: [{ id: "r1", name: "Room 1", online: 2 }, { id: "r2", name: "Room 2", online: null }] },
      { id: "s2", name: "HR team", description: null, members: 1, created_at: "2026-09-20T12:00:00Z", host_name: "Pedro Castro",
        my_role: null, online: 0, hubOnline: 0, incognito: [], rooms: [{ id: "r9", name: "Desk", online: 0 }] },
    ],
    endSessionById, leaveSessionById: async () => ({}), joinSession: async () => ({}), joinByCode: async () => ({}),
    createSession: async () => ({ sessionId: "new" }), refetch: () => {},
    issueLiveKitToken: async () => ({ token: "t", url: "wss://x" }), incognitoPing: async () => ({}), incognitoLeave: async () => ({}),
  };
}

import CoworkPage from "@/pages/cowork/CoworkPage";

function montar(ruta = "/cowork") {
  return render(
    <MemoryRouter initialEntries={[ruta]}>
      <LanguageProvider>
        <CoworkPage />
      </LanguageProvider>
    </MemoryRouter>,
  );
}

describe("Cowork · la entrada en inglés", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("app-language", "en");
    avisos.length = 0;
    esAdmin = true;
    sesion = null;
    membresia = null;
    cowork = null;
  });

  it("la lista de sesiones (activas y finalizadas) no tiene nada en español", async () => {
    montar();
    await screen.findByText("Morning shift");
    await screen.findByText("Night shift");
    expect(enEspanol(document.body)).toEqual([]);
    expect(screen.getByText("Cowork rooms")).toBeTruthy();
    expect(screen.getByText("Active sessions · 2")).toBeTruthy();
    expect(screen.getByText(/^Not joined/)).toBeTruthy();
    expect(screen.getByText("someone (not recorded: before Sep 3)")).toBeTruthy();
    // Con las tarjetas (rediseño 10/2026, propuestas 8+9 de Alvaro) el pulso va
    // ARRIBA: la gente al frente (caras) y, en una línea, cuántos en línea y en
    // cuántas salas. Aquí las salas no traen `gente`, así que no hay caras:
    // queda el conteo "2 online · 1 room".
    expect(screen.getByText("2 online", { exact: false })).toBeTruthy();
    expect(screen.getByText("· 1 room")).toBeTruthy();
  });

  it("el diálogo de finalizar y el de crear sesión están en inglés", async () => {
    montar();
    await screen.findByText("Morning shift");
    // Finalizar vive ahora en el menú ⋯ de la sesión (rediseño 10/2026): se abre
    // el menú (con Enter, como el ⋮ del correo — el click de Radix no abre en
    // jsdom) y de ahí se elige "End".
    fireEvent.keyDown(screen.getAllByRole("button", { name: "More options" })[0], { key: "Enter" });
    const menuSesion = await screen.findByRole("menu");
    fireEvent.click(within(menuSesion).getByRole("menuitem", { name: "End" }));
    let dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText("End “Morning shift”?")).toBeTruthy();
    expect(within(dialogo).getByText(/It closes for the 3 people inside/)).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
    await act(async () => { fireEvent.click(within(dialogo).getByRole("button", { name: "End session" })); });
    expect(endSessionById).toHaveBeenCalledWith("s1");
    expect(textosDeAvisos(avisos)).toContain("Session ended");

    fireEvent.click(screen.getByRole("button", { name: /Create session/ }));
    dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByPlaceholderText("e.g. Weekly Cowork")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
  });

  it("la sesión finalizada lo dice en inglés, con quién la cerró", async () => {
    sesion = { id: "s9", name: "Old", status: "ended", ended_by: "u9", ended_at: "2026-09-22T03:10:00Z" };
    montar("/cowork?session=s9");
    await screen.findByText("This session has ended");
    await screen.findByText("Ana Torres");
    expect(enEspanol(document.body)).toEqual([]);
    const textos = textosDeAvisos(avisos);
    expect(textos).toContain("Ended by Ana Torres");
    expect(textos.filter((t) => pareceEspanol(t))).toEqual([]);
  });

  it("el lobby y el incógnito están en inglés", async () => {
    sesion = { id: "s9", name: "", status: "active" };
    const { unmount } = montar("/cowork?session=s9");
    await screen.findByText("Join as participant");
    expect(screen.getByText("Cowork session")).toBeTruthy();
    expect(enEspanol(document.body)).toEqual([]);
    unmount();

    cowork = null;
    montar("/cowork?session=s1&spy=1");
    await screen.findByText(/Incognito mode/);
    expect(screen.getByText("🕶 Also incognito: Laura Admin")).toBeTruthy();
    expect(enEspanol(document.body)).toEqual([]);
  });
});
