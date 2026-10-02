import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within, configure } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Keila (02/10): el ⋮ de CADA mensaje de una conversación abierta, como el de
// Gmail, sin tener que abrir ese mensaje antes. Eligió exactamente seis
// opciones: Responder, Reenviar, Compartir en el chat, Eliminar, Marcar como
// no leído a partir de aquí y Traducir.
//
// Lo que se mira acá es que cada acción caiga sobre el mensaje ELEGIDO —no el
// abierto— y, cuando toca el servidor, en SU carpeta: la conversación cruza
// carpetas (lo que contestaste vive en Enviados) y los uid son por carpeta.

configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 60_000 });

vi.mock("react-router-dom", () => ({ useSearchParams: () => [new URLSearchParams(), vi.fn()] }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() } }));
vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

const e = vi.hoisted(() => {
  const base = {
    to: "yo@maven-ai.me", inReplyTo: undefined as string | undefined, refs: undefined as string[] | undefined,
    unread: false, origen: "cache" as const,
  };
  // La conversación: Ana escribe (Recibidos), yo contesto (Enviados), Ana
  // vuelve a escribir (Recibidos).
  const h1 = { ...base, id: "h1", uid: 1, folder: "INBOX", from: "Ana <ana@x.com>", subject: "Contrato",
    date: "2026-09-28T10:00:00Z", messageId: "<1@x>", snippet: "Te mando el contrato" };
  const h2 = { ...base, id: "h2", uid: 5, folder: "Enviado", from: "Yo <yo@maven-ai.me>", to: "ana@x.com",
    subject: "Re: Contrato", date: "2026-09-29T10:00:00Z", messageId: "<2@x>", inReplyTo: "<1@x>",
    refs: ["<1@x>"], snippet: "Lo reviso y te digo" };
  const h3 = { ...base, id: "h3", uid: 3, folder: "INBOX", from: "Ana <ana@x.com>", subject: "Re: Contrato",
    date: "2026-09-30T10:00:00Z", messageId: "<3@x>", inReplyTo: "<2@x>", refs: ["<1@x>", "<2@x>"],
    snippet: "¿Lo pudiste ver?" };
  const cuerpo = (m: typeof h1, extra: Record<string, unknown> = {}) => ({
    folder: m.folder, from: m.from, to: m.to, cc: "", subject: m.subject, date: m.date,
    html: null, text: `Cuerpo de ${m.id}`, remote_images: 0, attachments: [], truncated: false, ...extra,
  });
  return {
    h1, h2, h3, cuerpo,
    bulk: [] as Array<{ folder: string; op: string; uids: unknown[] }>,
    traidos: [] as Array<[string, string]>,
    bajados: [] as Array<{ folder: string; uid: number }>,
    composer: null as Record<string, unknown> | null,
    compartido: null as Record<string, unknown> | null,
  };
});

vi.mock("@/components/correo/MailComposer", () => ({
  TOPE_ADJUNTOS: 20 * 1024 * 1024,
  MailComposer: ({ inicial }: { inicial: Record<string, unknown> }) => { e.composer = inicial; return null; },
}));
vi.mock("@/components/correo/CompartirEnChatDialog", () => ({
  default: ({ correo }: { correo: Record<string, unknown> }) => { e.compartido = correo; return <div>dialogo-compartir</div>; },
}));

vi.mock("@/hooks/useMailbox", async (original) => ({
  ...(await original<typeof import("@/hooks/useMailbox")>()),
  useMailbox: () => ({ data: { email_address: "yo@maven-ai.me", is_active: true, has_error: false }, isLoading: false, error: null }),
  useMailFolders: () => ({
    data: [{ folder: "INBOX", unread: 0 }, { folder: "Enviado", unread: 0 }, { folder: "Archive", unread: 0 }],
    isLoading: false,
  }),
  // En Recibidos están h1 y h3 (sin `folder`, como los trae la lista).
  useMailMessages: (carpeta: string) => ({
    data: {
      total: carpeta === "INBOX" ? 2 : 0,
      messages: carpeta === "INBOX"
        ? [{ ...e.h3, folder: undefined }, { ...e.h1, folder: undefined }]
        : [],
    },
    isLoading: false, isFetching: false, isPlaceholderData: false, error: null, refetch: vi.fn(),
  }),
  useMailSearch: () => ({ data: { messages: [] }, isFetching: false, error: null }),
  useMailMessage: (_f: string, sel: { id: string } | null) => ({
    data: sel ? e.cuerpo(sel.id === "h1" ? e.h1 : sel.id === "h2" ? e.h2 : e.h3) : null,
    isLoading: false, error: null,
  }),
  useTraerMensaje: () => (folder: string, m: { id: string }) => {
    e.traidos.push([folder, m.id]);
    const r = m.id === "h1" ? e.h1 : m.id === "h2" ? e.h2 : e.h3;
    return Promise.resolve(e.cuerpo(r, m.id === "h2"
      ? { attachments: [{ filename: "contrato.pdf", contentType: "application/pdf", sizeBytes: 1000, contentId: null }] }
      : {}));
  },
  useImagenesIncrustadas: () => null,
  usePrefetchMailMessage: () => vi.fn(),
  useMarkSeen: () => ({ mutate: vi.fn() }),
  useDownloadAttachment: () => ({ mutate: vi.fn(), isPending: false }),
  useMailRealtime: () => {},
  useMailSignature: () => ({ data: { enabled: false, html: "" } }),
  useAdjuntosParaReenviar: () => ({
    mutateAsync: (v: { folder: string; uid: number }) => {
      e.bajados.push({ folder: v.folder, uid: v.uid });
      return Promise.resolve([{ filename: "contrato.pdf", contentType: "application/pdf", sizeBytes: 1000, contentBase64: "AA==" }]);
    },
    isPending: false,
  }),
  useMailBulk: () => ({
    mutate: (v: { folder: string; op: string; items: { uid?: unknown }[] }) =>
      e.bulk.push({ folder: v.folder, op: v.op, uids: v.items.map((m) => m.uid) }),
    isPending: false,
  }),
  useTraduccionCorreo: () => ({
    isLoading: false, error: null, refetch: vi.fn(),
    data: { traduccion: "Here is the contract", recortado: false, idioma: "es" },
  }),
}));
vi.mock("@/hooks/useHiloCompleto", () => ({
  useHiloCompleto: ({ habilitado }: { habilitado: boolean }) => ({
    hilo: habilitado ? [e.h1, e.h2, e.h3] : [], cargando: false,
  }),
}));
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

/** Abre la conversación (el renglón abre el más nuevo, h3). */
const abrirConversacion = async () => {
  montar();
  fireEvent.click((await screen.findAllByText("Contrato"))[0]);
  // Los ⋮: h1 y h2 plegados arriba, y el del abierto (h3).
  await waitFor(() => expect(screen.getAllByRole("button", { name: "Más opciones de este mensaje" })).toHaveLength(3));
};

/** Elige una opción del ⋮ del mensaje en la posición `i` (0 = h1, 1 = h2, 2 = h3). */
const elegir = async (i: number, opcion: string) => {
  const boton = screen.getAllByRole("button", { name: "Más opciones de este mensaje" })[i];
  fireEvent.keyDown(boton, { key: "Enter" });
  const menu = await screen.findByRole("menu");
  fireEvent.click(within(menu).getByRole("menuitem", { name: opcion }));
};

beforeEach(() => {
  e.bulk.length = 0;
  e.traidos.length = 0;
  e.bajados.length = 0;
  e.composer = null;
  e.compartido = null;
  localStorage.clear();
});

describe("el ⋮ de cada mensaje de la conversación", () => {
  it("tiene exactamente las seis opciones que eligió Keila, en el orden de Gmail", async () => {
    await abrirConversacion();
    fireEvent.keyDown(screen.getAllByRole("button", { name: "Más opciones de este mensaje" })[0], { key: "Enter" });
    const menu = await screen.findByRole("menu");
    expect(within(menu).getAllByRole("menuitem").map((m) => m.textContent)).toEqual([
      "Responder", "Reenviar", "Compartir en el chat", "Eliminar",
      "Marcar como no leído a partir de aquí", "Traducir",
    ]);
  });

  it("Responder desde un mensaje PLEGADO encadena con ÉL, no con el abierto", async () => {
    await abrirConversacion();
    await elegir(0, "Responder");
    await waitFor(() => expect(e.composer).not.toBeNull());
    // Se trajo el cuerpo de h1 (para la cita) de SU carpeta.
    expect(e.traidos).toEqual([["INBOX", "h1"]]);
    expect(e.composer).toMatchObject({
      to: "ana@x.com", subject: "Re: Contrato", inReplyTo: "<1@x>", references: "<1@x>",
    });
    expect((e.composer!.citar as { texto: string }).texto).toBe("Cuerpo de h1");
  });

  it("Responder desde el abierto usa el cuerpo ya cargado y su cadena entera", async () => {
    await abrirConversacion();
    await elegir(2, "Responder");
    await waitFor(() => expect(e.composer).not.toBeNull());
    expect(e.traidos).toEqual([]);
    expect(e.composer).toMatchObject({ inReplyTo: "<3@x>", references: "<1@x> <2@x> <3@x>" });
  });

  it("Reenviar un mensaje de OTRA carpeta baja sus adjuntos de ESA carpeta, con su uid", async () => {
    await abrirConversacion();
    await elegir(1, "Reenviar");
    await waitFor(() => expect(e.composer).not.toBeNull());
    expect(e.bajados).toEqual([{ folder: "Enviado", uid: 5 }]);
    expect(e.composer).toMatchObject({ to: "", subject: "Fwd: Re: Contrato", reenvioDe: "<2@x>" });
    expect(e.composer!.inReplyTo).toBeUndefined();
    expect((e.composer!.adjuntosIniciales as unknown[]).length).toBe(1);
  });

  it("⚠️ «no leído a partir de aquí» marca ese y los siguientes, agrupados POR CARPETA", async () => {
    await abrirConversacion();
    await elegir(1, "Marcar como no leído a partir de aquí");
    await waitFor(() => expect(e.bulk.length).toBe(2));
    // h2 vive en Enviados (uid 5) y h3 en Recibidos (uid 3). h1 es anterior: no se toca.
    expect(e.bulk).toEqual([
      { folder: "Enviado", op: "unseen", uids: [5] },
      { folder: "INBOX", op: "unseen", uids: [3] },
    ]);
    // Y vuelve a la lista, como Gmail.
    await waitFor(() => expect(screen.queryAllByRole("button", { name: "Más opciones de este mensaje" })).toHaveLength(0));
  });

  it("Eliminar pide confirmación y manda a la Papelera SOLO ese mensaje", async () => {
    await abrirConversacion();
    await elegir(0, "Eliminar");
    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText("¿Mover a la Papelera?")).toBeTruthy();
    expect(e.bulk).toEqual([]);
    fireEvent.click(within(dialogo).getByRole("button", { name: "Mover a la Papelera" }));
    await waitFor(() => expect(e.bulk).toEqual([{ folder: "INBOX", op: "delete", uids: [1] }]));
  });

  it("Compartir en el chat lleva quién, asunto, fecha, resumen y el Message-ID de ESE mensaje", async () => {
    await abrirConversacion();
    await elegir(1, "Compartir en el chat");
    await screen.findByText("dialogo-compartir");
    expect(e.compartido).toEqual({
      de: "Yo <yo@maven-ai.me>", asunto: "Re: Contrato", fecha: "2026-09-29T10:00:00Z",
      resumen: "Lo reviso y te digo", messageId: "<2@x>",
    });
  });

  it("Traducir abre ese mensaje y muestra la traducción arriba, con el original plegado", async () => {
    await abrirConversacion();
    await elegir(0, "Traducir");
    expect(await screen.findByText("Here is the contract")).toBeTruthy();
    expect(screen.getByText("Traducido al español")).toBeTruthy();
    // El original (el iframe del cuerpo) no se ve hasta pedirlo.
    expect(screen.queryByTitle("Contenido del correo")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Ver original" }));
    const original = await screen.findByTitle("Contenido del correo");
    expect(original.getAttribute("srcdoc") ?? "").toContain("Cuerpo de h1");
    fireEvent.click(screen.getByRole("button", { name: "Quitar traducción" }));
    await waitFor(() => expect(screen.queryByText("Here is the contract")).toBeNull());
  });
});
