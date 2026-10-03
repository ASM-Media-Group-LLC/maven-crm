import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Keila (contabilidad), 28/09: «si yo le asigno solo etiqueta me lo deja en
// recibido y en la etiqueta, pero si lo muevo a la etiqueta me lo quita de
// recibido y solo lo muestra en la etiqueta». Así es Gmail: «Mover a» una
// etiqueta = ponerla + sacarla de la bandeja. Es su «carpeta propia».

vi.mock("react-router-dom", () => ({
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

const orden: string[] = [];
const bulk = vi.fn((vars: { folder: string; op: string; items: { messageId?: string }[] }) => {
  orden.push(`bulk:${vars.op}:${vars.folder}:${vars.items.map((m) => m.messageId ?? "sin-id").join(",")}`);
  return Promise.resolve({ ok: true, afectados: vars.items.length, omitidos: 0 });
});
const etiquetar = vi.fn((vars: { messageIds: string[]; labelId: string; poner: boolean }, opts?: { onSuccess?: () => void }) => {
  orden.push(`${vars.poner ? "poner" : "sacar"}:${vars.labelId}:${vars.messageIds.join(",")}`);
  opts?.onSuccess?.();
});

let carpetaDelCorreo = "INBOX";
let porCorreo = new Map<string, string[]>();
vi.mock("@/hooks/useMailbox", async (original) => ({
  ...(await original<typeof import("@/hooks/useMailbox")>()),
  useMailbox: () => ({ data: { email_address: "yo@maven-ai.me", is_active: true, has_error: false }, isLoading: false, error: null }),
  useMailFolders: () => ({
    data: [{ folder: "INBOX", unread: 1 }, { folder: "Enviado", unread: 0 }, { folder: "Archive", unread: 0 }],
    isLoading: false,
  }),
  useMailMessages: (carpeta: string) => ({
    data: {
      messages: carpeta === carpetaDelCorreo
        ? [
            { id: "m1", uid: 7, folder: carpeta, subject: "Split Millonlyvip P1 Sep", from: "Angie Ramirez <angie@x.com>", to: "yo@maven-ai.me", date: "2026-09-27T10:00:00Z", messageId: "<split@x>" },
          ]
        : [],
    },
    isLoading: false, isFetching: false, error: null, refetch: vi.fn(),
  }),
  useMailSearch: () => ({ data: { messages: [] }, isFetching: false, error: null }),
  useMailMessage: (_f: string, sel: unknown) => ({
    data: sel
      ? { folder: carpetaDelCorreo, from: "Angie Ramirez <angie@x.com>", to: "yo@maven-ai.me", cc: "", subject: "Split Millonlyvip P1 Sep", date: "2026-09-27T10:00:00Z", html: null, text: "Hola", remote_images: 0, attachments: [], truncated: false }
      : null,
    isLoading: false,
  }),
  usePrefetchMailMessage: () => vi.fn(),
  useMarkSeen: () => ({ mutate: vi.fn() }),
  useDownloadAttachment: () => ({ mutate: vi.fn(), isPending: false }),
  useMailRealtime: () => {},
  useMailSignature: () => ({ data: { enabled: false, html: "" } }),
  useMailBulk: () => ({ mutateAsync: bulk, isPending: false }),
}));

vi.mock("@/hooks/useEtiquetasCorreo", async (original) => ({
  ...(await original<typeof import("@/hooks/useEtiquetasCorreo")>()),
  useEtiquetas: () => ({
    data: [
      { id: "pagos", nombre: "Pagos", parentId: null, color: { fondo: "#ffad46", texto: "#ffffff" }, enListaEtiquetas: "mostrar", enListaMensajes: true },
      { id: "splits", nombre: "Splits", parentId: "pagos", color: null, enListaEtiquetas: "mostrar", enListaMensajes: true },
    ],
    isLoading: false,
  }),
  useEtiquetasPorCorreo: () => ({ data: porCorreo }),
  useNoLeidosPorEtiqueta: () => ({ data: new Map() }),
  useEtiquetarCorreos: () => ({ mutate: etiquetar, isPending: false }),
  useActualizarEtiqueta: () => ({ mutate: vi.fn(), isPending: false }),
  useBorrarEtiqueta: () => ({ mutate: vi.fn(), isPending: false }),
  useCorreosDeEtiqueta: () => ({ data: [], isLoading: false, error: null }),
}));

import CorreoPage from "@/pages/correo/CorreoPage";

// El diálogo de etiqueta nueva usa Select/Checkbox de Radix, que miden con
// ResizeObserver; jsdom no lo trae.
globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;

const montar = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><CorreoPage /></QueryClientProvider>);
};

const moverA = async (ruta: string) => {
  fireEvent.click(await screen.findByRole("checkbox", { name: "Seleccionar este correo" }));
  const boton = await screen.findByTitle("Mover a");
  fireEvent.keyDown(boton, { key: "Enter" });
  const menu = await screen.findByRole("menu");
  fireEvent.click(within(menu).getByRole("menuitem", { name: ruta }));
};

beforeEach(() => {
  orden.length = 0;
  bulk.mockClear();
  etiquetar.mockClear();
  localStorage.clear();
  carpetaDelCorreo = "INBOX";
  porCorreo = new Map();
});

describe("«Mover a» una etiqueta, como Gmail", () => {
  it("el menú va como el de Gmail: etiquetas (con su ruta), carpetas, y crear/administrar", async () => {
    montar();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Seleccionar este correo" }));
    fireEvent.keyDown(await screen.findByTitle("Mover a"), { key: "Enter" });
    const menu = await screen.findByRole("menu");
    const textos = within(menu).getAllByRole("menuitem").map((m) => m.textContent);
    expect(textos).toEqual(["Pagos", "Pagos/Splits", "Enviados", "Archivados", "Crear nueva", "Administrar etiquetas"]);
  });

  it("⚠️ desde Recibidos: PRIMERO la etiqueta y DESPUÉS lo archiva (sale de la bandeja)", async () => {
    montar();
    await moverA("Pagos/Splits");
    await waitFor(() => expect(bulk).toHaveBeenCalled());
    expect(orden).toEqual(["poner:splits:<split@x>", "bulk:archive:INBOX:<split@x>"]);
  });

  it("desde Enviados solo se etiqueta: no hay bandeja de la que sacarlo", async () => {
    carpetaDelCorreo = "Enviado";
    montar();
    fireEvent.click(screen.getAllByRole("button", { name: "Enviados" })[0]);
    await moverA("Pagos");
    await waitFor(() => expect(etiquetar).toHaveBeenCalled());
    expect(orden).toEqual(["poner:pagos:<split@x>"]);
    expect(bulk).not.toHaveBeenCalled();
  });
});

describe("el buscador de los menús, como Gmail", () => {
  it("filtra etiquetas y carpetas sin tildes ni mayúsculas, y no pierde lo tipeado", async () => {
    montar();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Seleccionar este correo" }));
    fireEvent.keyDown(await screen.findByTitle("Mover a"), { key: "Enter" });
    const menu = await screen.findByRole("menu");
    const buscador = within(menu).getByRole("textbox", { name: "Mover a:" });
    fireEvent.keyDown(buscador, { key: "s" });
    fireEvent.change(buscador, { target: { value: "SPL" } });
    expect(buscador).toHaveValue("SPL");
    const textos = within(menu).getAllByRole("menuitem").map((m) => m.textContent);
    // Como no hay una llamada exactamente «SPL», también ofrece crearla.
    expect(textos).toEqual(["Pagos/Splits", "«SPL» (crear nueva)", "Crear nueva", "Administrar etiquetas"]);
  });

  it("si lo buscado no existe, ofrece crearlo con ese nombre", async () => {
    montar();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Seleccionar este correo" }));
    fireEvent.keyDown(await screen.findByTitle("Etiquetar"), { key: "Enter" });
    const menu = await screen.findByRole("menu");
    fireEvent.change(within(menu).getByRole("textbox", { name: "Etiquetar como:" }), { target: { value: "Gastos" } });
    fireEvent.click(within(menu).getByRole("menuitem", { name: "«Gastos» (crear nueva)" }));
    const dialogo = await screen.findByRole("dialog");
    expect(within(dialogo).getByRole("textbox")).toHaveValue("Gastos");
  });
});

describe("con el correo ABIERTO, como Keila lo usa en Gmail", () => {
  const abrirCorreo = async () => {
    fireEvent.click(await screen.findByText("Split Millonlyvip P1 Sep"));
    await screen.findByRole("heading", { name: "Split Millonlyvip P1 Sep" });
  };

  it("junto al asunto van «Recibidos ×» y sus etiquetas con ×", async () => {
    porCorreo = new Map([["<split@x>", ["pagos"]]]);
    montar();
    await abrirCorreo();
    expect(screen.getByRole("button", { name: "Quitar Recibidos" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Quitar Pagos" })).toBeInTheDocument();
  });

  it("la × de una etiqueta se la saca a la conversación", async () => {
    porCorreo = new Map([["<split@x>", ["pagos"]]]);
    montar();
    await abrirCorreo();
    fireEvent.click(screen.getByRole("button", { name: "Quitar Pagos" }));
    expect(orden).toEqual(["sacar:pagos:<split@x>"]);
  });

  it("la × de «Recibidos» la archiva", async () => {
    montar();
    await abrirCorreo();
    fireEvent.click(screen.getByRole("button", { name: "Quitar Recibidos" }));
    expect(orden).toEqual(["bulk:archive:INBOX:<split@x>"]);
  });

  it("«Mover a» desde el correo abierto: etiqueta y saca de Recibidos", async () => {
    montar();
    await abrirCorreo();
    // En la barra del correo abierto (la de la selección no está: no hay nada marcado).
    fireEvent.keyDown(screen.getByTitle("Mover a"), { key: "Enter" });
    const menu = await screen.findByRole("menu");
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Pagos" }));
    await waitFor(() => expect(bulk).toHaveBeenCalled());
    expect(orden).toEqual(["poner:pagos:<split@x>", "bulk:archive:INBOX:<split@x>"]);
  });
});
