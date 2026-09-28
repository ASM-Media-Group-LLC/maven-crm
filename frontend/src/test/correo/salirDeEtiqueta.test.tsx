import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Jhon (28/09/2026): "cuando selecciono una etiqueta y después me muevo a otra
// sección se queda pegada la etiqueta y tengo que desmarcarla". Tocar una
// carpeta tiene que salir de la etiqueta, y nunca quedan dos marcadas.

vi.mock("react-router-dom", () => ({
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

vi.mock("@/hooks/useMailbox", async (original) => ({
  ...(await original<typeof import("@/hooks/useMailbox")>()),
  useMailbox: () => ({ data: { email_address: "yo@maven-ai.me", is_active: true, has_error: false }, isLoading: false, error: null }),
  useMailFolders: () => ({
    data: [
      { folder: "INBOX", unread: 3 },
      { folder: "Enviado", unread: 0 },
      { folder: "Notification", unread: 12 },
    ],
    isLoading: false,
  }),
  useMailMessages: (carpeta: string) => ({ data: { messages: [correoDe(carpeta)] }, isLoading: false, isFetching: false, error: null, refetch: vi.fn() }),
  useMailSearch: () => ({ data: { messages: [] }, isFetching: false, error: null }),
  useMailMessage: () => ({ data: null, isLoading: false }),
  usePrefetchMailMessage: () => vi.fn(),
  useMarkSeen: () => ({ mutate: vi.fn() }),
  useDownloadAttachment: () => ({ mutate: vi.fn(), isPending: false }),
  useMailRealtime: () => {},
  useMailSignature: () => ({ data: { enabled: false, html: "" } }),
}));

vi.mock("@/hooks/useEtiquetasCorreo", async (original) => ({
  ...(await original<typeof import("@/hooks/useEtiquetasCorreo")>()),
  useEtiquetas: () => ({ data: [{ id: "e1", nombre: "HHRR", color: "#f59e0b" }], isLoading: false }),
  useEtiquetasPorCorreo: () => ({ data: new Map() }),
  useNoLeidosPorEtiqueta: () => ({ data: new Map() }),
  useEtiquetarCorreos: () => ({ mutate: vi.fn(), isPending: false }),
  useCorreosDeEtiqueta: (id: string | null) => ({
    data: id ? [{ id: "m-etq", uid: 99, folder: "INBOX", subject: "Correo de la etiqueta", from_addr: "RRHH <rrhh@x.com>", to_addr: "yo@maven-ai.me", date: "2026-09-27T10:00:00Z" }] : [],
    isLoading: false, error: null,
  }),
}));

// Se declara antes de los mocks que lo usan: vi.mock se iza, pero la fábrica
// recién corre al importar la página.
function correoDe(carpeta: string) {
  return { id: `m-${carpeta}`, uid: 1, folder: carpeta, subject: `Correo de ${carpeta}`, from: "Alguien <a@x.com>", to: "yo@maven-ai.me", date: "2026-09-27T10:00:00Z" };
}

import CorreoPage from "@/pages/correo/CorreoPage";

const montar = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><CorreoPage /></QueryClientProvider>);
};
const enNav = (nombre: string) => screen.getAllByRole("button", { name: nombre })[0];

beforeEach(() => { localStorage.clear(); });

describe("correo · salir de una etiqueta tocando una carpeta", () => {
  it("con la etiqueta marcada, tocar Enviados muestra Enviados y apaga la etiqueta", async () => {
    montar();
    fireEvent.click(enNav("HHRR"));
    await waitFor(() => expect(screen.getByText("Correo de la etiqueta")).toBeInTheDocument());
    expect(enNav("HHRR")).toHaveAttribute("aria-current", "page");
    // Mirando la etiqueta, ninguna carpeta se ve marcada.
    expect(enNav("Recibidos")).not.toHaveAttribute("aria-current");

    fireEvent.click(enNav("Enviados"));
    await waitFor(() => expect(screen.getByText("Correo de Enviado")).toBeInTheDocument());
    expect(screen.queryByText("Correo de la etiqueta")).not.toBeInTheDocument();
    expect(enNav("HHRR")).not.toHaveAttribute("aria-current");
    expect(enNav("Enviados")).toHaveAttribute("aria-current", "page");
  });

  it("también sale tocando la MISMA carpeta en la que estaba (Recibidos)", async () => {
    montar();
    fireEvent.click(enNav("HHRR"));
    await waitFor(() => expect(screen.getByText("Correo de la etiqueta")).toBeInTheDocument());
    fireEvent.click(enNav("Recibidos"));
    await waitFor(() => expect(screen.getByText("Correo de INBOX")).toBeInTheDocument());
    expect(enNav("HHRR")).not.toHaveAttribute("aria-current");
  });
});
