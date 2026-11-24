// Lo que ve el CHATTER en Cowork, en INGLÉS: la barra de su sala (con el break
// pasado y el reloj detenido), el cartel de su supervisor en lunch, la pantalla
// de "todavía no estás en una sala" y la de "ya está abierto en otra pestaña".
//
// Y lo que es dato sigue siendo dato: el mensaje que manda "Pedir supervisor" se
// GUARDA en la solicitud y lo lee otra persona, así que viaja en español aunque
// la pantalla esté en inglés.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/hooks/useLanguage";
import { enEspanol, pareceEspanol, textosDeAvisos } from "./enIngles";

const AHORA = Date.now();

const avisos: unknown[][] = [];
vi.mock("sonner", () => {
  const registrar = (...args: unknown[]) => { avisos.push(args); return "id"; };
  return { toast: Object.assign(registrar, { success: registrar, error: registrar, warning: registrar, info: registrar, dismiss: () => {} }) };
});
const dicho: string[] = [];
vi.mock("@/lib/voz", () => ({ hablar: (frase: string) => { dicho.push(frase); } }));
vi.mock("@/lib/notificationSound", () => ({ playMessageNotification: () => {} }));
vi.mock("@/lib/coworkLatido", () => ({
  iniciarLatido: () => {}, actualizarLatido: () => {}, detenerLatido: () => {},
  // El reloj propio, detenido porque la cámara está apagada.
  leerReloj: () => ({ estado: "sin_camara", segundosHoy: 3 * 3600 + 42 * 60, en: AHORA }),
  suscribirReloj: () => () => {},
  alQuedarSinSala: () => () => {},
}));
let principal: boolean | null = true;
vi.mock("@/hooks/usePestanaPrincipal", () => ({
  usePestanaPrincipal: () => ({ principal, tomarEstaPestana: async () => {} }),
}));
vi.mock("@/hooks/useCoworkMediaPresence", () => ({
  useCoworkMediaPresence: () => ({ trackMediaState: () => {}, supervisores: { sup: "lunch" } }),
  salirDePresencia: () => {},
}));
vi.mock("@/components/PersistentCallProvider", () => ({
  usePersistentCall: () => ({ startCall: () => {}, endCall: () => {} }),
  CallOutlet: () => null,
}));
vi.mock("@/pages/messenger/videocall/LiveKitCallView", () => ({ default: () => null }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
// El cartelito "monitor activo" usa react-query; este test renderiza la vista
// sin QueryClientProvider y no es lo que prueba, así que se mockea apagado.
vi.mock("@/hooks/useMonitorConfig", () => ({ useMonitorConfig: () => ({ config: null, cargando: false, error: null }) }));
vi.mock("@/lib/coworkTablas", () => ({
  rpcBanoConsumido: async () => ({ data: [{ user_id: "u1", segundos: 0 }] }),
  leerLimitesPausa: async () => ({ bano: 10, break: 30 }),
}));
vi.mock("@/integrations/supabase/client", () => {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq"]) q[m] = () => q;
  q.single = async () => ({ data: { full_name: "Laura Gomez" } });
  q.maybeSingle = async () => ({ data: { full_name: "Laura Gomez" } });
  // El canal del receptor de avisos (useCanalQueRevive): basta con que exista;
  // no llega ningún aviso en estas pruebas.
  const chan = { on: () => chan, subscribe: () => chan };
  return {
    supabase: {
      auth: { getUser: async () => ({ data: { user: { id: "u1" } } }), getSession: async () => ({ data: { session: null } }) },
      from: () => q,
      channel: () => chan,
      removeChannel: () => Promise.resolve(),
    },
  };
});

import CoworkParticipantView from "@/pages/cowork/CoworkParticipantView";

const requestHost = vi.fn(async () => ({}));
const joinByCode = vi.fn();
const refetch = vi.fn();
let asignacion: Record<string, unknown> | null = null;
let pausaAbierta: Record<string, unknown> | null = null;
let cowork: Record<string, unknown> | null = null;
function coworkFalso(): Record<string, unknown> {
  const ok = async () => ({});
  return {
    session: { id: "s1", name: "Morning shift", status: "active", alert_rules: null },
    rooms: [{ id: "r1", session_id: "s1", name: "Room 1", livekit_room_name: "lk-r1", sort_order: 0 }],
    memberships: [{ id: "m", session_id: "s1", user_id: "sup", role: "host", joined_at: "" }],
    assignments: [], hostRequests: [], meets: [],
    myMembership: { role: "participant" }, myAssignment: asignacion, isHost: false, loading: false,
    profiles: { sup: "Pedro Castro", u1: "Laura Gomez" }, avatares: {},
    getMyLastRoomId: async () => "r1",
    getPausaAbierta: async () => pausaAbierta,
    issueLiveKitToken: async () => ({ token: "t", url: "wss://x" }),
    requestHost, setBreak: ok, leaveRoom: ok, joinSession: ok, joinByCode, joinOneOnOne: ok,
    joinMeetGrupal: ok, salirDeMeetGrupal: ok, resolveHostRequest: ok, refetch,
  };
}

function RutaActual() {
  const { pathname, search } = useLocation();
  return <output data-testid="ruta">{pathname}{search}</output>;
}
function montar() {
  cowork = coworkFalso();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={["/cowork?session=s1"]}>
        <LanguageProvider>
          <CoworkParticipantView cowork={cowork as never} userId="u1" />
          <RutaActual />
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Cowork · la vista del participante en inglés", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("app-language", "en");
    avisos.length = 0;
    dicho.length = 0;
    principal = true;
    asignacion = { id: "a", session_id: "s1", user_id: "u1", room_id: "r1", is_active: true, assigned_at: "" };
    // Un break de 35 minutos contra un tope de 30: pasado.
    pausaAbierta = { startedAt: AHORA - 35 * 60_000, kind: "break", limiteMinutos: 30 };
    requestHost.mockClear();
    joinByCode.mockReset();
    refetch.mockClear();
  });

  it("la barra de la sala en break pasado, el reloj y el cartel del supervisor", async () => {
    montar();
    await screen.findByText("Room 1");
    await screen.findByText("over");                     // el break ya pasado
    expect(enEspanol(document.body)).toEqual([]);
    expect(screen.getByText("Pedro Castro is at lunch")).toBeTruthy();
    expect(screen.getByText("Back after lunch.")).toBeTruthy();
    // Dos relojes: el de escritorio y el compacto del teléfono.
    expect(screen.getAllByTitle("Clock stopped: camera off. You've logged 3h 42m 00s today.").length).toBe(2);
    // El aviso de "se acabó tu pausa" sale escrito en inglés; lo HABLADO, en español.
    const textos = textosDeAvisos(avisos);
    expect(textos).toContain("Your pause time is up");
    expect(textos.filter((t) => pareceEspanol(t))).toEqual([]);
    expect(dicho.length).toBeGreaterThan(0);
    expect(dicho.every((f) => pareceEspanol(f))).toBe(true);
  });

  it("Pedir supervisor: el cartel en inglés, el mensaje GUARDADO en español", async () => {
    pausaAbierta = null;
    montar();
    await screen.findByText("Room 1");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Ask for supervisor/ })); });
    expect(requestHost).toHaveBeenCalledWith("r1", "Necesito ayuda");
    expect(textosDeAvisos(avisos)).toContain("Request sent to the supervisor");
  });

  it("sin sala: las dos salidas (volver o entrar con código) en inglés", async () => {
    asignacion = null;
    pausaAbierta = null;
    montar();
    await screen.findByText("You're not in a room yet");
    await screen.findByText("Back to my room");
    expect(screen.getByText("Or enter with another room's code")).toBeTruthy();
    expect(enEspanol(document.body)).toEqual([]);
  });

  it("con Cowork abierto en otra pestaña, lo dice en inglés", async () => {
    principal = false;
    pausaAbierta = null;
    montar();
    await screen.findByText("Cowork is already open in another tab");
    expect(enEspanol(document.body)).toEqual([]);
  });

  it.each([
    { result: { sessionId: "s2", roomName: "Room 2" }, ruta: "/cowork?session=s2", refresca: false },
    { result: { sessionId: "s2", pendingApproval: true }, ruta: "/cowork?session=s2&solicitud=1", refresca: false },
    { result: { sessionId: "s1", roomName: "Room 2" }, ruta: "/cowork?session=s1", refresca: true },
  ])("el código lleva al destino devuelto por el servidor: $ruta", async ({result, ruta, refresca}) => {
    asignacion = null; pausaAbierta = null;
    joinByCode.mockResolvedValue(result);
    montar();
    const campo = await screen.findByPlaceholderText("ABC234");
    // La autoentrada anterior puede refrescar, pero el canje nuevo no debe
    // refrescar el Cowork de origen cuando la respuesta es de otro destino.
    await act(async () => {}); refetch.mockClear();
    fireEvent.change(campo, { target: { value: "ABC234" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    await waitFor(() => expect(joinByCode).toHaveBeenCalledWith("ABC234"));
    await waitFor(() => expect(screen.getByTestId("ruta")).toHaveTextContent(ruta));
    if (refresca) expect(refetch).toHaveBeenCalledWith(true);
    else expect(refetch).not.toHaveBeenCalled();
  });

  it("un código rechazado conserva la pantalla actual y muestra el error", async () => {
    asignacion = null; pausaAbierta = null;
    joinByCode.mockRejectedValue(new Error("Access not approved"));
    montar();
    const campo = await screen.findByPlaceholderText("ABC234");
    fireEvent.change(campo, { target: { value: "ABC234" } });
    fireEvent.keyDown(campo, { key: "Enter" });
    await waitFor(() => expect(textosDeAvisos(avisos)).toContain("Access not approved"));
    expect(screen.getByTestId("ruta")).toHaveTextContent("/cowork?session=s1");
  });
});
