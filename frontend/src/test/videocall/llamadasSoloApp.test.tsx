import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

// LLAMADAS INTERNAS SOLO EN LA APP (Alvaro, 18/11/2026). Como Cowork: en el
// navegador de un computador, una llamada del Messenger o un Meet interno
// (/call/:sala con sesión) no se conecta y sale «Abrir en la app / Descargar».
//
// Lo que se cuida:
//   · en el navegador del computador, desde la fecha: bloqueada;
//   · en la app y en el celular: nunca;
//   · mientras no se sabe la fecha no se conecta (listo = false), y si la
//     lectura falla no se bloquea;
//   · el invitado de afuera (/entrar, /unirse) nunca pasa por el bloqueo;
//   · la llamada entrante en el navegador ofrece contestar en la app.

const estado = vi.hoisted(() => ({
  enApp: false,
  fila: { llamadas_solo_app_desde: "2026-11-18T00:00:00Z", cowork_solo_app_probadores: [] as string[] } as Record<string, unknown> | null,
  error: null as unknown,
  columnas: [] as string[],
}));

vi.mock("@/lib/escritorio", () => ({ escritorio: () => (estado.enApp ? { esApp: true, plataforma: "mac" } : null) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" } }) }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: (c: string) => {
        estado.columnas.push(c);
        return { eq: () => ({ maybeSingle: async () => ({ data: estado.fila, error: estado.error }) }) };
      },
    }),
  },
}));
vi.mock("@/hooks/useLanguage", () => {
  const idioma = { language: "es", setLanguage: () => {}, t: (k: string) => k };
  return { useLanguage: () => idioma, useLanguageSiHay: () => idioma };
});
vi.mock("@/hooks/useFormato", () => ({ useFormato: () => ({ intl: () => "es" }) }));

const { useLlamadasSoloApp, BloqueoSoloApp } = await import("@/components/CoworkSoloApp");
const { salaPideApp, estadoSoloApp } = await import("@/lib/coworkSoloApp");
const { default: IncomingCallModal } = await import("@/pages/messenger/components/IncomingCallModal");

const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/157 Safari/537.36";
const WIN = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/157 Safari/537.36";
const CEL = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile/15E148";

const uaOriginal = navigator.userAgent;
function usarNavegador(ua: string, tactil = 0) {
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
  Object.defineProperty(navigator, "maxTouchPoints", { value: tactil, configurable: true });
}

const fuentes = (import.meta as unknown as {
  glob: (p: string[], o: Record<string, unknown>) => Record<string, string>;
}).glob([
  "/frontend/src/pages/VideoCallPage.tsx",
  "/frontend/src/pages/meet/MeetGuestPage.tsx",
  "/frontend/src/pages/meet/MeetLinkPage.tsx",
  "/frontend/src/App.tsx",
  "/frontend/src/components/CallProvider.tsx",
], { query: "?raw", import: "default", eager: true });
const fuente = (f: string) => fuentes[`/frontend/src/${f}`] ?? "";

beforeEach(() => {
  estado.enApp = false;
  estado.fila = { llamadas_solo_app_desde: "2026-11-18T00:00:00Z", cowork_solo_app_probadores: [] };
  estado.error = null;
  estado.columnas = [];
});
afterEach(() => usarNavegador(uaOriginal, 0));

describe("llamada interna en el navegador del computador", () => {
  it("queda bloqueada desde la fecha (Mac y Windows) y lee la fecha de llamadas, no la de Cowork", async () => {
    for (const ua of [MAC, WIN]) {
      usarNavegador(ua);
      const { result, unmount } = renderHook(() => useLlamadasSoloApp());
      // Antes de leer la fecha no se conecta.
      expect(result.current.listo).toBe(false);
      await waitFor(() => expect(result.current.listo).toBe(true));
      expect(result.current.estado).toBe("bloqueo");
      unmount();
    }
    expect(estado.columnas.every((c) => c.startsWith("llamadas_solo_app_desde"))).toBe(true);
  });

  it("sin fecha, o si la lectura falla, no se bloquea", async () => {
    usarNavegador(MAC);
    estado.fila = { llamadas_solo_app_desde: null, cowork_solo_app_probadores: [] };
    const a = renderHook(() => useLlamadasSoloApp());
    await waitFor(() => expect(a.result.current.listo).toBe(true));
    expect(a.result.current.estado).toBe("nada");
    a.unmount();

    estado.fila = null;
    estado.error = { message: "column does not exist" };
    const b = renderHook(() => useLlamadasSoloApp());
    await waitFor(() => expect(b.result.current.listo).toBe(true));
    expect(b.result.current.estado).toBe("nada");
  });

  it("muestra la misma pantalla de Cowork con abrir en la app y descargar", () => {
    usarNavegador(MAC);
    render(<MemoryRouter><BloqueoSoloApp lugar="llamadas" /></MemoryRouter>);
    expect(screen.getByText("messenger.soloApp.titulo")).toBeTruthy();
    expect(screen.getByText("cowork.soloApp.abrir").closest("a")?.getAttribute("href")).toMatch(/^maven:\/\/abrir\?ruta=/);
    expect(screen.getByText("cowork.soloApp.descargar").closest("a")).toBeTruthy();
  });

  it("VideoCallPage no conecta ni marca «contestó» mientras está bloqueada", () => {
    const p = fuente("pages/VideoCallPage.tsx");
    expect(p).toMatch(/useLlamadasSoloApp\(\)/);
    expect(p).toMatch(/<BloqueoSoloApp lugar="llamadas" \/>/);
    expect(p).toMatch(/const conectada = joined && !bloqueada;/);
    expect(p).toMatch(/if \(!conectada \|\| !esDelMessenger/);
    expect(p).toMatch(/isLoading \|\| !profile \|\| bloqueada/);
  });
});

describe("en la app y en el celular, la llamada sigue igual", () => {
  it("en la app de Maven no se bloquea y responde al instante", () => {
    usarNavegador(MAC);
    estado.enApp = true;
    const { result } = renderHook(() => useLlamadasSoloApp());
    expect(result.current.listo).toBe(true);
    expect(result.current.estado).toBe("nada");
  });

  it("en el celular (y el iPad que se hace pasar por Mac) no se bloquea", () => {
    usarNavegador(CEL);
    expect(renderHook(() => useLlamadasSoloApp()).result.current).toMatchObject({ listo: true, estado: "nada" });
    usarNavegador(MAC, 5);
    expect(renderHook(() => useLlamadasSoloApp()).result.current).toMatchObject({ listo: true, estado: "nada" });
  });

  it("las salas de Cowork las resuelve Cowork; las demás piden la app", () => {
    expect(salaPideApp("cowork_abc")).toBe(false);
    expect(salaPideApp("cowork_hub_abc")).toBe(false);
    expect(salaPideApp("call-123")).toBe(true);
    expect(salaPideApp("dm_a_b")).toBe(true);
    expect(salaPideApp("meet_xyz")).toBe(true);
    expect(estadoSoloApp({ ua: MAC, tactil: false, enApp: true, desde: new Date(0), ahora: new Date() })).toBe("nada");
  });
});

describe("el invitado de afuera nunca se bloquea", () => {
  it("/entrar y /unirse son públicas y no miran el bloqueo", () => {
    for (const f of ["pages/meet/MeetGuestPage.tsx", "pages/meet/MeetLinkPage.tsx"]) {
      const p = fuente(f);
      expect(p.length).toBeGreaterThan(0);
      expect(p).not.toMatch(/SoloApp/);
    }
    const app = fuente("App.tsx");
    expect(app).toMatch(/<Route path="\/entrar\/:code" element=\{<MeetGuestPage \/>\} \/>/);
    expect(app).toMatch(/<Route path="\/unirse\/:link" element=\{<MeetLinkPage \/>\} \/>/);
  });
});

describe("llamada entrante en el navegador", () => {
  const llamada = { id: "c1", caller_id: "u2", receiver_id: "u1", call_status: "ringing", room_id: "call-1", start_time: null, end_time: null, caller_name: "Ana", call_type: "video" } as never;

  it("ofrece contestar en la app y descargarla", () => {
    render(<IncomingCallModal call={llamada} onAccept={() => {}} onDecline={() => {}} enLaApp />);
    // 26/11/2026: la llamada entrante es una tarjeta con botones redondos; el texto va en la etiqueta.
    expect(screen.getByLabelText("messenger.incoming.contestarEnApp")).toBeTruthy();
    expect(screen.getByText("messenger.incoming.descargarApp").closest("a")).toBeTruthy();
    expect(screen.queryByLabelText("messenger.incoming.aceptar")).toBeNull();
  });

  it("en la app sigue siendo «Aceptar» de siempre", () => {
    render(<IncomingCallModal call={llamada} onAccept={() => {}} onDecline={() => {}} />);
    expect(screen.getByLabelText("messenger.incoming.aceptar")).toBeTruthy();
    expect(screen.queryByText("messenger.incoming.descargarApp")).toBeNull();
  });

  it("CallProvider pasa el bloqueo al contestar", () => {
    const p = fuente("components/CallProvider.tsx");
    expect(p).toMatch(/call\.acceptCall\(\{ enLaApp \}\)/);
  });
});
