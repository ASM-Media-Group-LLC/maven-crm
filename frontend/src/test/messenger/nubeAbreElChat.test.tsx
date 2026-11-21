import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";
import { MessengerDockProvider, useMessengerDock } from "@/components/messenger/MessengerDock";
import type { ConversationWithDetails } from "@/pages/messenger/types";

const entorno = vi.hoisted(() => ({
  movil: false,
  puedeMessenger: true,
  crearDirecto: vi.fn(),
}));

const conversacion = (id: string, displayName: string): ConversationWithDetails => ({
  id, displayName, type: "direct", name: null, description: null, avatar_url: null,
  created_by: "propio", created_at: "", updated_at: "", participants: [], unreadCount: 0,
});

const conversaciones = [
  conversacion("a", "Ana"), conversacion("b", "Beatriz"),
  conversacion("provisional", "Carmen provisional"), conversacion("real", "Carmen"),
];

vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "propio" } }) }));
vi.mock("@/hooks/ChatProvider", () => ({
  useChatShared: () => ({ conversations: conversaciones, createDirectChat: entorno.crearDirecto }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => entorno.movil }));
vi.mock("@/hooks/usePermissions", () => ({ usePermissions: () => ({ canAccess: () => entorno.puedeMessenger }) }));
vi.mock("@/hooks/useUserRole", () => ({ useUserRole: () => ({ isAdmin: true }) }));
vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));
vi.mock("@/components/messenger/DockChatWindow", () => ({
  default: ({ conversation, onClose }: { conversation: ConversationWithDetails; onClose: () => void }) => (
    <section role="dialog" aria-label={conversation.displayName}><button onClick={onClose}>Cerrar chat</button></section>
  ),
}));
vi.mock("@/components/messenger/ChatsPanel", () => ({
  default: ({ onAbrirChat }: { onAbrirChat: (id: string) => void }) => (
    <button onClick={() => onAbrirChat("a")}>Ana en la nube</button>
  ),
}));

function Pantalla() {
  const location = useLocation();
  const { abrirChat, abrirDirecto } = useMessengerDock();
  return (
    <section>
      <span data-testid="ruta">{location.pathname}{location.search}</span>
      <video aria-label="Cámara de la sala" />
      <button onClick={() => abrirChat("a")}>Abrir Ana</button>
      <button onClick={() => abrirChat("b")}>Abrir Beatriz</button>
      <button onClick={() => abrirDirecto("carmen")}>Abrir Carmen</button>
    </section>
  );
}

const montar = (ruta = "/cowork") => render(
  <MemoryRouter initialEntries={[ruta]}>
    <MessengerDockProvider><Pantalla /></MessengerDockProvider>
  </MemoryRouter>,
);

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { value: 800, configurable: true });
  localStorage.setItem("muelle.pos", JSON.stringify({ x: 420, y: 360 }));
  entorno.movil = false;
  entorno.puedeMessenger = true;
  entorno.crearDirecto.mockReset();
});

afterEach(() => { cleanup(); localStorage.clear(); });

describe("nube de mensajes", () => {
  it("abre y cierra la ventanita sin navegar ni desmontar la cámara de Cowork", async () => {
    montar();
    const camara = screen.getByLabelText("Cámara de la sala");
    fireEvent.click(screen.getByRole("button", { name: "Mensajes" }));
    fireEvent.click(screen.getByRole("button", { name: "Ana en la nube" }));
    await screen.findByRole("dialog", { name: "Ana" });
    fireEvent.click(screen.getByRole("button", { name: "Cerrar chat" }));
    expect(screen.queryByRole("dialog", { name: "Ana" })).toBeNull();
    expect(screen.getByLabelText("Cámara de la sala")).toBe(camara);
    expect(screen.getByTestId("ruta").textContent).toBe("/cowork");
  });

  it("vuelve a mostrar el chat elegido aunque ya estuviera abierto fuera de vista", async () => {
    montar("/mail");
    fireEvent.click(screen.getByRole("button", { name: "Abrir Ana" }));
    await screen.findByRole("dialog", { name: "Ana" });
    fireEvent.click(screen.getByRole("button", { name: "Abrir Beatriz" }));
    await screen.findByRole("dialog", { name: "Beatriz" });
    fireEvent.click(screen.getByRole("button", { name: "Abrir Ana" }));
    await screen.findByRole("dialog", { name: "Ana" });
    expect(screen.queryByRole("dialog", { name: "Beatriz" })).toBeNull();
    expect(screen.getByTestId("ruta").textContent).toBe("/mail");
  });

  it("la resolución tardía de un directo no reemplaza el chat más reciente", async () => {
    let resolver: ((id: string) => void) | undefined;
    entorno.crearDirecto.mockImplementation((_userId: string, callback: (id: string) => void) => {
      resolver = callback;
      return "provisional";
    });
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Abrir Carmen" }));
    await screen.findByRole("dialog", { name: "Carmen provisional" });
    fireEvent.click(screen.getByRole("button", { name: "Abrir Beatriz" }));
    await screen.findByRole("dialog", { name: "Beatriz" });
    act(() => resolver?.("real"));
    expect(screen.getByRole("dialog", { name: "Beatriz" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Carmen" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar chat" }));
    await screen.findByRole("dialog", { name: "Carmen" });
  });

  it("en un teléfono abre la conversación correcta encima de otra página", async () => {
    entorno.movil = true;
    montar("/mail");
    fireEvent.click(screen.getByRole("button", { name: "Abrir Ana" }));
    await screen.findByRole("dialog", { name: "Ana" });
    fireEvent.click(screen.getByRole("button", { name: "Abrir Beatriz" }));
    await screen.findByRole("dialog", { name: "Beatriz" });
    expect(screen.queryByRole("dialog", { name: "Ana" })).toBeNull();
    expect(screen.getByTestId("ruta").textContent).toBe("/mail");
  });

  it("en la página de Messenger, la nube selecciona el chat completo", () => {
    montar("/messenger");
    fireEvent.click(screen.getByRole("button", { name: "Abrir Beatriz" }));
    expect(screen.getByTestId("ruta").textContent).toBe("/messenger?c=b");
    expect(screen.queryByRole("dialog", { name: "Beatriz" })).toBeNull();
  });

  it("oculta la burbuja si el perfil no tiene acceso a Messenger", () => {
    entorno.puedeMessenger = false;
    montar();
    expect(screen.queryByRole("button", { name: "Mensajes" })).toBeNull();
  });
});
