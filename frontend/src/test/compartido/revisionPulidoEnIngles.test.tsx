// Lo que encontró la revisión del pulido de la ola 1 (#1929), con la app en
// INGLÉS y con el LanguageProvider real:
//  - la lista de participantes de la llamada decía "Delete" para sacar a alguien
//    (el recuadro ya decía "Remove");
//  - el aviso de correo no enviado mostraba comillas invertidas;
//  - cambiar de idioma volvía a correr la consulta de canales de venta de
//    Contactos y la dejaba VACÍA mientras recargaba (el filtro de canal se
//    quedaba sin ids);
//  - el selector de evaluador mostraba "Sin nombre" en inglés.
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, renderHook, act, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { LanguageProvider, useLanguage } from "@/hooks/useLanguage";
import { fijarIdioma } from "@/lib/i18n";
import { compartido } from "@/lib/i18n/compartido";
import { esEspanol } from "../i18n/detectarEspanol";
import type { LKParticipant } from "@/hooks/useLiveKit";

// ── La base, de mentira: solo las dos RPC que se prueban acá ────────────────
const rpc = vi.fn();
vi.mock("@/integrations/supabase/client", () => {
  const consulta: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "is", "gte", "lte"]) consulta[m] = () => consulta;
  consulta.order = () => Promise.resolve({ data: [], error: null });
  return {
    supabase: {
      rpc: (...args: unknown[]) => rpc(...args),
      from: () => consulta,
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }) },
    },
  };
});

// Quien abre el diálogo de sesión nueva: sin nombre en la lista de evaluadores.
vi.mock("@/hooks/useAuth", () => {
  const sesion = { user: { id: "u-yo", email: "", user_metadata: {} } };
  return { useAuth: () => sesion };
});

import CallParticipantsSidebar from "@/pages/messenger/videocall/CallParticipantsSidebar";
import { useContactSalesChannels } from "@/pages/contactos/useContactSalesChannels";
import { NewSessionDialog } from "@/pages/chatter-evaluator/NewSessionDialog";

const clienteNuevo = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

const envolver = (idioma: "es" | "en") => {
  localStorage.setItem("app-language", idioma);
  const cliente = clienteNuevo();
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cliente}>
      <MemoryRouter>
        <LanguageProvider>{children}</LanguageProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
};

/** Todo el texto visible y los atributos que se leen en pantalla. */
function textosVisibles(raiz: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement?.closest("code, pre, script, style")) continue;
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

afterEach(() => {
  cleanup();
  rpc.mockReset();
  localStorage.removeItem("app-language");
  fijarIdioma("es");
});

describe("Llamada → lista de participantes: sacar a alguien", () => {
  const participantes: LKParticipant[] = [
    { sid: "s1", identity: "user-1", name: "Me", isSpeaking: false, isMuted: false, isCameraOff: false, isScreenSharing: false, isLocal: true, handRaised: false, reactions: [], connectionQuality: "excellent", hasVideoTrack: false },
    { sid: "s2", identity: "user-2", name: "Ann Lee", isSpeaking: false, isMuted: false, isCameraOff: false, isScreenSharing: false, isLocal: false, handRaised: false, reactions: [], connectionQuality: "good", hasVideoTrack: false },
  ];

  it("en inglés el menú del anfitrión dice Remove, no Delete, y no queda español", () => {
    const Envoltorio = envolver("en");
    const onRemove = vi.fn();
    render(
      <Envoltorio>
        <CallParticipantsSidebar
          participants={participantes}
          isAdmin
          onMuteParticipant={() => {}}
          onRemoveParticipant={onRemove}
          onClose={() => {}}
        />
      </Envoltorio>,
    );
    // Radix abre el menú con Enter (jsdom no dispara la apertura con un clic).
    fireEvent.keyDown(screen.getByRole("button", { name: "More options for Ann Lee" }), { key: "Enter" });
    const menu = screen.getByRole("menu");
    const quitar = within(menu).getByRole("menuitem", { name: "Remove" });
    expect(within(menu).queryByText("Delete")).toBeNull();
    expect(textosVisibles(document.body).filter(esEspanol)).toEqual([]);
    fireEvent.click(quitar);
    expect(onRemove).toHaveBeenCalledWith("user-2");
  });
});

describe("los textos de lo compartido no traen comillas invertidas", () => {
  // Son avisos y etiquetas: el usuario vería el ` tal cual. (El freno del
  // diccionario IGNORA lo que va entre comillas invertidas en la columna en, así
  // que nada más lo notaría.)
  it("ni en español ni en inglés", () => {
    const conComillas = Object.entries(compartido)
      .filter(([, v]) => v.es.includes("`") || v.en.includes("`"))
      .map(([k]) => k);
    expect(conComillas).toEqual([]);
  });
});

describe("Contactos → canales de venta al cambiar de idioma", () => {
  const RESPUESTA = {
    data: {
      channels: [{ id: "c1", label: "Ventas Norte" }],
      // c9 llega en las filas pero no en la lista: lleva la etiqueta de repuesto.
      rows: [
        { contact_id: "k1", channel_id: "c1", last_at: null },
        { contact_id: "k1", channel_id: "c9", last_at: null },
        { contact_id: "k2", channel_id: "c1", last_at: null },
      ],
    },
    error: null,
  };

  it("no vuelve a pedir la RPC ni se queda vacío; solo cambia la etiqueta de repuesto", async () => {
    rpc.mockResolvedValue(RESPUESTA);
    const vistos: number[] = [];
    const { result } = renderHook(
      () => {
        const canales = useContactSalesChannels(true);
        if (!canales.isLoading) vistos.push(canales.allContactedIds.length);
        return { canales, idioma: useLanguage() };
      },
      { wrapper: envolver("es") },
    );
    await waitFor(() => expect(result.current.canales.byContactId.size).toBe(2));
    expect(result.current.canales.byContactId.get("k1")!.map((c) => c.label)).toEqual(["Canal", "Ventas Norte"]);

    act(() => result.current.idioma.setLanguage("en"));
    expect(result.current.canales.byContactId.get("k1")!.map((c) => c.label)).toEqual(["Channel", "Ventas Norte"]);
    // Los ids —lo que lee el filtro de canal— no se tocan.
    expect([...result.current.canales.allContactedIds].sort()).toEqual(["k1", "k2"]);
    expect(result.current.canales.contactIdsForChannels(["c9"])).toEqual(["k1"]);
    // Una sola vuelta a la base, y nunca una vuelta con la lista vacía.
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(vistos.filter((n) => n !== 2)).toEqual([]);
  });

  it("un canal con nombre se queda con su nombre (no se reemplaza nada)", async () => {
    rpc.mockResolvedValue({ data: { channels: [{ id: "c1", label: "Ventas Norte" }], rows: [{ contact_id: "k1", channel_id: "c1", last_at: null }] }, error: null });
    const { result } = renderHook(() => useContactSalesChannels(true), { wrapper: envolver("en") });
    await waitFor(() => expect(result.current.byContactId.size).toBe(1));
    expect(result.current.byContactId.get("k1")!.map((c) => c.label)).toEqual(["Ventas Norte"]);
  });
});

describe("Evaluador → sesión nueva: un evaluador sin nombre", () => {
  const evaluadoresSinNombre = () =>
    rpc.mockImplementation((nombre: string) =>
      Promise.resolve(
        nombre === "list_chatter_evaluators"
          ? { data: [{ user_id: "u-yo", full_name: null, avatar_url: null }], error: null }
          : { data: null, error: null },
      ),
    );

  it("en inglés se lee No name, no Sin nombre", async () => {
    evaluadoresSinNombre();
    const Envoltorio = envolver("en");
    render(<Envoltorio><NewSessionDialog open onOpenChange={() => {}} /></Envoltorio>);
    // El elegido por defecto es uno mismo: "Me · No name".
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveTextContent("Me · No name"));
    expect(screen.queryByText(/Sin nombre/)).toBeNull();
  });

  it("en español, el de siempre", async () => {
    evaluadoresSinNombre();
    const Envoltorio = envolver("es");
    render(<Envoltorio><NewSessionDialog open onOpenChange={() => {}} /></Envoltorio>);
    await waitFor(() => expect(screen.getByRole("combobox")).toHaveTextContent("Yo · Sin nombre"));
  });
});
