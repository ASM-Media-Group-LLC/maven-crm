// El tablero del supervisor de Cowork en INGLÉS: nada visible en español —ni las
// tarjetas de las salas, ni el panel de la derecha, ni los avisos que dispara—, y
// lo que es DATO sigue siendo dato.
//
// Se monta con el LanguageProvider real y app-language=en. Lo que no es de esta
// pantalla (LiveKit, la llamada persistente, la presencia, el Messenger) se
// reemplaza por dobles; los datos cubren los estados que cambian el texto: una
// persona pasada de su break, otra sin rostro y sin compartir pantalla, una sala
// entera en el meet grupal, un supervisor en lunch y dos solicitudes (la de ayuda
// y la privada, con el mensaje en español que el chatter deja GUARDADO).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/hooks/useLanguage";
import { enEspanol, pareceEspanol, textosDeAvisos } from "./enIngles";

const AHORA = Date.now();
const hace = (min: number) => AHORA - min * 60_000;

// ── Los avisos: se juntan para mirar su idioma ─────────────────────────────
const avisos: unknown[][] = [];
vi.mock("sonner", () => {
  const registrar = (...args: unknown[]) => { avisos.push(args); return "id"; };
  const toast = Object.assign(registrar, {
    success: registrar, error: registrar, warning: registrar, info: registrar, dismiss: () => {},
  });
  return { toast };
});

// ── Lo que dice la voz: queda en español a propósito (motor de voz en español) ──
const voz: string[] = [];
const alMorirLaVoz: Array<(motivo: string) => void> = [];
vi.mock("@/lib/colaDeVoz", () => ({
  encolarVoz: (quien: string, frase: string) => { voz.push(`${quien} ${frase}`); },
  alFallarLaVoz: (cb: (motivo: string) => void) => { alMorirLaVoz.push(cb); return () => {}; },
}));
vi.mock("@/lib/coordinatorRequestSound", () => ({ playCoordinatorRequestSound: () => {} }));
vi.mock("@/lib/noise-suppression-processor", () => ({ armarCadenaNC: vi.fn(), loadNCPreference: () => false }));

// ── Presencia, llamada, LiveKit, Messenger ─────────────────────────────────
const mediaStates: Record<string, unknown> = {
  // Pasada de su break: 40 min contra un tope de 30.
  u1: { micOn: false, camOn: false, screenShareOn: false, onBreak: true, breakStartedAt: hace(40), breakKind: "break", faceState: "ok", faceSince: hace(40) },
  // Sin rostro hace 5 min y sin compartir pantalla hace 10.
  u2: { micOn: true, camOn: true, screenShareOn: false, screenShareSince: hace(10), faceState: "no_face", faceSince: hace(5),
        relojEstado: "sin_pantalla", relojSegundosHoy: 7200, relojEn: AHORA },
  u3: { micOn: true, camOn: true, screenShareOn: true, faceState: "ok", faceSince: hace(30) },
};
vi.mock("@/hooks/useCoworkMediaPresence", () => ({
  useCoworkMediaPresence: () => ({
    mediaStates,
    supervisores: { sup2: "lunch" },
    supervisoresDesde: { sup2: hace(12) },
    trackEstadoSupervisor: () => {},
  }),
}));
vi.mock("@/hooks/useOnlinePresence", () => ({ useOnlinePresence: () => ({ isOnline: () => true }) }));
vi.mock("@/hooks/useRelojDeSala", () => ({ useRelojDeSala: () => ({}) }));
vi.mock("@/hooks/useFaceNudge", () => ({
  debeAvisarSinPantalla: (ms: { screenShareOn?: boolean; onBreak?: boolean; screenShareSince?: number | null } | undefined, ahora: number, umbral: number | null) =>
    umbral !== null && !!ms && !ms.screenShareOn && !ms.onBreak && !!ms.screenShareSince && ahora - ms.screenShareSince >= umbral,
}));
vi.mock("@/components/PersistentCallProvider", () => ({
  usePersistentCall: () => ({
    startCall: () => {}, endCall: () => {},
    // El Hub conectado: así se dibuja su ventanita con todos sus botones.
    activeKey: "cowork-hub-hub-1",
    abrirVentanaDelSistema: async () => false, cerrarVentanaDelSistema: () => {},
    ventanaDelSistemaAbierta: false, ventanaDelSistemaSoportada: false,
  }),
  CallOutlet: () => null,
}));
vi.mock("@/pages/messenger/videocall/LiveKitCallView", () => ({ default: () => null }));
vi.mock("@/pages/cowork/CoworkRoomMonitor", () => ({ default: () => null }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: true }) }));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/hooks/ChatProvider", () => ({ useChatShared: () => ({ createDirectChat: () => null }) }));
vi.mock("@/components/messenger/MessengerDock", () => ({ useMessengerDock: () => ({ abrirChat: () => {} }) }));

// La vista "Pausas y meets": lo que devolverían los dos RPC ya agregado.
vi.mock("@/hooks/useCoworkPausas", () => ({
  useCoworkPausas: () => ({
    data: {
      filas: [],
      personas: [
        { userId: "u1", nombre: "Laura Gomez", dias: 3, banos: 4, segBano: 1500, diasBanoExcedido: 2, breaks: 3, segBreak: 5400,
          breaksExcedidos: 2, segBreakDeMas: 900, autoCerradas: 1, conExcesos: true },
        { userId: "u2", nombre: "Mateo Ruiz", dias: 1, banos: 1, segBano: 240, diasBanoExcedido: 0, breaks: 1, segBreak: 1200,
          breaksExcedidos: 0, segBreakDeMas: 0, autoCerradas: 0, conExcesos: false },
      ],
      totales: { segBano: 1740, banos: 5, segBreak: 6600, breaks: 4, conExcesos: 1 },
    },
    cargando: false, error: null, refrescar: async () => {},
  }),
}));
vi.mock("@/hooks/useCoworkMeetsResumen", () => ({
  useCoworkMeetsResumen: () => ({
    data: {
      filas: [],
      personas: [{ userId: "u3", nombre: "Sofia Diaz", meets: 1, segMeet: 1800 }],
      totales: { segMeet: 1800, meets: 1 },
      meets: [{
        meetId: "m1", sesion: "Morning shift", creador: "Jhon Lopez", startedAt: new Date(hace(30)).toISOString(), endedAt: null,
        abierto: true, segundos: 1800, gente: [{ userId: "u3", nombre: "Sofia Diaz", sala: "Room 2", segundos: 1800, abierto: true }],
      }],
    },
    cargando: false, error: null, refrescar: async () => {},
  }),
}));

// La base: el perfil propio y los topes de pausa (10 de baño, 30 de break).
function consulta(resultado: unknown) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "order", "limit"]) q[m] = () => q;
  q.single = async () => resultado;
  q.maybeSingle = async () => resultado;
  q.then = (ok: (v: unknown) => unknown, mal?: (e: unknown) => unknown) => Promise.resolve(resultado).then(ok, mal);
  return q;
}
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: "me" } } }), getSession: async () => ({ data: { session: null } }) },
    from: (tabla: string) => consulta(tabla === "cowork_break_limits"
      ? { data: [{ kind: "bano", minutos: 10 }, { kind: "break", minutos: 30 }] }
      : { data: { full_name: "Jhon Lopez" } }),
    rpc: async () => ({ data: [] }),
  },
}));

import CoworkHostDashboard from "@/pages/cowork/CoworkHostDashboard";

const iso = (ms: number) => new Date(ms).toISOString();
const sala = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, session_id: "s1", name, livekit_room_name: `lk-${id}`, sort_order: 0, preview_mode: "video" as const, ...extra,
});
const asignacion = (user_id: string, room_id: string) => ({
  id: `a-${user_id}`, session_id: "s1", user_id, room_id, is_active: true, assigned_at: iso(hace(60)),
});

const requestHost = vi.fn(async () => ({}));
function coworkFalso() {
  const ok = async () => ({});
  return {
    session: {
      id: "s1", name: "Morning shift", description: null, status: "active", host_hub_livekit_room: "hub-1",
      created_by: "me", created_at: iso(hace(600)), ended_at: null, updated_at: iso(hace(10)),
      alert_rules: null, alert_rules_updated_by: "me", alert_rules_updated_at: iso(hace(60 * 24 * 3)),
    },
    rooms: [sala("r1", "Room 1", { join_code: "ABC234" }), sala("r2", "Room 2"), sala("r3", "Room 3", { join_code: "XYZ789" })],
    memberships: [],
    assignments: [asignacion("u1", "r1"), asignacion("u2", "r1"), asignacion("u3", "r2")],
    hostRequests: [
      // Lo que manda el botón "Pedir supervisor": el mensaje fijo, en español, GUARDADO.
      { id: "q1", session_id: "s1", room_id: "r1", user_id: "u1", message: "Necesito ayuda", status: "open", created_at: iso(hace(2)) },
      { id: "q2", session_id: "s1", room_id: "r2", user_id: "u3", message: "Llamada privada", status: "acknowledged",
        oneone_livekit_room: "oo-1", created_at: iso(hace(1)) },
    ],
    screenShareRequests: [],
    meets: [{
      id: "m1", session_id: "s1", created_by: "me", livekit_room_name: "meet-1", title: "Meet", started_at: iso(hace(30)),
      ended_at: null, end_reason: null,
      participantes: [{ id: "p1", meet_id: "m1", session_id: "s1", user_id: "u3", room_id: "r2", joined_at: iso(hace(30)), left_at: null, left_reason: null }],
    }],
    myMembership: { id: "mm", session_id: "s1", user_id: "me", role: "host" }, myAssignment: null, isHost: true, loading: false,
    profiles: { u1: "Laura Gomez", u2: "Mateo Ruiz", u3: "Sofia Diaz", sup2: "Pedro Castro", me: "Jhon Lopez" },
    avatares: {},
    issueLiveKitToken: async () => ({ token: "t", url: "wss://x" }),
    listMyActiveSessions: async () => [], adminListSessions: async () => [],
    barrerAsignacionesColgadas: ok, requestHost, ackHostRequest: ok, resolveHostRequest: ok,
    crearMeetGrupal: ok, terminarMeetGrupal: ok, joinMeetGrupal: ok, joinOneOnOne: ok, joinSession: ok,
    renameSession: ok, updateAlertRules: ok, addRoom: ok, updateRoom: ok, closeRoom: ok, getHostCode: ok, refetch: ok,
  };
}

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LanguageProvider>
          {/* El doble no tiene TODOS los métodos del hook: los que esta pantalla no toca. */}
          <CoworkHostDashboard cowork={coworkFalso() as never} userId="me" />
        </LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("Cowork · tablero del supervisor en inglés", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("app-language", "en");
    avisos.length = 0;
    voz.length = 0;
    alMorirLaVoz.length = 0;
  });

  it("las salas, el panel y los chips no tienen nada en español", async () => {
    montar();
    await screen.findByText("Requests");
    // Deja que carguen los topes de pausa (la tabla) y corran los avisos del primer tic.
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

    expect(enEspanol(document.body)).toEqual([]);
    // Los estados que cambian el texto, dichos en inglés.
    expect(screen.getByText("No participants")).toBeTruthy();                     // Room 3
    expect(screen.getAllByText("In group meet").length).toBeGreaterThan(0);        // Room 2, toda en el meet
    expect(screen.getByText(/^Laura Gomez · Break −/)).toBeTruthy();               // chip de la pausa pasada
    expect(screen.getByText(/^Mateo Ruiz · No face · /)).toBeTruthy();             // chip de encuadre
    expect(screen.getByText(/^Mateo Ruiz · No screen · /)).toBeTruthy();           // chip de pantalla
    expect(screen.getByText("3 people connected across 3 rooms.")).toBeTruthy();
    expect(screen.getByText("Supervisors paused (1)")).toBeTruthy();
    expect(screen.getByText("Lunch")).toBeTruthy();
    // El mensaje guardado en español se lee en el idioma de quien mira.
    expect(screen.getByText("I need help")).toBeTruthy();
    expect(screen.getByText("Private call")).toBeTruthy();
  });

  it("los avisos que disparan los primeros tics salen en inglés; la voz sigue en español", async () => {
    montar();
    await screen.findByText("Requests");
    // El aviso de la pausa pasada espera a que lleguen los topes (la tabla) y al
    // siguiente tic del reloj de un segundo.
    await act(async () => { await new Promise((r) => setTimeout(r, 1_200)); });

    const textos = textosDeAvisos(avisos);
    expect(textos).toContain("Laura Gomez: over break time");
    expect(textos).toContain("Mateo Ruiz: no face");
    expect(textos).toContain("Mateo Ruiz: not sharing screen");
    expect(textos.filter((t) => pareceEspanol(t))).toEqual([]);
    // Lo HABLADO no se tradujo: el motor de voz está en español.
    expect(voz).toContain("Mateo Ruiz no está frente a la cámara");
    expect(voz.some((v) => v.startsWith("Laura Gomez lleva") && v.endsWith("pasado de su break"))).toBe(true);

    // Si el motor de voz se traba, el aviso lo dice en inglés, motivo incluido
    // (lib/colaDeVoz lo manda en español).
    avisos.length = 0;
    act(() => { alMorirLaVoz.forEach((cb) => cb("el navegador aceptó la frase pero nunca la reprodujo")); });
    const muerta = textosDeAvisos(avisos);
    expect(muerta[0]).toBe("Voice alerts aren't playing");
    expect(muerta[1]).toMatch(/^The browser accepted the phrase but never played it\. Quit the browser/);
    expect(muerta.filter((t) => pareceEspanol(t))).toEqual([]);
  });

  it("las reglas de la sesión, abiertas en Personalizado, están en inglés", async () => {
    montar();
    await screen.findByText("Requests");
    fireEvent.click(screen.getByRole("button", { name: "This session's rules" }));
    const dialogo = await screen.findByRole("dialog");
    fireEvent.click(within(dialogo).getByRole("button", { name: "Custom" }));
    expect(within(dialogo).getAllByText("First alert").length).toBe(3);
    expect(within(dialogo).getByText("Nobody on camera")).toBeTruthy();
    expect(within(dialogo).getByText(/^Customized by Jhon Lopez · /)).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
  });

  it("la vista Pausas y meets está en inglés", async () => {
    montar();
    await screen.findByText("Requests");
    fireEvent.click(screen.getByRole("button", { name: "Pauses" }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("2 days over on bathroom · 2 breaks over (+15 min)")).toBeTruthy();
    expect(within(dialogo).getByText("1 pause left open (closed the tab)")).toBeTruthy();
    expect(within(dialogo).getAllByText("On track").length).toBe(2);
    // A mitad de renglón va en minúscula (la tarjeta del meet en el tablero, con mayúscula).
    expect(within(dialogo).getByText("· called by Jhon Lopez")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
  });

  it("en español dice lo mismo que antes, palabra por palabra", async () => {
    localStorage.setItem("app-language", "es");
    montar();
    await screen.findByText("Solicitudes");
    expect(screen.getByText("Sin participantes")).toBeTruthy();
    expect(screen.getByText("3 personas conectadas en 3 salas.")).toBeTruthy();
    expect(screen.getByText("Necesito ayuda")).toBeTruthy();
    expect(screen.getByText(/^Mateo Ruiz · Sin rostro · /)).toBeTruthy();
    expect(screen.getByText("Supervisores en pausa (1)")).toBeTruthy();

    // Pausas y meets: «· lo invocó …» en minúscula, como siempre.
    fireEvent.click(screen.getByRole("button", { name: "Pausas" }));
    let dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("· lo invocó Jhon Lopez")).toBeTruthy();
    fireEvent.keyDown(dialogo, { key: "Escape" });

    // Añadir sala: el título y el botón dicen «Añadir» (no el «Agregar» de common.add).
    fireEvent.click(screen.getAllByTitle("Añadir sala")[0]);
    dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Añadir sala")).toBeTruthy();
    expect(within(dialogo).getByRole("button", { name: "Añadir" })).toBeTruthy();
  });

  it("el meet grupal y los diálogos de sala están en inglés", async () => {
    montar();
    await screen.findByText("Requests");
    fireEvent.click(screen.getByTitle("Group meet: take the people from one or more rooms to a temporary room"));
    let dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Nobody here")).toBeTruthy();                 // Room 3
    expect(within(dialogo).getByText("Laura Gomez, Mateo Ruiz · 1 paused")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
    fireEvent.keyDown(dialogo, { key: "Escape" });

    fireEvent.click(screen.getAllByTitle("Add room")[0]);
    dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByPlaceholderText("e.g. Room 3")).toBeTruthy();
    expect(within(dialogo).getByRole("button", { name: "Add" })).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
  });
});
