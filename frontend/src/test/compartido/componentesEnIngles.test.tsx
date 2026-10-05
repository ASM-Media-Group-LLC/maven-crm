// Los componentes compartidos de components/ con la app en INGLÉS: Clari (el
// botón, la ventana y el historial), la ventanita de la llamada que sobrevive a
// cambiar de página, la campana de notificaciones, subir archivos, las frases
// hechas del chat, el aviso de mudanza de dominio, cambiar la contraseña, el
// mejor cerrador del mes, los botones de WhatsApp/Telegram y los selectores.
//
// Se montan de verdad y se lee lo que se DIBUJA (texto + title/placeholder/
// aria-label), porque el freno estático (test/i18n/sinEspanolNuevo) no ve el
// texto que arranca en su propio renglón.
//
// Lo que es DATO viene de fixtures en inglés o neutros a propósito: el título y
// el mensaje de una notificación los escribe un trigger en español y se muestran
// tal cual; aquí se mide la interfaz alrededor, no el contenido.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Routes, Route, useLocation } from "react-router-dom";
import { useEffect, type ReactNode } from "react";
import { LanguageProvider } from "@/hooks/useLanguage";
import { TooltipProvider } from "@/components/ui/tooltip";
import { esEspanol } from "../i18n/detectarEspanol";

// ── jsdom no trae el dictado, ni IntersectionObserver/ResizeObserver, ni scrollTo ──
// ClariAiChat decide al CARGAR si hay dictado: se instala antes de importarlo,
// así se dibuja el botón del micrófono.
vi.hoisted(() => {
  (window as unknown as { webkitSpeechRecognition: unknown }).webkitSpeechRecognition = class {};
  class Observador {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = Observador;
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = Observador;
  if (!Element.prototype.scrollTo) Element.prototype.scrollTo = function () {};
});

// ── La base: cada tabla contesta sus filas ──
const TABLAS: Record<string, unknown[]> = {
  profiles: [
    { id: "p1", full_name: "Alice Smith", avatar_url: null, avatar_seed: null },
    { id: "p2", full_name: null, avatar_url: null, avatar_seed: null },
  ],
  chatter_scripts: [],
};
// Lo que contesta la edge que abre un chat de WhatsApp/Telegram.
const invocar = vi.hoisted(() => ({ respuesta: { data: null as unknown, error: null as unknown } }));

function cadena(tabla: string) {
  const filas = () => TABLAS[tabla] ?? [];
  const b: Record<string, unknown> = {};
  const devolver = () => b;
  for (const m of ["select", "eq", "neq", "in", "order", "limit", "update", "delete", "insert"]) b[m] = devolver;
  b.then = (ok: (v: unknown) => unknown) => Promise.resolve(ok({ data: filas(), error: null }));
  return b;
}

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (t: string) => cadena(t),
    auth: {
      getUser: async () => ({ data: { user: { id: "u1" } } }),
      getSession: async () => ({ data: { session: { access_token: "tok" } } }),
      updateUser: async () => ({ error: null }),
    },
    functions: { invoke: async () => invocar.respuesta },
    storage: { from: () => ({ upload: async () => ({ error: null }), createSignedUrl: async () => ({ data: null }) }) },
  },
}));

// ── Los avisos (toast): se juntan para mirar su idioma ──
const avisos = vi.hoisted(() => [] as string[]);
vi.mock("@/hooks/use-toast", () => {
  const toast = (t: { title?: string; description?: string }) => {
    if (t.title) avisos.push(t.title);
    if (t.description) avisos.push(t.description);
  };
  return { toast, useToast: () => ({ toast }) };
});
vi.mock("sonner", () => ({
  toast: Object.assign((m: string) => { avisos.push(m); }, {
    error: (m: string) => { avisos.push(m); },
    success: (m: string) => { avisos.push(m); },
  }),
}));

// ── Hooks con datos de otra parte de la app ──
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ role: "manager", isAdmin: true }) }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ permissions: [], canAccess: () => true }) }));
vi.mock("@/hooks/useAiConversations", () => ({
  useAiMessages: () => ({ messages: [], saveMessage: async () => {}, updateConversationTitle: async () => {} }),
  useAiConversations: () => ({ createConversation: { mutateAsync: async () => ({ id: "conv-1" }) } }),
}));

const HACE = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString();
const NOTIFICACIONES = [
  {
    id: "n1", user_id: "u1", type: "verification_approved", title: "Jane Doe", message: "Profile ready",
    reference_id: null, reference_type: null, is_read: false, created_at: HACE(0), module_origin: "creadores",
    priority: "high", status: "new", deep_link_url: null, required_permission_module: null,
    required_permission_submodule: null, visibility_scope: null, role_target: null,
  },
  {
    id: "n2", user_id: "u1", type: "evaluation", title: "Session 42", message: null,
    reference_id: null, reference_type: null, is_read: false, created_at: HACE(2), module_origin: "chatter-evaluator",
    priority: "low", status: "new", deep_link_url: null, required_permission_module: null,
    required_permission_submodule: null, visibility_scope: null, role_target: null,
  },
  {
    // Nombre propio sin traducción: se muestra el valor crudo, capitalizado.
    id: "n3", user_id: "u1", type: "lead_assigned", title: "Lead 7", message: null,
    reference_id: null, reference_type: null, is_read: false, created_at: HACE(3), module_origin: "closers",
    priority: "low", status: "new", deep_link_url: null, required_permission_module: null,
    required_permission_submodule: null, visibility_scope: null, role_target: null,
  },
];
const mutacion = { mutate: () => {} };
vi.mock("@/hooks/useNotifications", () => ({
  useNotifications: () => ({
    notifications: NOTIFICACIONES, markAsRead: mutacion, markAllAsRead: mutacion, archiveNotification: mutacion,
  }),
}));
vi.mock("@/hooks/useEmployees", () => ({
  useEmployees: () => ({ data: [{ id: "e1", first_name: "John", last_name: "Park", employee_code: "E-001" }] }),
}));
const canales = vi.hoisted(() => ({ wa: [] as unknown[], tg: [] as unknown[] }));
vi.mock("@/hooks/useMyWaChannels", () => ({ useMyWaChannels: () => ({ data: canales.wa }) }));
vi.mock("@/hooks/useMyTgChannels", () => ({ useMyTgChannels: () => ({ data: canales.tg }) }));
const mejores = vi.hoisted(() => ({ data: [] as unknown[] }));
vi.mock("@/hooks/useOperationsDashboard", () => ({
  useBestCloserByMonth: () => ({ data: mejores.data, isLoading: false }),
}));

// ── La llamada: sin LiveKit ni ventana del sistema ──
vi.mock("@/pages/messenger/videocall/LiveKitCallView", () => ({
  default: () => <div data-testid="llamada" />,
}));
vi.mock("@/pages/cowork/usePipWindow", () => ({
  usePipWindow: () => ({ pipWindow: null, openPip: async () => false, closePip: () => {} }),
  docPipSupported: () => true,
}));
vi.mock("@/hooks/useCoworkRequestAlerts", () => ({ useCoworkRequestAlerts: () => {} }));

// El aviso de mudanza solo sale en el dominio viejo: aquí "estamos" ahí.
vi.mock("@/lib/dominioCanonico", () => ({ esDominioHistorico: () => true }));

import ClariAiFab from "@/components/ClariAiFab";
import ClariAiChat from "@/components/ClariAiChat";
import AiChatSidebar from "@/components/AiChatSidebar";
import { PersistentCallProvider, usePersistentCall } from "@/components/PersistentCallProvider";
import NotificationBell from "@/components/notifications/NotificationBell";
import FileUploadModal from "@/components/FileUploadModal";
import { ScriptsButton } from "@/components/chat/ScriptsButton";
import { ChatComposer } from "@/components/chat/ChatComposer";
import AvisoMudanzaDominio from "@/components/AvisoMudanzaDominio";
import ChangePasswordModal from "@/components/dashboard/ChangePasswordModal";
import BestCloserMonthlyDialog from "@/components/dashboard/BestCloserMonthlyDialog";
import AnnouncementFeedCard from "@/components/dashboard/AnnouncementFeedCard";
import DateRangePresets, { rangeForPreset } from "@/components/dashboard/DateRangePresets";
import { SelectorDePersonas } from "@/components/SelectorDePersonas";
import { EmployeeSearchCombobox } from "@/components/hr/EmployeeSearchCombobox";
import { WaChatButton } from "@/components/WaChatButton";
import { TgChatButton } from "@/components/TgChatButton";
import AuthLayout from "@/components/auth/AuthLayout";
import traducciones, { getTranslation } from "@/lib/i18n";

/** Todo el texto visible (sin lo que es código) y los atributos que se leen. */
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
/**
 * El detector no marca varias palabras sueltas («Renombrar», «Subir», «Borrar»,
 * «Soporte», «Informativo», «Archivar», «Colgar»): por eso además se busca el
 * texto EXACTO en español de cualquier clave del diccionario cuyo inglés es
 * distinto. Se descartan los que también son el inglés de otra clave (no dirían
 * nada) y los que llevan {variables} (nunca se dibujan tal cual).
 */
const valores = Object.values(traducciones as Record<string, { es: string; en: string }>);
const INGLES = new Set(valores.map((v) => v.en.trim()));
const ESPANOL_DEL_DICCIONARIO = new Set(
  valores
    .filter((v) => v.es !== v.en && !v.es.includes("{"))
    .map((v) => v.es.trim())
    .filter((es) => es && !INGLES.has(es)),
);
const enEspanol = (raiz: HTMLElement = document.body) =>
  textosVisibles(raiz).filter((t) => esEspanol(t) || ESPANOL_DEL_DICCIONARIO.has(t));

function montar(ui: ReactNode, ruta = "/dashboard") {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <LanguageProvider>
        <TooltipProvider>
          <MemoryRouter initialEntries={[ruta]}>{ui}</MemoryRouter>
        </TooltipProvider>
      </LanguageProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.setItem("app-language", "en");
  avisos.length = 0;
  canales.wa = [];
  canales.tg = [];
  mejores.data = [];
  TABLAS.chatter_scripts = [];
  invocar.respuesta = { data: null, error: null };
});

describe("Clari en inglés", () => {
  it("el botón y la ventana: cabecera, modos, saludo, dictado", async () => {
    montar(<ClariAiFab anclarPanel={() => ({})} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Clari AI" }));
    const ventana = await screen.findByRole("dialog", { name: "Clari AI chat" });
    expect(within(ventana).getByText("Online")).toBeTruthy();
    expect(within(ventana).getByText("Ask the CRM")).toBeTruthy();
    expect(within(ventana).getByText("Support")).toBeTruthy();
    expect(await within(ventana).findByText(/I'm Clari/)).toBeTruthy();
    expect(within(ventana).getByTitle("Speak")).toBeTruthy();
    expect(enEspanol()).toEqual([]);

    // El modo CRM trae su propio saludo, también en inglés.
    fireEvent.click(within(ventana).getByText("Ask the CRM"));
    expect(await within(ventana).findByText(/I'm your sales assistant/)).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("Clari escribiendo, y lo que viaja al modelo NO se traduce", async () => {
    const cuerpos: string[] = [];
    const fetchReal = globalThis.fetch;
    globalThis.fetch = ((_url: string, init: { body: string }) => {
      cuerpos.push(init.body);
      return new Promise(() => {}); // la respuesta no llega: Clari queda "escribiendo"
    }) as unknown as typeof fetch;
    try {
      montar(<ClariAiChat conversationId="conv-1" endpoint="clari-help" />);
      expect(await screen.findByText(/I'm Clari/)).toBeTruthy();
      const caja = screen.getByPlaceholderText("Type your question…");
      fireEvent.change(caja, { target: { value: "How do I add a creator?" } });
      fireEvent.keyDown(caja, { key: "Enter" });
      expect(await screen.findByText("Clari is typing…")).toBeTruthy();
      expect(enEspanol()).toEqual([]);

      await waitFor(() => expect(cuerpos.length).toBe(1));
      // Ni el saludo en inglés ni la marca de pantalla llegan al modelo.
      expect(cuerpos[0]).not.toContain("I'm Clari");
      expect(cuerpos[0]).not.toContain("saludo");
      const { messages } = JSON.parse(cuerpos[0]) as { messages: { role: string; content: string }[] };
      expect(messages[messages.length - 1]).toEqual({ role: "user", content: "How do I add a creator?" });
    } finally {
      globalThis.fetch = fetchReal;
    }
  });

  it("el historial de chats y el diálogo de borrar", async () => {
    const convs = [
      { id: "a", user_id: "u1", title: "Weekly sales", created_at: HACE(0), updated_at: HACE(0) },
      { id: "b", user_id: "u1", title: "Old question", created_at: HACE(40), updated_at: HACE(40) },
    ];
    montar(
      <AiChatSidebar
        conversations={convs} activeId="a" onSelect={() => {}} onCreate={() => {}} onDelete={() => {}} onRename={() => {}}
      />,
    );
    expect(screen.getByText("New chat")).toBeTruthy();
    expect(screen.getByText("Today")).toBeTruthy();
    expect(screen.getByText("Older")).toBeTruthy();
    expect(screen.getByTitle("Rename")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getByTitle("Delete"));
    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText("Delete this conversation?")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("sin conversaciones", () => {
    montar(<AiChatSidebar conversations={[]} activeId={null} onSelect={() => {}} onCreate={() => {}} onDelete={() => {}} onRename={() => {}} />);
    expect(screen.getByText("No conversations yet")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });
});

describe("la ventanita de la llamada en inglés", () => {
  function ArrancarLlamada({ nombre }: { nombre?: string }) {
    const { startCall } = usePersistentCall();
    useEffect(() => {
      startCall({ key: "sala", roomName: "sala", callDisplayName: nombre, incomingAudioMuted: false } as never);
    }, [startCall, nombre]);
    return null;
  }

  it("cabecera y botones de la ventanita flotante", async () => {
    montar(<PersistentCallProvider><ArrancarLlamada /></PersistentCallProvider>);
    await act(async () => { await new Promise((r) => setTimeout(r, 320)); });
    expect(screen.getByText("In a call")).toBeTruthy();
    expect(screen.getByLabelText("Mute for me")).toBeTruthy();
    expect(screen.getByLabelText("Pop out of the browser")).toBeTruthy();
    expect(screen.getByLabelText("Hang up")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getByLabelText("Minimize"));
    expect(screen.getByLabelText("Expand")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Mute for me"));
    expect(screen.getByLabelText("Hear them again")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });
});

describe("la campana de notificaciones en inglés", () => {
  it("el panel: acciones, fecha relativa y el módulo de origen", async () => {
    montar(<NotificationBell />);
    fireEvent.click(screen.getByTitle("Notifications"));
    expect(await screen.findByText("Mark all as read")).toBeTruthy();
    expect(screen.getByText("See all notifications")).toBeTruthy();
    // module_origin guardado en español → etiqueta en inglés.
    expect(screen.getByText("Creators")).toBeTruthy();
    expect(screen.getByText("Chatter evaluator")).toBeTruthy();
    // La etiqueta del diccionario ya está en sentence case: sin `capitalize`
    // (que la dibujaría «Chatter Evaluator»). El valor crudo sí se capitaliza.
    expect(screen.getByText("Chatter evaluator").className).not.toMatch(/\bcapitalize\b/);
    expect(screen.getByText("Creators").className).not.toMatch(/\bcapitalize\b/);
    expect(screen.getByText("closers").className).toMatch(/\bcapitalize\b/);
    expect(screen.getAllByText(/ago$/).length).toBeGreaterThan(0);
    expect(enEspanol()).toEqual([]);
    // El tooltip de archivar solo existe mientras tiene el foco.
    const archivar = screen.getAllByRole("button", { name: "Archive" })[0];
    fireEvent.focus(archivar);
    expect((await screen.findAllByText("Archive")).length).toBeGreaterThan(0);
    expect(enEspanol()).toEqual([]);
  });

  it("en español el chip sigue mostrando el valor guardado, igual que antes", async () => {
    localStorage.setItem("app-language", "es");
    montar(<NotificationBell />);
    fireEvent.click(screen.getByTitle("Notificaciones"));
    expect(await screen.findByText("creadores")).toBeTruthy();
    expect(screen.getByText("chatter-evaluator").className).toMatch(/\bcapitalize\b/);
    expect(screen.getByText("Marcar todas")).toBeTruthy();
  });
});

describe("subir archivos en inglés", () => {
  it("el modal, con un archivo elegido y el aviso de archivo muy grande", async () => {
    const { container } = montar(
      <FileUploadModal open onClose={() => {}} category="contracts" tempId="t1" onFilesUploaded={() => {}} />,
    );
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Signed contract & documents")).toBeTruthy();
    expect(within(dialogo).getByText("Up to 10.0 MB per file")).toBeTruthy();
    expect(within(dialogo).getByRole("button", { name: "Upload" })).toBeTruthy();
    const input = (document.querySelector('input[type="file"]') ?? container.querySelector("input")) as HTMLInputElement;
    const chico = new File(["x"], "contract.pdf", { type: "application/pdf" });
    const grande = new File(["x"], "huge.pdf", { type: "application/pdf" });
    Object.defineProperty(grande, "size", { value: 50 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [chico, grande] } });
    expect(await within(dialogo).findByText("Selected files (1)")).toBeTruthy();
    expect(within(dialogo).getByLabelText("Remove contract.pdf")).toBeTruthy();
    expect(avisos).toEqual(["File too large", "huge.pdf is over 10.0 MB"]);
    expect(enEspanol()).toEqual([]);
  });
});

describe("el chat en inglés: composer y frases hechas", () => {
  it("la caja del composer", () => {
    montar(
      <ChatComposer
        value="" onChange={() => {}} onSend={() => {}} emojis={["👍"]} onAddEmoji={() => {}} onRemoveEmoji={() => {}}
        placeholder="Write a message"
      />,
    );
    expect(screen.getByTitle("Send")).toBeTruthy();
    expect(screen.getByTitle("Attach photo / video")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("las frases: vacío, lista y el formulario de una nueva", async () => {
    montar(<ScriptsButton surface="inbox" onUse={() => {}} />);
    fireEvent.click(screen.getByTitle("Scripts (saved phrases)"));
    expect(await screen.findByText("No phrases yet. Create one with “New”.")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: /New/ }));
    expect(await screen.findByText("New phrase")).toBeTruthy();
    expect(screen.getByText("Send right away on click")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("las frases guardadas se ven con su etiqueta en inglés", async () => {
    TABLAS.chatter_scripts = [
      { id: "s1", label: "Hi", text: "Hello there", send_on_click: true, sort_order: 0, created_at: HACE(1) },
      { id: "s2", label: null, text: "See you", send_on_click: false, sort_order: 1, created_at: HACE(1) },
    ];
    montar(<ScriptsButton surface="inbox" onUse={() => {}} />);
    fireEvent.click(screen.getByTitle("Scripts (saved phrases)"));
    expect(await screen.findByText("sends on click")).toBeTruthy();
    expect(screen.getByText("↳ goes to the message box")).toBeTruthy();
    expect(screen.getAllByTitle("Delete").length).toBe(2);
    expect(screen.getAllByTitle("Edit").length).toBe(2);
    expect(enEspanol()).toEqual([]);
  });
});

describe("avisos y diálogos sueltos en inglés", () => {
  it("el aviso de mudanza de dominio", async () => {
    montar(<AvisoMudanzaDominio />);
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Maven has a new address")).toBeTruthy();
    // El resaltado cae donde corresponde en inglés.
    expect(within(dialogo).getByText("ask for your password again")).toBeTruthy();
    expect(within(dialogo).getByText("Stay here for now")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("cambiar la contraseña", async () => {
    montar(<ChangePasswordModal open onOpenChange={() => {}} />);
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Change password")).toBeTruthy();
    expect(within(dialogo).getAllByText("At least 8 characters").length).toBeGreaterThan(0);
    expect(enEspanol()).toEqual([]);
  });

  it("el mejor cerrador de cada mes, con el mes escrito en inglés", async () => {
    mejores.data = [
      { month: "2026-06", monthLabel: "Junio 2026", winner: { name: "Carl Closer", closes: 12, avgScore: 86.6 } },
      { month: "2026-05", monthLabel: "Mayo 2026", winner: null },
    ];
    montar(<BestCloserMonthlyDialog open onOpenChange={() => {}} />);
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("June 2026")).toBeTruthy();
    expect(within(dialogo).getByText("12 closes · avg score 87/100")).toBeTruthy();
    expect(within(dialogo).getByText("No winner")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("el mejor cerrador, vacío", async () => {
    montar(<BestCloserMonthlyDialog open onOpenChange={() => {}} />);
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText(/No data yet/)).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("la tarjeta de un anuncio: tipo y prioridad", () => {
    montar(
      <>
        <AnnouncementFeedCard
          announcement={{
            id: "an1", title: "Team update", message: "New schedule", announcement_type: "recordatorio",
            priority: "high", starts_at: "2026-09-05T12:00:00Z", image_url: null,
          } as never}
          onOpen={() => {}} onVisible={() => {}}
        />
        <AnnouncementFeedCard
          announcement={{
            id: "an2", title: "Office hours", message: null, announcement_type: "informativo",
            priority: "normal", starts_at: "2026-09-06T12:00:00Z", image_url: null,
          } as never}
          onOpen={() => {}} onVisible={() => {}}
        />
      </>,
    );
    expect(screen.getByText("Reminder")).toBeTruthy();
    expect(screen.getByText("Urgent")).toBeTruthy();
    expect(screen.getByText("Info")).toBeTruthy();
    expect(screen.getByText("Sep 5, 2026")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("la pantalla de entrar", () => {
    montar(<AuthLayout><p>Form</p></AuthLayout>);
    expect(screen.getByText("Back to home")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });
});

describe("selectores en inglés", () => {
  it("los rangos rápidos de fecha", () => {
    montar(<DateRangePresets range={rangeForPreset("today")} activePreset="today" onChange={() => {}} />);
    // Cada botón trae la etiqueta corta (celular) y la larga.
    expect(screen.getAllByText("Yesterday").length).toBe(2);
    expect(screen.getByText("This month")).toBeTruthy();
    expect(screen.getByText("Month")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("elegir personas del equipo", async () => {
    montar(<SelectorDePersonas value={["p1"]} onChange={() => {}} />);
    expect(await screen.findByText("No name")).toBeTruthy();
    expect(screen.getByLabelText("Remove Alice Smith")).toBeTruthy();
    expect(screen.getByPlaceholderText("Search the team…")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("buscar un empleado", async () => {
    montar(<EmployeeSearchCombobox value={null} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("combobox"));
    expect(await screen.findByPlaceholderText("Search employees...")).toBeTruthy();
    expect(screen.getByText("None")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });
});

/** La bandeja muestra "Back to …" con lo que le pasó el botón. */
function Bandeja() {
  const { state } = useLocation() as { state: { backLabel?: string } | null };
  return <p data-testid="volver">{state?.backLabel}</p>;
}

describe("los botones de WhatsApp y Telegram en inglés", () => {
  it("WhatsApp sin canales asignados", () => {
    montar(<WaChatButton phone="+15550001111" />);
    expect(screen.getByTitle("You don't have any WhatsApp channels assigned")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("WhatsApp: el lead no es tuyo", async () => {
    canales.wa = [{ id: "w1", label: "Sales", evolution_instance: "x", department: "sales" }];
    invocar.respuesta = { data: { ok: false }, error: null };
    montar(<WaChatButton phone="+15550001111" />);
    fireEvent.click(screen.getByRole("button", { name: /WhatsApp/ }));
    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText("This lead isn't yours")).toBeTruthy();
    expect(within(dialogo).getByText("This lead isn't available to you.")).toBeTruthy();
    expect(within(dialogo).getByText("Got it")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("WhatsApp: la bandeja sabe volver a Contactos, en inglés", async () => {
    canales.wa = [{ id: "w1", label: "Sales", evolution_instance: "x", department: "sales" }];
    invocar.respuesta = { data: { conversation_id: "c9" }, error: null };
    montar(
      <Routes>
        <Route path="/contactos" element={<WaChatButton phone="+15550001111" />} />
        <Route path="/inbox" element={<Bandeja />} />
      </Routes>,
      "/contactos",
    );
    fireEvent.click(screen.getByRole("button", { name: /WhatsApp/ }));
    expect((await screen.findByTestId("volver")).textContent).toBe("Contacts");
  });

  it("Telegram: no se pudo abrir, y la bandeja vuelve a Creadoras en inglés", async () => {
    invocar.respuesta = { data: { ok: false }, error: null };
    const { unmount } = montar(<TgChatButton phone="+15550001111" />);
    fireEvent.click(screen.getByRole("button", { name: /Telegram/ }));
    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText("Couldn't open the Telegram chat.")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    unmount();

    invocar.respuesta = { data: { conversation_id: "c9" }, error: null };
    montar(
      <Routes>
        <Route path="/creadores" element={<TgChatButton phone="+15550001111" />} />
        <Route path="/telegram/bandeja" element={<Bandeja />} />
      </Routes>,
      "/creadores",
    );
    fireEvent.click(screen.getByRole("button", { name: /Telegram/ }));
    expect((await screen.findByTestId("volver")).textContent).toBe("Creators");
  });

  it("desde una ruta sin sección la bandeja vuelve a «the previous page», no a «back»", async () => {
    canales.wa = [{ id: "w1", label: "Sales", evolution_instance: "x", department: "sales" }];
    invocar.respuesta = { data: { conversation_id: "c9" }, error: null };
    const { unmount } = montar(
      <Routes>
        <Route path="/otra" element={<WaChatButton phone="+15550001111" />} />
        <Route path="/inbox" element={<Bandeja />} />
      </Routes>,
      "/otra",
    );
    fireEvent.click(screen.getByRole("button", { name: /WhatsApp/ }));
    expect((await screen.findByTestId("volver")).textContent).toBe("the previous page");
    unmount();
    montar(
      <Routes>
        <Route path="/otra" element={<TgChatButton phone="+15550001111" />} />
        <Route path="/telegram/bandeja" element={<Bandeja />} />
      </Routes>,
      "/otra",
    );
    fireEvent.click(screen.getByRole("button", { name: /Telegram/ }));
    expect((await screen.findByTestId("volver")).textContent).toBe("the previous page");
  });

  it("un aviso de error del botón también sale en inglés", async () => {
    canales.wa = [{ id: "w1", label: "Sales", evolution_instance: "x", department: "sales" }];
    invocar.respuesta = { data: null, error: null };
    montar(<WaChatButton phone="+15550001111" />);
    fireEvent.click(screen.getByRole("button", { name: /WhatsApp/ }));
    await waitFor(() => expect(avisos).toEqual(["Couldn't open the chat", "Error"]));
  });
});

describe("en español no cambia nada", () => {
  it("el saludo de Clari y el aviso de mudanza dicen lo de siempre", async () => {
    localStorage.setItem("app-language", "es");
    montar(<><ClariAiChat conversationId="conv-1" endpoint="clari-help" /><AvisoMudanzaDominio /></>);
    expect(await screen.findByText(/Soy Clari/)).toBeTruthy();
    expect(screen.getByText("Maven cambió de dirección")).toBeTruthy();
    expect(screen.getByText("pedirá tu contraseña otra vez")).toBeTruthy();
    expect(getTranslation("shared.clari.welcomeHelp", "es")).toContain("¡Hola!");
  });

  it("Clari habla en tú neutro (el saludo también le llega al modelo)", async () => {
    localStorage.setItem("app-language", "es");
    // «preguntame» y «Preguntale» no están en la lista de test/i18n/sinVoseo.
    expect(getTranslation("shared.clari.welcomeHelp", "es")).toContain("pregúntame cómo hacer");
    expect(getTranslation("shared.clari.welcomeSales", "es")).toContain("Pídeme rankings");
    const { unmount } = montar(<ClariAiChat conversationId="conv-1" endpoint="ai-sales-chat" />);
    expect(await screen.findByText(/Pídeme rankings/)).toBeTruthy();
    unmount();
    montar(<ClariAiFab anclarPanel={() => ({})} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir Clari AI" }));
    expect(await screen.findByText("Pregúntale al CRM")).toBeTruthy();
  });

  it("desde una ruta sin sección la bandeja sigue diciendo «Volver a atrás», como en main", async () => {
    localStorage.setItem("app-language", "es");
    canales.wa = [{ id: "w1", label: "Ventas", evolution_instance: "x", department: "sales" }];
    invocar.respuesta = { data: { conversation_id: "c9" }, error: null };
    montar(
      <Routes>
        <Route path="/otra" element={<WaChatButton phone="+15550001111" />} />
        <Route path="/inbox" element={<Bandeja />} />
      </Routes>,
      "/otra",
    );
    fireEvent.click(screen.getByRole("button", { name: /WhatsApp/ }));
    expect((await screen.findByTestId("volver")).textContent).toBe("atrás");
  });

  it("el mes del mejor cerrador sale como lo arma el hook", async () => {
    localStorage.setItem("app-language", "es");
    mejores.data = [{ month: "2026-05", monthLabel: "Mayo 2026", winner: { name: "Carl", closes: 3, avgScore: 70 } }];
    montar(<BestCloserMonthlyDialog open onOpenChange={() => {}} />);
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByText("Mayo 2026")).toBeTruthy();
    expect(within(dialogo).getByText("3 cierres · calif promedio 70/100")).toBeTruthy();
  });
});
