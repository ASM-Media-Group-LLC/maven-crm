import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// Pedido de Jhon (03/09/2026): poder ocultar la columna de carpetas del correo
// como se oculta el panel lateral de Maven, quedando solo los iconos.

vi.mock("react-router-dom", () => ({
  useSearchParams: () => [new URLSearchParams(), vi.fn()],
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
// La sección de Etiquetas usa el diccionario (t()).
vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

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
  useMailMessages: () => ({ data: { messages: [] }, isLoading: false, isFetching: false, error: null, refetch: vi.fn() }),
  useMailSearch: () => ({ data: { messages: [] }, isFetching: false, error: null }),
  useMailMessage: () => ({ data: null, isLoading: false }),
  usePrefetchMailMessage: () => vi.fn(),
  useMarkSeen: () => ({ mutate: vi.fn() }),
  useDownloadAttachment: () => ({ mutate: vi.fn(), isPending: false }),
  useMailRealtime: () => {},
  useMailSignature: () => ({ data: { enabled: false, html: "" } }),
}));

import CorreoPage from "@/pages/correo/CorreoPage";

const montar = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}><CorreoPage /></QueryClientProvider>);
};

const boton = () => screen.getByRole("button", { name: /(ocultar|mostrar) las carpetas/i });
const carpetaInbox = () => screen.getAllByRole("button", { name: "Recibidos" })[0];

beforeEach(() => { localStorage.clear(); });

describe("correo · columna de carpetas plegable", () => {
  it("arranca abierta: se ven los nombres y el título de la sección", async () => {
    montar();
    await waitFor(() => expect(screen.getByText("Carpetas")).toBeInTheDocument());
    expect(carpetaInbox().textContent).toContain("Recibidos");
    expect(boton()).toHaveAttribute("aria-expanded", "true");
  });

  it("al plegarla quedan solo los iconos: sin texto, pero la carpeta sigue clickeable", async () => {
    montar();
    fireEvent.click(boton());
    await waitFor(() => expect(screen.queryByText("Carpetas")).not.toBeInTheDocument());
    // El botón sigue existiendo (accesible por aria-label) pero ya no muestra el nombre.
    expect(carpetaInbox().textContent).not.toContain("Recibidos");
    // …y el nombre queda en el tooltip, con los no leídos.
    expect(carpetaInbox().getAttribute("title")).toBe("Recibidos · 3 sin leer");
    expect(boton()).toHaveAttribute("aria-expanded", "false");
  });

  it("plegada muestra el globito de no leídos sobre el icono (9+ si son muchos)", async () => {
    montar();
    fireEvent.click(boton());
    await waitFor(() => expect(screen.queryByText("Carpetas")).not.toBeInTheDocument());
    expect(carpetaInbox().textContent).toContain("3");
    const notificaciones = screen.getAllByRole("button", { name: "Notificaciones" })[0];
    expect(notificaciones.textContent).toContain("9+");   // 12 no leídos
  });

  it("se recuerda plegada para la próxima vez", async () => {
    const { unmount } = montar();
    fireEvent.click(boton());
    await waitFor(() => expect(localStorage.getItem("maven.correo.carpetas")).toBe("0"));
    unmount();
    montar();
    await waitFor(() => expect(boton()).toHaveAttribute("aria-expanded", "false"));
    expect(screen.queryByText("Carpetas")).not.toBeInTheDocument();
  });

  it("volver a desplegarla trae los nombres de nuevo", async () => {
    montar();
    fireEvent.click(boton());
    await waitFor(() => expect(screen.queryByText("Carpetas")).not.toBeInTheDocument());
    fireEvent.click(boton());
    await waitFor(() => expect(screen.getByText("Carpetas")).toBeInTheDocument());
    expect(carpetaInbox().textContent).toContain("Recibidos");
    expect(carpetaInbox().getAttribute("title")).toBeNull();
  });
});
