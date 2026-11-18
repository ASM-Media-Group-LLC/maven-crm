// Las páginas sueltas de la ola 3 (paginas-a) en INGLÉS: Ajustes →
// Notificaciones (las seis pestañas), la campana, Meet (la portada, la sala de
// espera del invitado y el panel que lo admite), Grabaciones, Teléfonos,
// Oficina, Telegram → Cuentas y las pantallas de bloqueo de la vista pública
// del chatter. Nada visible en español.
//
// Cada pantalla se monta REAL con el LanguageProvider de verdad; solo se
// reemplazan los hooks que leen la base. Lo que es de OTRO dueño de la ola (el
// catálogo de eventos de lib/, los rótulos de los filtros de
// lib/notificationHelpers, el bloque de push de este dispositivo) se cambia por
// un doble en inglés: aquí se mira el texto de ESTAS páginas.
//
// Lo que NO se traduce también se prueba: el módulo de un aviso se guarda con su
// nombre en español ("Correo"), la pestaña viaja en la URL con su id
// ("canales") y el permiso de Meet sigue siendo "Crear reunión".
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor, configure } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { LanguageProvider } from "@/hooks/useLanguage";
import translations from "@/lib/i18n";
import { esEspanol } from "../i18n/detectarEspanol";

// Pantallas enteras: con toda la suite corriendo en paralelo, los 5 s por test
// (y el segundo de findBy/waitFor) a veces no alcanzan sin que haya nada roto.
configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 30_000 });

if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const estado = vi.hoisted(() => ({
  preferencias: [] as Array<Record<string, unknown>>,
  permisosExplicitos: [] as string[],
  meetStatus: "idle" as string,
  meetCall: null as null | { room: string },
}));

// ── Ajustes → Notificaciones ────────────────────────────────────────────────
vi.mock("@/hooks/useNotificationSettings", () => ({
  useNotificationSettings: () => ({
    settings: {
      notifications_enabled: true, realtime_enabled: true, group_similar: false, auto_mark_read_on_open: false,
      sound_enabled: true, show_critical_banners: true, push_enabled: false, dnd_enabled: true,
      dnd_start_time: "22:00", dnd_end_time: "08:00", dnd_allow_critical: true, digest_enabled: true,
      digest_frequency: "daily", digest_time: "08:00", digest_channel: "in_app",
    },
    updateSettings: { mutate: vi.fn(), isPending: false },
  }),
}));
vi.mock("@/hooks/useNotificationPreferences", () => ({
  useNotificationPreferences: () => ({
    preferences: [{ channel_in_app: false, channel_push: true, channel_email: true }],
    isLoading: false,
    upsertPreference: { mutate: (p: Record<string, unknown>) => estado.preferencias.push(p) },
    upsertVarias: { mutate: vi.fn() },
    isCanalActivo: () => true,
  }),
}));
vi.mock("@/lib/catalogoDeEventos", () => ({
  CATALOGO_DE_EVENTOS: [
    { modulo: "Correo", permiso: null, eventos: [{ type: "mail_new", label: "New email", descripcion: "Only to your phone.", canales: ["push"] }] },
    { modulo: "Messenger", permiso: null, eventos: [{ type: "chat_mention", label: "Mentions", canales: ["in_app", "email"] }] },
  ],
}));
vi.mock("@/pages/ajustes/notificaciones/NotificacionesEnEsteDispositivo", () => ({ default: () => null }));
vi.mock("@/lib/notificationHelpers", () => ({
  resolveDeepLink: () => "/",
  MODULE_OPTIONS: [{ value: "messenger", label: "Messenger" }],
  MODULE_PERMISSION_MAP: {},
  PRIORITY_OPTIONS: [{ value: "high", label: "High" }],
  STATUS_OPTIONS: [{ value: "new", label: "New" }],
}));
vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => ({
    notifications: [], isLoading: false, markAsRead: { mutate: vi.fn() }, markAllAsRead: { mutate: vi.fn() },
    archiveNotification: { mutate: vi.fn() }, archiveAll: { mutate: vi.fn() }, deleteNotification: { mutate: vi.fn() },
  }),
}));

// ── Comunes ─────────────────────────────────────────────────────────────────
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1", email: "me@maven-ai.me" } }) }));
vi.mock("@/hooks/usePermissions", () => ({
  usePermissions: () => ({
    canAccess: () => true,
    explicitPermission: (_m: string, sub: string) => {
      estado.permisosExplicitos.push(sub);
      return true;
    },
  }),
}));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: true, role: "admin", isLoading: false }) }));
// Crear y agendar reuniones es de supervisores y arriba (Alvaro, 17/11/2026):
// el usuario de la prueba es admin, así que ve «New meeting» y «Schedule».
vi.mock("@/hooks/useRoleTier", () => ({ useRoleTier: () => ({ tier: "admin", isLoading: false, isSupervisorOrAbove: true }) }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));

// ── Meet ────────────────────────────────────────────────────────────────────
vi.mock("@/hooks/useMeetRooms", () => ({
  useMeetRooms: () => ({
    myRooms: [{ id: "r1", code: "ABC234", name: "Weekly sync", livekit_room_name: "meet_r1", isHost: true, pinned: false }],
    setMyRooms: vi.fn(), loading: false, createRoom: vi.fn(), joinByCode: vi.fn(), resolveByLivekitRoom: vi.fn(),
    renameRoom: vi.fn(), setPinned: vi.fn(), reorder: vi.fn(), endRoom: vi.fn(),
  }),
}));
vi.mock("@/hooks/useMeetGuest", () => ({
  useMeetGuest: () => ({
    status: estado.meetStatus, error: null, roomName: "Weekly sync", guestName: "", call: estado.meetCall,
    knock: vi.fn(), getToken: vi.fn(), leave: vi.fn(),
  }),
}));
// La llamada en sí es de otra pantalla: aquí solo hace falta su botón de salir,
// para llegar a la pantalla «Saliste de la reunión» del invitado.
vi.mock("@/pages/messenger/videocall/LiveKitCallView", () => ({
  default: ({ onLeave }: { onLeave: () => void }) => (
    <button type="button" onClick={onLeave}>leave-call</button>
  ),
}));
vi.mock("@/components/LlamadaEnVentanaFlotante", () => ({
  LlamadaEnVentanaFlotante: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

// ── Grabaciones ─────────────────────────────────────────────────────────────
vi.mock("@/hooks/useRecordings", async (original) => {
  const real = await original<typeof import("@/hooks/useRecordings")>();
  const ahora = new Date().toISOString();
  const en = (d: number) => new Date(Date.now() + d * 86400000).toISOString();
  return {
    ...real,
    useRecordings: () => ({
      rows: [
        { id: "g1", room_name: "meet_r1", source: "meet", title: "Weekly sync", started_by: "u1", started_at: ahora, ended_at: ahora, duration_seconds: 125, size_bytes: 3_000_000, status: "ready", expires_at: en(1) },
        { id: "g2", room_name: "cowork_x", source: "cowork", title: null, started_by: "u2", started_at: ahora, ended_at: null, duration_seconds: null, size_bytes: null, status: "recording", expires_at: null },
        { id: "g3", room_name: "cowork_y", source: "cowork", title: "Night shift", started_by: "u2", started_at: ahora, ended_at: ahora, duration_seconds: 60, size_bytes: null, status: "processing", expires_at: null },
      ],
      grabadores: { u2: { id: "u2", full_name: "Dana Host", avatar_url: null, avatar_seed: null } },
      usage: { total_recordings: 3, total_bytes: 3_000_000, expiring_next_week: 1 },
      myUserId: "u1", loading: false, download: vi.fn(), view: vi.fn(), remove: vi.fn(),
      filtros: real.FILTROS_VACIOS, setFiltros: vi.fn(), cargarMas: vi.fn(), cargandoMas: false, hayMas: true, refresh: vi.fn(),
    }),
  };
});

// ── Oficina ─────────────────────────────────────────────────────────────────
vi.mock("@/hooks/useDocumentos", () => ({
  useDocumentos: () => ({
    data: [
      { id: "d1", title: "Onboarding guide", folder: null, visibility: "equipo", owner_id: "u1", created_at: "2026-09-01T00:00:00Z", updated_at: new Date().toISOString(), updated_by: null, deleted_at: null, storage_key: "k", extension: "docx", size_bytes: 10, version: 3 },
      { id: "d2", title: "", folder: null, visibility: "privado", owner_id: "u1", created_at: "2026-09-01T00:00:00Z", updated_at: "2025-01-10T00:00:00Z", updated_by: null, deleted_at: null, storage_key: "k", extension: "docx", size_bytes: 10, version: 1 },
    ],
    isPending: false, isError: false, error: null, refetch: vi.fn(),
  }),
  usePapelera: () => ({ mutate: vi.fn() }),
  useBorrarDocumento: () => ({ mutate: vi.fn() }),
  useRenombrarDocumento: () => ({ mutate: vi.fn(), isPending: false }),
  useDocumentosQuePuedoEditar: () => ({ data: new Set<string>() }),
  puedoEditarDocumento: () => true,
  SIN_PERMISO_DOCUMENTO: "sin_permiso",
}));
vi.mock("@/hooks/useOnlyOffice", () => ({ useCrearDocumentoOffice: () => ({ mutate: vi.fn(), isPending: false }) }));

// ── Teléfonos y Telegram (leen por supabase) ─────────────────────────────────
vi.mock("@/integrations/supabase/client", () => {
  const cadena = (data: unknown) => {
    const c: Record<string, unknown> = {};
    for (const m of ["select", "eq", "order", "in", "limit", "gte"]) c[m] = () => c;
    c.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data, error: null }).then(ok);
    return c;
  };
  return {
    supabase: {
      auth: { getSession: () => Promise.resolve({ data: { session: null } }) },
      from: (tabla: string) =>
        cadena(tabla === "tg_channels"
          ? [{ id: "ch1", account_id: "tg:555", label: "Main line", default_assignees: [] }]
          : [{ id: "u1", full_name: "Me Myself" }]),
      functions: {
        invoke: (fn: string, opts?: { body?: { action?: string } }) => {
          if (fn === "cloudphone" && opts?.body?.action === "list") {
            return Promise.resolve({
              data: {
                ok: true, isAdmin: true,
                phones: [
                  { id: "p1", serial_name: "Phone 01", remark: "Main", assigned_to: [], session: null },
                  { id: "p2", serial_name: "Phone 02", assigned_to: ["u1"], session: { userId: "u1", user_name: "Me Myself" } },
                ],
              },
              error: null,
            });
          }
          if (fn === "cloudphone" && opts?.body?.action === "users") return Promise.resolve({ data: { ok: true, users: [{ id: "u1", full_name: "Me Myself" }] }, error: null });
          if (fn === "cloudphone" && opts?.body?.action === "usage") {
            return Promise.resolve({ data: { ok: true, byUser: [{ user_id: "u1", full_name: "Me Myself", minutes: 30, sessions: 2 }], recent: [] }, error: null });
          }
          return Promise.resolve({ data: { ok: true, accounts: 1 }, error: null });
        },
      },
    },
    supabaseAnon: { functions: { invoke: () => Promise.resolve({ data: { ok: true }, error: null }) } },
  };
});

import NotificacionesSettings from "@/pages/ajustes/NotificacionesSettings";
import Notificaciones from "@/pages/Notificaciones";
import MeetPage from "@/pages/meet/MeetPage";
import MeetGuestPage from "@/pages/meet/MeetGuestPage";
import GrabacionesPage from "@/pages/grabaciones/GrabacionesPage";
import TelefonosPage from "@/pages/telefonos/TelefonosPage";
import OficinaPage from "@/pages/oficina/OficinaPage";
import TelegramChannelsPage from "@/pages/telegram/TelegramChannelsPage";
import DiagnosticoPantalla from "@/pages/DiagnosticoPantalla";
import CorreoConectarPage from "@/pages/correo/CorreoConectarPage";
import { Route, Routes } from "react-router-dom";

function textosVisibles(raiz: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement?.closest("code, pre")) continue;
    const t = (n.textContent ?? "").trim();
    if (t) out.push(t);
  }
  for (const el of Array.from(raiz.querySelectorAll("[title], [placeholder], [aria-label]"))) {
    for (const a of ["title", "placeholder", "aria-label"]) {
      const v = el.getAttribute(a);
      if (v) out.push(v);
    }
  }
  return out;
}
const SOLO_ESPANOL = new Set(
  Object.values(translations as Record<string, { es: string; en: string }>)
    .filter((p) => p.es !== p.en && /[a-zA-Z]{2}/.test(p.es))
    .map((p) => p.es),
);
const enEspanol = (raiz: HTMLElement = document.body) =>
  textosVisibles(raiz).filter((t) => esEspanol(t) || SOLO_ESPANOL.has(t));

function montar(ui: ReactNode, url = "/") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[url]}>
        <LanguageProvider>{ui}</LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.setItem("app-language", "en");
  estado.preferencias.length = 0;
  estado.permisosExplicitos.length = 0;
  estado.meetStatus = "idle";
  estado.meetCall = null;
});

describe("Ajustes → Notificaciones en inglés", () => {
  const pestanas: Array<[string, string]> = [
    ["general", "General preferences"],
    ["canales", "Notification channels"],
    ["eventos", "What Maven alerts you about, and where"],
    ["prioridad", "Notification priority"],
    ["resumenes", "Automatic digests"],
    ["no-molestar", "Do not disturb"],
  ];
  for (const [id, titulo] of pestanas) {
    it(`la pestaña «${id}» no tiene nada en español`, async () => {
      montar(<NotificacionesSettings />, id === "general" ? "/ajustes/notificaciones" : `/ajustes/notificaciones?tab=${id}`);
      expect((await screen.findAllByText(titulo)).length).toBeGreaterThan(0);
      expect(screen.getByText("Notification settings")).toBeTruthy();
      expect(enEspanol()).toEqual([]);
    });
  }

  it("en Eventos el módulo se ve traducido pero se guarda con su nombre", async () => {
    montar(<NotificacionesSettings />, "/ajustes/notificaciones?tab=eventos");
    expect(await screen.findByText("Mail")).toBeTruthy();
    fireEvent.click(screen.getByRole("switch", { name: "New email · Phone" }));
    await waitFor(() => expect(estado.preferencias[0]).toMatchObject({ module: "Correo", notification_type: "mail_new" }));
  });

  it("la campana (sin avisos) tampoco", async () => {
    montar(<Notificaciones />);
    await screen.findByText("No notifications.");
    expect(enEspanol()).toEqual([]);
  });
});

describe("Meet en inglés", () => {
  it("la portada con una reunión abierta y el diálogo de renombrar", async () => {
    montar(<MeetPage />);
    await screen.findByText("Weekly sync");
    expect(screen.getByText("New meeting")).toBeTruthy();
    expect(screen.getByText("Schedule")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Rename" }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Meeting name")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
    // El permiso se consulta con su llave de role_permissions.
    expect(estado.permisosExplicitos).toContain("Crear reunión");
  });

  for (const status of ["idle", "pending", "denied", "ended"]) {
    it(`la sala del invitado (estado ${status})`, async () => {
      estado.meetStatus = status;
      montar(
        <Routes><Route path="/entrar/:code" element={<MeetGuestPage />} /></Routes>,
        "/entrar/ABC234",
      );
      await waitFor(() => expect(document.body.textContent).toMatch(/meeting|let in|join/i));
      expect(enEspanol()).toEqual([]);
    });
  }

  it("el invitado que sale de la llamada ve «You left the meeting» en inglés", async () => {
    estado.meetStatus = "admitted";
    estado.meetCall = { room: "meet_r1" };
    montar(
      <Routes><Route path="/entrar/:code" element={<MeetGuestPage />} /></Routes>,
      "/entrar/ABC234",
    );
    fireEvent.click(await screen.findByRole("button", { name: "leave-call" }));
    await screen.findByText(translations["meet.guest.left"].en);
    expect(screen.getByText(translations["meet.guest.leftHint"].en)).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });
});

describe("Grabaciones, Teléfonos, Oficina y Telegram en inglés", () => {
  it("Grabaciones: la lista con una lista, una en curso y una procesando", async () => {
    montar(<GrabacionesPage />);
    await screen.findByText("Weekly sync");
    expect(screen.getByText(/expires in 1 day/)).toBeTruthy();
    expect(screen.getByText("Being recorded by")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("Teléfonos: tablero y dispositivos", async () => {
    montar(<TelefonosPage />);
    await screen.findByText("Minutes per person (30 days)");
    expect(enEspanol()).toEqual([]);
    fireEvent.mouseDown(screen.getByRole("tab", { name: /Devices/ }), { button: 0 });
    await screen.findByText("Phone 01");
    expect(screen.getByText(/In use/)).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("Oficina: la lista de documentos", async () => {
    montar(<OficinaPage />);
    await screen.findByText("Onboarding guide");
    expect(screen.getByText("Untitled")).toBeTruthy();
    expect(screen.getByText("Private")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("Telegram → Cuentas: las líneas y el editor", async () => {
    montar(<TelegramChannelsPage />);
    await screen.findByText("Main line");
    expect(screen.getByText("Lines and auto-assignment")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Edit line" }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Auto-assign new conversations to")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
  });

  it("Diagnóstico de pantalla y la vuelta del OAuth del correo", async () => {
    montar(<DiagnosticoPantalla />);
    await screen.findByText("Screen diagnostics");
    expect(enEspanol()).toEqual([]);
  });

  it("la vuelta del OAuth cancelada", async () => {
    montar(<CorreoConectarPage />, "/correo/conectar?error=access_denied");
    await screen.findByText("Couldn't connect");
    expect(enEspanol()).toEqual([]);
  });
});
