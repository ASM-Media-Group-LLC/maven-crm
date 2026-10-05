import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, configure } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Keila (02/10): arrastrar correos a las carpetas y etiquetas de la columna,
// como en Gmail. Una fila (la conversación entera) o la selección; soltar es
// lo mismo que «Mover a».
//
// ⚠️ Lo que se cuida: los uid son POR CARPETA. Mirando una etiqueta conviven
// correos de varias carpetas, y mandarlos juntos como si fueran de una movería
// OTROS mensajes. Una llamada por carpeta, como el resto de las acciones.

configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 60_000 });

vi.mock("react-router-dom", () => ({ useSearchParams: () => [new URLSearchParams(), vi.fn()] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

const e = vi.hoisted(() => ({
  orden: [] as string[],
  bulk: [] as Array<{ folder: string; op: string; dest?: string; uids: unknown[] }>,
}));

const fila = (id: string, uid: number, extra: Record<string, unknown> = {}) => ({
  id, uid, from: `Persona ${id} <${id}@x.com>`, to: "yo@maven-ai.me", subject: `Asunto ${id}`,
  date: `2026-09-${10 + uid}T10:00:00Z`, messageId: `<${id}@x>`, inReplyTo: undefined, refs: undefined,
  unread: false, origen: "cache" as const, ...extra,
});

vi.mock("@/hooks/useMailbox", async (original) => ({
  ...(await original<typeof import("@/hooks/useMailbox")>()),
  useMailbox: () => ({ data: { email_address: "yo@maven-ai.me", is_active: true, has_error: false }, isLoading: false, error: null }),
  useMailFolders: () => ({
    data: [
      { folder: "INBOX", unread: 0 }, { folder: "Enviado", unread: 0 }, { folder: "Correo no deseado", unread: 0 },
      { folder: "Archive", unread: 0 }, { folder: "Notification", unread: 0 }, { folder: "Snoozed", unread: 0 },
    ],
    isLoading: false,
  }),
  useMailMessages: (carpeta: string) => ({
    data: { total: carpeta === "INBOX" ? 2 : 0, messages: carpeta === "INBOX" ? [fila("a", 1), fila("b", 2)] : [] },
    isLoading: false, isFetching: false, isPlaceholderData: false, error: null, refetch: vi.fn(),
  }),
  useMailSearch: () => ({ data: { messages: [] }, isFetching: false, error: null }),
  useMailMessage: () => ({ data: null, isLoading: false }),
  usePrefetchMailMessage: () => vi.fn(),
  useMarkSeen: () => ({ mutate: vi.fn() }),
  useDownloadAttachment: () => ({ mutate: vi.fn(), isPending: false }),
  useMailRealtime: () => {},
  useMailSignature: () => ({ data: { enabled: false, html: "" } }),
  useMailBulk: () => ({
    // `mutateAsync`: la página necesita la respuesta de CADA grupo (para «Deshacer»).
    mutateAsync: (v: { folder: string; op: string; dest?: string; items: { uid?: unknown }[] }) => {
      e.orden.push(`bulk:${v.op}:${v.folder}`);
      e.bulk.push({ folder: v.folder, op: v.op, ...(v.dest ? { dest: v.dest } : {}), uids: v.items.map((m) => m.uid) });
      return Promise.resolve({ ok: true, afectados: v.items.length, omitidos: 0 });
    },
    isPending: false,
  }),
}));
vi.mock("@/hooks/useHiloCompleto", () => ({ useHiloCompleto: () => ({ hilo: [], cargando: false }) }));
vi.mock("@/hooks/useEtiquetasCorreo", async (original) => ({
  ...(await original<typeof import("@/hooks/useEtiquetasCorreo")>()),
  useEtiquetas: () => ({
    data: [
      { id: "pagos", nombre: "Pagos", parentId: null, color: null, enListaEtiquetas: "mostrar", enListaMensajes: true },
      { id: "clientes", nombre: "Clientes", parentId: null, color: null, enListaEtiquetas: "mostrar", enListaMensajes: true },
    ],
    isLoading: false,
  }),
  useEtiquetasPorCorreo: () => ({ data: new Map() }),
  useNoLeidosPorEtiqueta: () => ({ data: new Map() }),
  useEtiquetarCorreos: () => ({
    mutate: (v: { messageIds: string[]; labelId: string; poner: boolean }, o?: { onSuccess?: () => void }) => {
      e.orden.push(`${v.poner ? "poner" : "sacar"}:${v.labelId}:${v.messageIds.join(",")}`);
      o?.onSuccess?.();
    },
    isPending: false,
  }),
  useActualizarEtiqueta: () => ({ mutate: vi.fn(), isPending: false }),
  useBorrarEtiqueta: () => ({ mutate: vi.fn(), isPending: false }),
  // La etiqueta «Pagos» junta correos de TRES carpetas.
  useCorreosDeEtiqueta: (id: string | null) => ({
    data: id === "pagos"
      ? [
          { id: "p1", uid: 7, folder: "INBOX", from_addr: "Uno <uno@x.com>", to_addr: "yo@maven-ai.me", subject: "Pago uno", date: "2026-09-20T10:00:00Z", message_id: "<p1@x>", unread: false },
          { id: "p2", uid: 7, folder: "Notification", from_addr: "Dos <dos@x.com>", to_addr: "yo@maven-ai.me", subject: "Pago dos", date: "2026-09-19T10:00:00Z", message_id: "<p2@x>", unread: false },
          { id: "p3", uid: 9, folder: "Archive", from_addr: "Tres <tres@x.com>", to_addr: "yo@maven-ai.me", subject: "Pago tres", date: "2026-09-18T10:00:00Z", message_id: "<p3@x>", unread: false },
        ]
      : [],
    isLoading: false, error: null,
  }),
}));

import CorreoPage from "@/pages/correo/CorreoPage";

const montar = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><CorreoPage /></QueryClientProvider>);
};

const nuevoDataTransfer = () => ({
  setData: vi.fn(), getData: vi.fn(), setDragImage: vi.fn(), effectAllowed: "", dropEffect: "",
});

const filaDe = (asunto: string) => screen.getAllByText(asunto)[0].closest("[data-testid='fila-correo']") as HTMLElement;
/** El botón de la carpeta en la COLUMNA (el primero; después están las píldoras del teléfono). */
const carpeta = (nombre: string) => screen.getAllByRole("button", { name: nombre })[0];

const arrastrarYSoltar = (desde: HTMLElement, hasta: HTMLElement) => {
  const dt = nuevoDataTransfer();
  fireEvent.dragStart(desde, { dataTransfer: dt });
  fireEvent.dragOver(hasta, { dataTransfer: dt });
  fireEvent.drop(hasta, { dataTransfer: dt });
  fireEvent.dragEnd(desde, { dataTransfer: dt });
  return dt;
};

beforeEach(() => {
  e.orden.length = 0;
  e.bulk.length = 0;
  localStorage.clear();
});

describe("arrastrar correos a una carpeta", () => {
  it("una fila sobre Archivados = «Mover a» Archivados", async () => {
    montar();
    await screen.findAllByText("Asunto a");
    const dt = arrastrarYSoltar(filaDe("Asunto a"), carpeta("Archivados"));
    await waitFor(() => expect(e.bulk).toEqual([{ folder: "INBOX", op: "move", dest: "Archive", uids: [1] }]));
    // Lo que acompaña al puntero dice cuántas conversaciones van.
    expect((dt.setDragImage.mock.calls[0][0] as HTMLElement).textContent).toBe("Mover 1 conversación");
  });

  it("mientras se arrastra, la carpeta de abajo se resalta; Enviados y Pospuestos no reciben", async () => {
    montar();
    await screen.findAllByText("Asunto a");
    const dt = nuevoDataTransfer();
    fireEvent.dragStart(filaDe("Asunto a"), { dataTransfer: dt });
    fireEvent.dragOver(carpeta("Spam"), { dataTransfer: dt });
    expect(carpeta("Spam").className).toMatch(/ring-2/);
    expect(carpeta("Enviados")).not.toHaveAttribute("data-soltable");
    expect(carpeta("Pospuestos")).not.toHaveAttribute("data-soltable");
    // Ni la carpeta donde ya están.
    expect(carpeta("Recibidos")).not.toHaveAttribute("data-soltable");
    fireEvent.drop(carpeta("Enviados"), { dataTransfer: dt });
    fireEvent.dragEnd(filaDe("Asunto a"), { dataTransfer: dt });
    expect(e.bulk).toEqual([]);
  });

  it("⚠️ la selección de una etiqueta (tres carpetas) se mueve con UNA llamada POR CARPETA", async () => {
    montar();
    await screen.findAllByText("Asunto a");
    fireEvent.click(screen.getByRole("button", { name: "Pagos" }));
    await screen.findAllByText("Pago uno");
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar todos" }));
    const dt = arrastrarYSoltar(filaDe("Pago dos"), carpeta("Spam"));
    await waitFor(() => expect(e.bulk).toHaveLength(3));
    // El uid 7 de Recibidos y el uid 7 de Notificaciones son correos DISTINTOS.
    expect(e.bulk).toEqual([
      { folder: "INBOX", op: "move", dest: "Correo no deseado", uids: [7] },
      { folder: "Notification", op: "move", dest: "Correo no deseado", uids: [7] },
      { folder: "Archive", op: "move", dest: "Correo no deseado", uids: [9] },
    ]);
    expect((dt.setDragImage.mock.calls[0][0] as HTMLElement).textContent).toBe("Mover 3 conversaciones");
  });

  it("lo que ya está en la carpeta de destino no se manda", async () => {
    montar();
    await screen.findAllByText("Asunto a");
    fireEvent.click(screen.getByRole("button", { name: "Pagos" }));
    await screen.findAllByText("Pago uno");
    fireEvent.click(screen.getByRole("checkbox", { name: "Seleccionar todos" }));
    arrastrarYSoltar(filaDe("Pago uno"), carpeta("Archivados"));
    await waitFor(() => expect(e.bulk).toHaveLength(2));
    expect(e.bulk.map((b) => b.folder)).toEqual(["INBOX", "Notification"]);
  });
});

describe("arrastrar correos a una etiqueta", () => {
  it("= «Mover a» la etiqueta: PRIMERO la pone y DESPUÉS lo saca de Recibidos", async () => {
    montar();
    await screen.findAllByText("Asunto a");
    arrastrarYSoltar(filaDe("Asunto b"), screen.getByRole("button", { name: "Clientes" }));
    await waitFor(() => expect(e.orden).toEqual(["poner:clientes:<b@x>", "bulk:archive:INBOX"]));
    expect(e.bulk).toEqual([{ folder: "INBOX", op: "archive", uids: [2] }]);
  });

  it("la etiqueta que se está mirando no recibe (ya están ahí)", async () => {
    montar();
    await screen.findAllByText("Asunto a");
    fireEvent.click(screen.getByRole("button", { name: "Pagos" }));
    await screen.findAllByText("Pago uno");
    arrastrarYSoltar(filaDe("Pago uno"), screen.getByRole("button", { name: "Pagos" }));
    expect(e.orden).toEqual([]);
  });
});
