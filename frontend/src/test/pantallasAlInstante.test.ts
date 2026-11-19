import { describe, it, expect, beforeEach } from "vitest";
import { buzonGuardado } from "@/hooks/useMailbox";

// PANTALLAS AL INSTANTE (19/11/2026). Meta del dueño: Dashboard, Cowork,
// Messenger, Argos y Correo abren en menos de 1 s en un portátil normal. Estas
// guardas fijan lo que lo hizo posible, para que nadie lo deshaga sin darse
// cuenta: menos viajes EN FILA a Supabase antes de dibujar, el chunk de la
// página bajando en paralelo con la sesión, y nada pesado en el arranque que no
// se vea.
type Glob = { glob: (p: string, o: Record<string, unknown>) => Record<string, string> };
const uno = (m: Record<string, string>) => Object.values(m)[0] ?? "";
const rol = uno((import.meta as unknown as Glob).glob("/frontend/src/hooks/useUserRole.ts", { query: "?raw", import: "default", eager: true }));
const nivel = uno((import.meta as unknown as Glob).glob("/frontend/src/hooks/useRoleTier.ts", { query: "?raw", import: "default", eager: true }));
const permisos = uno((import.meta as unknown as Glob).glob("/frontend/src/hooks/usePermissions.ts", { query: "?raw", import: "default", eager: true }));
const chat = uno((import.meta as unknown as Glob).glob("/frontend/src/hooks/useChat.ts", { query: "?raw", import: "default", eager: true }));
const precarga = uno((import.meta as unknown as Glob).glob("/frontend/src/lib/prefetchRutas.ts", { query: "?raw", import: "default", eager: true }));
const main = uno((import.meta as unknown as Glob).glob("/frontend/src/main.tsx", { query: "?raw", import: "default", eager: true }));
const app = uno((import.meta as unknown as Glob).glob("/frontend/src/App.tsx", { query: "?raw", import: "default", eager: true }));
const muelle = uno((import.meta as unknown as Glob).glob("/frontend/src/components/messenger/MessengerDock.tsx", { query: "?raw", import: "default", eager: true }));
const cascaron = uno((import.meta as unknown as Glob).glob("/frontend/src/components/dashboard/AppShell.tsx", { query: "?raw", import: "default", eager: true }));
const argos = uno((import.meta as unknown as Glob).glob("/frontend/src/pages/hr/HRMonitorIA.tsx", { query: "?raw", import: "default", eager: true }));
const correo = uno((import.meta as unknown as Glob).glob("/frontend/src/hooks/useMailbox.ts", { query: "?raw", import: "default", eager: true }));
const tablero = uno((import.meta as unknown as Glob).glob("/frontend/src/pages/Dashboard.tsx", { query: "?raw", import: "default", eager: true }));
const cowork = uno((import.meta as unknown as Glob).glob("/frontend/src/pages/cowork/CoworkPage.tsx", { query: "?raw", import: "default", eager: true }));

describe("pantallas al instante", () => {
  it("se leyeron las fuentes (un glob vacío pasaría todo en verde)", () => {
    for (const f of [rol, nivel, permisos, chat, precarga, main, app, muelle, cascaron, argos, correo, tablero, cowork]) {
      expect(f.length).toBeGreaterThan(500);
    }
  });

  it("rol y grupo del rol salen a la vez, no en fila", () => {
    for (const f of [rol, nivel]) {
      expect(f).toMatch(/await Promise\.all\(\[\s*supabase\s*\.from\("user_roles"\)[\s\S]*?\.from\("role_groups"\)/);
      expect(f).not.toContain('.eq("role_name"');
    }
  });

  it("los permisos son UN viaje (con su roles_config embebido), no dos", () => {
    expect(permisos).toContain("roles_config!inner(name, is_active)");
    expect(permisos).not.toContain('.from("roles_config")');
  });

  it("la lista de chats: perfiles, participaciones, vistas previas y no leídos salen juntos", () => {
    expect(chat).toContain("void loadConversations(loadProfiles());");
    expect(chat).not.toMatch(/loadProfiles\(\)\.then\(\(perfiles\) => loadConversations/);
    const noLeidos = chat.indexOf('const noLeidosP = supabase.rpc("get_unread_counts"');
    const participaciones = chat.indexOf("const participaciones = await supabase");
    expect(noLeidos).toBeGreaterThan(-1);
    expect(noLeidos).toBeLessThan(participaciones);
    // Y se dispara de verdad: el builder de supabase no sale sin then.
    expect(chat).toContain('supabase.rpc("get_unread_counts", { _user_id: user.id }).then((r) => r)');
  });

  it("el chunk de la sección donde arranca la app baja en paralelo con la sesión", () => {
    expect(precarga).toContain('"/hr/monitor-ia": () => import("@/pages/hr/HRMonitorIA")');
    expect(app).toContain('const HRMonitorIA = lazy(() => import("./pages/hr/HRMonitorIA"));');
    const llamada = main.indexOf("precargarRutaActual();");
    expect(llamada).toBeGreaterThan(-1);
    expect(llamada).toBeLessThan(main.indexOf("raizDeLaApp.render"));
  });

  it("el arranque no arrastra el editor de mensajes ni el markdown de los avisos", () => {
    expect(muelle).not.toMatch(/^import DockChatWindow/m);
    expect(muelle).toContain('lazy(() => import("./DockChatWindow"))');
    expect(muelle).not.toMatch(/^import ClariAiFab/m);
    expect(cascaron).not.toMatch(/^import AnnouncementPopup/m);
    expect(cascaron).toContain('lazy(() => import("@/components/dashboard/AnnouncementPopup"))');
  });

  it("Argos dibuja «Dónde está» sin esperar el código de las otras pestañas", () => {
    expect(argos).toMatch(/^import \{ DondeEstaPanel \}/m);
    for (const panel of ["ConectadosAhoraPanel", "PantallazosVivoPanel", "ArgosHistorial", "LlamadasPanel", "EstadoPanel", "HistorialHubPanel", "RevisionCasos"]) {
      expect(argos).not.toMatch(new RegExp(`^import \\{ ${panel} \\}`, "m"));
      expect(argos).toContain(`const ${panel} = lazy(`);
    }
    expect(argos).toContain("<Suspense fallback={<CargandoPestana />}>");
  });

  it("el Dashboard pide el chunk de su tablero apenas sabe cuál es", () => {
    expect(tablero).toContain("const CentroDeOperaciones = lazy(cargarCentro);");
    expect(tablero).toMatch(/precargar\(cargarCentro\)/);
    expect(tablero).toMatch(/precargar\(cargarChatter\)/);
  });

  it("Cowork vuelve a su portada sin ruedita, con la lista fresca detrás", () => {
    expect(cowork).toContain("useState(!guardada?.mias)");
    expect(cowork).toContain("if (!portadaDe(uidSesion)?.mias) setLoadingSessions(true);");
  });

  it("el Correo no espera «¿tengo buzón?» para pedir la bandeja, y no pide select *", () => {
    expect(correo).toContain("placeholderData: () => buzonGuardado(user?.id)");
    expect(correo).not.toMatch(/from\("v_my_mailbox"\)\s*\.select\("\*"\)/);
  });

  it("lo ya visto se reutiliza al volver: la app guarda las consultas 5 min", () => {
    expect(app).toMatch(/staleTime: 5 \* 60_000/);
    expect(app).toMatch(/gcTime: 30 \* 60_000/);
  });
});

describe("el buzón guardado (anticipo del Correo)", () => {
  beforeEach(() => localStorage.clear());

  it("sin nada guardado no hay anticipo", () => {
    expect(buzonGuardado("u1")).toBeUndefined();
    expect(buzonGuardado(undefined)).toBeUndefined();
  });

  it("un buzón activo guardado sirve de anticipo; uno inactivo o roto no", () => {
    localStorage.setItem("maven:buzon:u1", JSON.stringify({ email_address: "a@maven-ai.me", is_active: true, has_error: false, created_at: "x", last_used_at: null }));
    expect(buzonGuardado("u1")?.email_address).toBe("a@maven-ai.me");
    expect(buzonGuardado("u2")).toBeUndefined();
    localStorage.setItem("maven:buzon:u1", JSON.stringify({ email_address: "a@maven-ai.me", is_active: false }));
    expect(buzonGuardado("u1")).toBeUndefined();
    localStorage.setItem("maven:buzon:u1", "{roto");
    expect(buzonGuardado("u1")).toBeUndefined();
  });
});
