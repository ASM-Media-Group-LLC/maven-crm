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
const bulk = vi.fn((vars: { folder: string; op: string; items: { messageId?: string }[] }, opts?: { onSuccess?: (r: object) => void }) => {
  orden.push(`bulk:${vars.op}:${vars.folder}:${vars.items.map((m) => m.messageId ?? "sin-id").join(",")}`);
  opts?.onSuccess?.({});
});
const etiquetar = vi.fn((vars: { messageIds: string[]; labelId: string; poner: boolean }, opts?: { onSuccess?: () => void }) => {
  orden.push(`${vars.poner ? "poner" : "sacar"}:${vars.labelId}:${vars.messageIds.join(",")}`);
  opts?.onSuccess?.();
});

let carpetaDelCorreo = "INBOX";
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
  useMailMessage: () => ({ data: null, isLoading: false }),
  usePrefetchMailMessage: () => vi.fn(),
  useMarkSeen: () => ({ mutate: vi.fn() }),
  useDownloadAttachment: () => ({ mutate: vi.fn(), isPending: false }),
  useMailRealtime: () => {},
  useMailSignature: () => ({ data: { enabled: false, html: "" } }),
  useMailBulk: () => ({ mutate: bulk, isPending: false }),
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
  useEtiquetasPorCorreo: () => ({ data: new Map() }),
  useNoLeidosPorEtiqueta: () => ({ data: new Map() }),
  useEtiquetarCorreos: () => ({ mutate: etiquetar, isPending: false }),
  useActualizarEtiqueta: () => ({ mutate: vi.fn(), isPending: false }),
  useBorrarEtiqueta: () => ({ mutate: vi.fn(), isPending: false }),
  useCorreosDeEtiqueta: () => ({ data: [], isLoading: false, error: null }),
}));

import CorreoPage from "@/pages/correo/CorreoPage";

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
});

describe("«Mover a» una etiqueta, como Gmail", () => {
  it("el menú ofrece las etiquetas (con su ruta) debajo de las carpetas", async () => {
    montar();
    fireEvent.click(await screen.findByRole("checkbox", { name: "Seleccionar este correo" }));
    fireEvent.keyDown(await screen.findByTitle("Mover a"), { key: "Enter" });
    const menu = await screen.findByRole("menu");
    const textos = within(menu).getAllByRole("menuitem").map((m) => m.textContent);
    expect(textos).toEqual(["Enviados", "Archivados", "Pagos", "Pagos/Splits"]);
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
