// Correo en INGLÉS: la bandeja, un correo abierto (destinatarios, adjuntos,
// responder), la barra de selección, el visor de adjuntos, la firma y el
// compositor no tienen nada visible en español.
//
// Se monta la pantalla REAL con el LanguageProvider de verdad; solo se
// reemplazan los hooks que leen el buzón. Los datos de prueba están en inglés a
// propósito: lo que se mira es el texto de la pantalla, no el de los correos.
//
// Y lo que NO se traduce también se prueba: los nombres crudos de las carpetas
// ("Papelera", "Correo no deseado") son la LLAVE que viaja a la edge, y la cita
// de una respuesta —que lee OTRA persona— sigue en español.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor, configure } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { LanguageProvider } from "@/hooks/useLanguage";
import translations from "@/lib/i18n";
import { esEspanol } from "../i18n/detectarEspanol";

// Pantallas enteras: con toda la suite corriendo en paralelo, los 5 s por test
// (y el segundo de findBy/waitFor) a veces no alcanzan sin que haya nada roto.
// El de etiquetas abre menús y el correo entero: con carga 50 pasó los 30 s (30/09).
configure({ asyncUtilTimeout: 5000 });
vi.setConfig({ testTimeout: 60_000 });

if (!("ResizeObserver" in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

const estado = vi.hoisted(() => ({
  carpetaPedida: [] as string[],
  masiva: [] as Array<{ folder: string; op: string }>,
}));

const RESUMEN = (over: Record<string, unknown>) => ({
  id: "m", uid: 1, from: "Ana Smith <ana@example.com>", to: "yo@maven-ai.me", subject: "Quarterly report",
  date: new Date().toISOString(), snippet: "Here is the report", messageId: "<m1@x>", inReplyTo: undefined,
  refs: undefined, unread: true, origen: "cache" as const, ...over,
});
const MENSAJES = [
  RESUMEN({ id: "m1", uid: 1, messageId: "<m1@x>" }),
  RESUMEN({ id: "m2", uid: 2, messageId: "<m2@x>", subject: "(sin asunto)", from: "Bob <bob@example.com>", unread: false }),
];
const ABIERTO = {
  folder: "INBOX", from: "Ana Smith <ana@example.com>", to: "yo@maven-ai.me, carl@example.com, dora@example.com",
  cc: "eve@example.com", subject: "Quarterly report", date: new Date().toISOString(),
  html: null, text: "Hello team", remote_images: 2, truncated: true,
  attachments: [
    { filename: "report.pdf", contentType: "application/pdf", sizeBytes: 20480, contentId: null },
    { filename: "archive.zip", contentType: "application/zip", sizeBytes: 4096, contentId: null },
  ],
};

const FIRMA = { data: { enabled: false, html: "" }, isLoading: false };
// Una etiqueta con una subetiqueta, con la forma de hoy (ruta, color, visibilidad).
const ETIQUETAS = [
  { id: "l1", nombre: "Clients", parentId: null, color: null, enListaEtiquetas: "mostrar", enListaMensajes: true },
  { id: "l2", nombre: "VIP", parentId: "l1", color: null, enListaEtiquetas: "mostrar", enListaMensajes: true },
];
const POR_CORREO = new Map([["<m1@x>", ["l1"]]]);
let abierto: typeof ABIERTO | null = null;
vi.mock("react-router-dom", () => ({ useSearchParams: () => [new URLSearchParams(), vi.fn()] }));
vi.mock("sonner", () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() }) }));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1", email: "yo@maven-ai.me" } }) }));
vi.mock("@/hooks/useMailbox", async (original) => ({
  ...(await original<typeof import("@/hooks/useMailbox")>()),
  useMailbox: () => ({ data: { email_address: "yo@maven-ai.me", is_active: true, has_error: false }, isLoading: false, error: null }),
  useMailFolders: () => ({
    data: [
      { folder: "INBOX", unread: 3 }, { folder: "Enviado", unread: 0 }, { folder: "Borrador", unread: 0 },
      { folder: "Correo no deseado", unread: 0 }, { folder: "Papelera", unread: 0 }, { folder: "Archive", unread: 0 },
      { folder: "Snoozed", unread: 0 },
    ],
    isLoading: false,
  }),
  useMailMessages: (folder: string) => {
    estado.carpetaPedida.push(folder);
    // Con `total`, la barra de la lista muestra el paginador («1–2 of 2» y ‹ ›).
    return { data: { messages: MENSAJES, total: MENSAJES.length }, isLoading: false, isFetching: false, isPlaceholderData: false, error: null, refetch: vi.fn() };
  },
  useMailSearch: () => ({ data: { messages: [] }, isFetching: false, error: null }),
  useMailMessage: (_f: string, sel: unknown) => ({ data: sel ? abierto : null, isLoading: false, error: null }),
  useImagenesIncrustadas: () => null,
  usePrefetchMailMessage: () => vi.fn(),
  useMarkSeen: () => ({ mutate: vi.fn() }),
  useDownloadAttachment: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
  useMailRealtime: () => {},
  // Objeto ESTABLE, como el de react-query: el diálogo de la firma lo usa de dependencia.
  useMailSignature: () => FIRMA,
  useSaveMailSignature: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useMailBulk: () => ({
    mutate: (v: { folder: string; op: string }) => estado.masiva.push({ folder: v.folder, op: v.op }),
    isPending: false,
  }),
  useAdjuntosParaReenviar: () => ({ mutateAsync: vi.fn(() => Promise.resolve([])), isPending: false }),
  useAttachmentBytes: () => ({ data: undefined, isPending: false, isError: true, error: new Error(""), refetch: vi.fn() }),
  usePrefetchAttachment: () => vi.fn(),
  useSendMail: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useSaveServerDraft: () => ({ mutate: vi.fn() }),
  useDeleteServerDraft: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/hooks/useEtiquetasCorreo", async (original) => ({
  ...(await original<typeof import("@/hooks/useEtiquetasCorreo")>()),
  useEtiquetas: () => ({ data: ETIQUETAS, isLoading: false }),
  // El abierto (m1) lleva «Clients»: la pastilla con × aparece junto al asunto.
  useEtiquetasPorCorreo: () => ({ data: POR_CORREO }),
  useCrearEtiqueta: () => ({ mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false }),
  useActualizarEtiqueta: () => ({ mutate: vi.fn(), isPending: false }),
  useBorrarEtiqueta: () => ({ mutate: vi.fn(), isPending: false }),
  useNoLeidosPorEtiqueta: () => ({ data: new Map() }),
  useEtiquetarCorreos: () => ({ mutate: vi.fn(), isPending: false }),
  useCorreosDeEtiqueta: () => ({ data: [], isLoading: false, error: null }),
}));
vi.mock("@/hooks/useHiloCompleto", () => ({ useHiloCompleto: () => ({ hilo: [], cargando: true }) }));
vi.mock("@/hooks/useSugerenciasDestinatarios", async (original) => ({
  ...(await original<typeof import("@/hooks/useSugerenciasDestinatarios")>()),
  useSugerenciasDestinatarios: () => [],
}));
vi.mock("@/components/correo/MencionesEnElCuerpo", () => ({ default: () => null }));

import CorreoPage from "@/pages/correo/CorreoPage";

function textosVisibles(raiz: HTMLElement): string[] {
  const out: string[] = [];
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.parentElement?.closest("code, pre")) continue;
    const t = (n.textContent ?? "").trim();
    if (t) out.push(t);
  }
  for (const el of Array.from(raiz.querySelectorAll("[title], [placeholder], [aria-label], [data-placeholder]"))) {
    for (const a of ["title", "placeholder", "aria-label", "data-placeholder"]) {
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
// El editor de la cita (TipTap) es CONTENIDO del correo, no pantalla: se salta.
const enEspanol = (raiz: HTMLElement = document.body) =>
  textosVisibles(raiz).filter((t) => esEspanol(t) || SOLO_ESPANOL.has(t));

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}><LanguageProvider><CorreoPage /></LanguageProvider></QueryClientProvider>,
  );
}

describe("Correo en inglés", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("app-language", "en");
    abierto = null;
    estado.carpetaPedida.length = 0;
    estado.masiva.length = 0;
  });

  it("la bandeja (carpetas, buscador, lista) no tiene nada en español", async () => {
    montar();
    await screen.findByText("Folders");
    expect(screen.getAllByRole("button", { name: "Inbox" }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("button", { name: "Trash" }).length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText("Search in Inbox…")).toBeTruthy();
    // El marcador del servidor para "sin asunto" se muestra traducido.
    expect(screen.getByText("(no subject)")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    // La llave de la carpeta sigue siendo la del servidor.
    expect(estado.carpetaPedida).toContain("INBOX");
  });

  it("la barra de selección y la confirmación de borrar, tampoco", async () => {
    montar();
    await screen.findByText("Folders");
    fireEvent.click(screen.getByRole("checkbox", { name: "Select all" }));
    expect(await screen.findByText("2 selected")).toBeTruthy();
    expect(enEspanol()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    const dialogo = await screen.findByRole("alertdialog");
    expect(within(dialogo).getByText("Move to Trash?")).toBeTruthy();
    expect(enEspanol(dialogo)).toEqual([]);
    fireEvent.click(within(dialogo).getByRole("button", { name: "Move to Trash" }));
    // La operación viaja con la LLAVE de la carpeta, no con su nombre en pantalla.
    await waitFor(() => expect(estado.masiva).toEqual([{ folder: "INBOX", op: "delete" }]));
  });

  it("un correo abierto (destinatarios, adjuntos, imágenes, responder) está en inglés", async () => {
    abierto = ABIERTO;
    montar();
    await screen.findByText("Folders");
    fireEvent.click(screen.getAllByText("Quarterly report")[0]);
    await screen.findByText("Show images");
    fireEvent.click(screen.getByRole("button", { name: /^To / }));
    expect(screen.getByText("Cc")).toBeTruthy();
    expect(screen.getByText("This email is very long and is shown truncated.")).toBeTruthy();
    expect(screen.getByText("Looking for the rest of the conversation…")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reply all" })).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("el visor de adjuntos, con un archivo que no se puede ver, está en inglés", async () => {
    abierto = ABIERTO;
    montar();
    await screen.findByText("Folders");
    fireEvent.click(screen.getAllByText("Quarterly report")[0]);
    fireEvent.click(await screen.findByTitle("archive.zip — this file type has to be downloaded"));
    const visor = await screen.findByRole("dialog");
    expect(within(visor).getByText("This file can't be viewed here")).toBeTruthy();
    expect(within(visor).getByRole("button", { name: "Close" })).toBeTruthy();
    expect(enEspanol(visor)).toEqual([]);
  });

  it("el compositor (nuevo y respondiendo) está en inglés; la cita que sale, en español", async () => {
    abierto = ABIERTO;
    montar();
    await screen.findByText("Folders");
    fireEvent.click(screen.getByRole("button", { name: /Compose/ }));
    let comp = await screen.findByRole("dialog");
    expect(within(comp).getByText("New email")).toBeTruthy();
    expect(within(comp).getByPlaceholderText("Subject")).toBeTruthy();
    expect(within(comp).getByRole("button", { name: "Bold" })).toBeTruthy();
    expect(enEspanol(comp)).toEqual([]);
    fireEvent.keyDown(comp, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

    fireEvent.click(screen.getAllByText("Quarterly report")[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Reply" }));
    comp = await screen.findByRole("dialog");
    // La cita va DENTRO del correo que lee otra persona: queda en español.
    const cuerpo = comp.querySelector(".ProseMirror") as HTMLElement;
    expect(cuerpo.textContent).toMatch(/escribió:/);
    // Todo lo demás del compositor, en inglés.
    cuerpo.remove();
    expect(enEspanol(comp)).toEqual([]);
  });

  it("la firma está en inglés", async () => {
    montar();
    await screen.findByText("Folders");
    fireEvent.click(screen.getByRole("button", { name: "Edit signature" }));
    const firma = await screen.findByRole("dialog");
    expect(within(firma).getByText("Email signature")).toBeTruthy();
    expect(within(firma).getByRole("button", { name: "Save signature" })).toBeTruthy();
    expect(enEspanol(firma)).toEqual([]);
  });

  it("etiquetas (columna, menú ⋮, «Move to»), el paginador y la barra del correo abierto, en inglés", async () => {
    abierto = ABIERTO;
    montar();
    await screen.findByText("Folders");
    // El paginador de la carpeta.
    expect(screen.getByText("1–2 of 2")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Newer" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Older" })).toBeTruthy();
    // La columna de etiquetas y el ⋮ de una.
    expect(screen.getAllByText("Labels").length).toBeGreaterThan(0);
    fireEvent.keyDown(screen.getByRole("button", { name: "Options for Clients" }), { key: "Enter" });
    let menu = await screen.findByRole("menu");
    expect(within(menu).getByText("Label color")).toBeTruthy();
    expect(enEspanol(menu)).toEqual([]);
    fireEvent.keyDown(menu, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    // «Move to» de la selección: etiquetas, carpetas y crear/administrar.
    fireEvent.click(screen.getAllByRole("checkbox", { name: "Select this email" })[0]);
    fireEvent.keyDown(await screen.findByTitle("Move to"), { key: "Enter" });
    menu = await screen.findByRole("menu");
    expect(within(menu).getByText("Manage labels")).toBeTruthy();
    expect(enEspanol(menu)).toEqual([]);
    fireEvent.keyDown(menu, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    // El correo abierto: su barra y las pastillas con × junto al asunto.
    fireEvent.click(screen.getAllByText("Quarterly report")[0]);
    await screen.findByText("Show images");
    expect(screen.getByRole("button", { name: "Remove Inbox" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove Clients" })).toBeTruthy();
    expect(enEspanol()).toEqual([]);
  });

  it("en español la bandeja dice lo de siempre", async () => {
    localStorage.setItem("app-language", "es");
    montar();
    await screen.findByText("Carpetas");
    expect(screen.getAllByRole("button", { name: "Recibidos" }).length).toBeGreaterThan(0);
    expect(screen.getByText("(sin asunto)")).toBeTruthy();
  });
});
