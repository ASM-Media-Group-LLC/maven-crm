import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, configure } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Keila (02/10), dos pedidos de cómo se ve el correo, como en Gmail:
//  - «No leídos primero»: en Recibidos, arriba los no leídos y abajo «Todo lo
//    demás». ⚠️ La lista va por páginas: uno sin leer de la página 3 tiene que
//    salir arriba igual.
//  - Panel de lectura «Sin división»: el correo abierto ocupa todo el espacio y
//    se vuelve con la flecha, «u» o Escape.
// Las dos se guardan por persona.

configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 60_000 });

vi.mock("react-router-dom", () => ({ useSearchParams: () => [new URLSearchParams(), vi.fn()] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

const e = vi.hoisted(() => {
  const r = (id: string, date: string, over: Record<string, unknown> = {}) => ({
    id, uid: Number(id.replace(/\D/g, "")) || 1, from: `Persona ${id} <${id}@x.com>`, to: "yo@maven-ai.me",
    subject: `Asunto ${id}`, date, messageId: `<${id}@x>`, inReplyTo: undefined as string | undefined,
    refs: undefined as string[] | undefined, unread: false, origen: "cache" as const, ...over,
  });
  // Página de leídos (la de abajo).
  const leido1 = r("l1", "2026-09-30T12:00:00Z");
  const raiz = r("r2", "2026-09-29T10:00:00Z", { subject: "Pagos de octubre", from: "Ana <ana@x.com>" });
  // No leídos de TODA la bandeja: una respuesta a `raiz` (va con su hilo) y
  // uno viejo que en la lista normal estaría en la página 3.
  const respuesta = r("n3", "2026-09-30T09:00:00Z", {
    subject: "Re: Pagos de octubre", from: "Beto <beto@x.com>", to: "ana@x.com, yo@maven-ai.me", unread: true,
    inReplyTo: "<r2@x>", refs: ["<r2@x>"],
  });
  const viejo = r("n4", "2026-07-01T10:00:00Z", { subject: "Factura de julio", unread: true });
  return {
    leido1, raiz, respuesta, viejo,
    pedidas: [] as Array<{ carpeta: string; pagina: number; soloLeidos: boolean }>,
  };
});

vi.mock("@/hooks/useMailbox", async (original) => ({
  ...(await original<typeof import("@/hooks/useMailbox")>()),
  useMailbox: () => ({ data: { email_address: "yo@maven-ai.me", is_active: true, has_error: false }, isLoading: false, error: null }),
  useMailFolders: () => ({ data: [{ folder: "INBOX", unread: 2 }, { folder: "Enviado", unread: 0 }], isLoading: false }),
  useMailMessages: (carpeta: string, _h: boolean, pagina = 0, soloLeidos = false) => {
    e.pedidas.push({ carpeta, pagina, soloLeidos });
    const todos = carpeta === "INBOX" ? [e.leido1, e.respuesta, e.raiz] : [];
    const messages = soloLeidos ? todos.filter((m) => !m.unread) : todos;
    return {
      data: { total: soloLeidos ? messages.length : 150, messages },
      isLoading: false, isFetching: false, isPlaceholderData: false, error: null, refetch: vi.fn(),
    };
  },
  useMailNoLeidos: (_c: string, habilitada: boolean) => ({
    data: habilitada ? { total: 2, messages: [e.respuesta, e.viejo] } : undefined,
    isLoading: false, error: null,
  }),
  useMailSearch: () => ({ data: { messages: [] }, isFetching: false, error: null }),
  useMailMessage: (_f: string, sel: { from: string; subject: string; date: string } | null) => ({
    data: sel
      ? { folder: "INBOX", from: sel.from, to: "yo@maven-ai.me", cc: "", subject: sel.subject, date: sel.date, html: null, text: "Hola", remote_images: 0, attachments: [], truncated: false }
      : null,
    isLoading: false, error: null,
  }),
  useImagenesIncrustadas: () => null,
  usePrefetchMailMessage: () => vi.fn(),
  useMarkSeen: () => ({ mutate: vi.fn() }),
  useDownloadAttachment: () => ({ mutate: vi.fn(), isPending: false }),
  useMailRealtime: () => {},
  useMailSignature: () => ({ data: { enabled: false, html: "" } }),
  useMailBulk: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useHiloCompleto", () => ({ useHiloCompleto: () => ({ hilo: [], cargando: false }) }));
vi.mock("@/hooks/useEtiquetasCorreo", async (original) => ({
  ...(await original<typeof import("@/hooks/useEtiquetasCorreo")>()),
  useEtiquetas: () => ({ data: [], isLoading: false }),
  useEtiquetasPorCorreo: () => ({ data: new Map() }),
  useNoLeidosPorEtiqueta: () => ({ data: new Map() }),
  useEtiquetarCorreos: () => ({ mutate: vi.fn(), isPending: false }),
  useCorreosDeEtiqueta: () => ({ data: [], isLoading: false, error: null }),
}));

import CorreoPage from "@/pages/correo/CorreoPage";

const montar = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><CorreoPage /></QueryClientProvider>);
};

/** Lo que dice la lista, de arriba abajo: rótulos de sección y asuntos. */
const lista = () =>
  Array.from(screen.getByTestId("columna-lista").querySelectorAll("[data-testid='fila-correo'], [data-rotulo]"))
    .map((el) => (el.hasAttribute("data-rotulo")
      ? `## ${el.getAttribute("data-rotulo")}`
      : (el.textContent ?? "").match(/Asunto \w+|Pagos de octubre|Factura de julio/)?.[0] ?? "?"));

beforeEach(() => {
  e.pedidas.length = 0;
  localStorage.clear();
});

describe("«No leídos primero»", () => {
  it("arriba los no leídos de TODA la bandeja (también el de la página 3) y abajo «Todo lo demás»", async () => {
    montar();
    await screen.findAllByText("Asunto l1");
    fireEvent.click(screen.getByRole("button", { name: "No leídos primero" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "No leídos primero" })).toHaveAttribute("aria-pressed", "true"));
    expect(lista()).toEqual([
      "## No leídos",
      // La conversación cuenta como no leída si CUALQUIERA de sus mensajes lo está.
      "Pagos de octubre",
      "Factura de julio",
      "## Todo lo demás",
      "Asunto l1",
    ]);
    // La página de abajo pide SOLO los leídos.
    expect(e.pedidas[e.pedidas.length - 1]).toEqual({ carpeta: "INBOX", pagina: 0, soloLeidos: true });
  });

  it("se guarda por persona: al volver sigue igual", async () => {
    const { unmount } = montar();
    await screen.findAllByText("Asunto l1");
    fireEvent.click(screen.getByRole("button", { name: "No leídos primero" }));
    await waitFor(() => expect(lista()[0]).toBe("## No leídos"));
    unmount();
    expect(JSON.parse(localStorage.getItem("maven.correo.prefs.anon") ?? "{}")).toMatchObject({ noLeidosPrimero: true });
    montar();
    await waitFor(() => expect(lista()[0]).toBe("## No leídos"));
  });

  it("apagado, la lista es la de siempre; y fuera de Recibidos no hay interruptor", async () => {
    montar();
    await screen.findAllByText("Asunto l1");
    expect(lista()).not.toContain("## No leídos");
    expect(e.pedidas.every((p) => !p.soloLeidos)).toBe(true);
    fireEvent.click(screen.getAllByRole("button", { name: "Enviados" })[0]);
    await waitFor(() => expect(screen.queryByRole("button", { name: "No leídos primero" })).toBeNull());
  });
});

describe("panel de lectura «Sin división»", () => {
  const elegirPanel = async (opcion: string) => {
    fireEvent.keyDown(screen.getByRole("button", { name: "Panel de lectura" }), { key: "Enter" });
    const menu = await screen.findByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitemradio", { name: new RegExp(`^${opcion}`) }));
  };

  it("el correo abierto ocupa todo y la lista se esconde; «u» vuelve a la lista", async () => {
    montar();
    await screen.findAllByText("Asunto l1");
    await elegirPanel("Sin división");
    // Sin correo abierto, la lista ocupa todo el ancho (sin la columna fija).
    expect(screen.getByTestId("columna-lista").className).not.toMatch(/md:w-80/);

    fireEvent.click(screen.getAllByText("Asunto l1")[0]);
    const volver = await screen.findByRole("button", { name: "Volver a la lista" });
    // La flecha se ve también en escritorio, y la lista no está al lado.
    expect(volver.className).not.toMatch(/md:hidden/);
    expect(screen.getByTestId("columna-lista").className).toMatch(/\bhidden\b/);
    expect(screen.getByTestId("columna-lista").className).not.toMatch(/md:flex/);

    fireEvent.keyDown(window, { key: "u" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Volver a la lista" })).toBeNull());
    expect(JSON.parse(localStorage.getItem("maven.correo.prefs.anon") ?? "{}")).toMatchObject({ lectura: "completa" });
  });

  it("Escape también vuelve; escribiendo en el buscador, «u» es una letra", async () => {
    montar();
    await screen.findAllByText("Asunto l1");
    await elegirPanel("Sin división");
    fireEvent.click(screen.getAllByText("Asunto l1")[0]);
    await screen.findByRole("button", { name: "Volver a la lista" });
    fireEvent.keyDown(screen.getByPlaceholderText("Buscar en Recibidos…"), { key: "u" });
    expect(screen.getByRole("button", { name: "Volver a la lista" })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Volver a la lista" })).toBeNull());
  });

  it("«Dividir» es lo de siempre: la lista al lado y la flecha solo en el teléfono", async () => {
    montar();
    await screen.findAllByText("Asunto l1");
    fireEvent.click(screen.getAllByText("Asunto l1")[0]);
    const volver = await screen.findByRole("button", { name: "Volver a la lista" });
    expect(volver.className).toMatch(/md:hidden/);
    expect(screen.getByTestId("columna-lista").className).toMatch(/md:flex/);
    // Y «u» no cierra nada en este modo.
    fireEvent.keyDown(window, { key: "u" });
    expect(screen.getByRole("button", { name: "Volver a la lista" })).toBeTruthy();
  });
});
