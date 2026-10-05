// REACCIONAR CON CUALQUIER EMOJI, COMO EN WHATSAPP (pedido de Jhon, 02/10).
//
// La barra de reacciones de la burbuja termina en un «+» que abre el selector
// completo (el de Google que pidió Keila). Lo que se elige ahí reacciona al
// mensaje y queda primero en la barra la próxima vez, también en otro
// dispositivo (profiles.ui_prefs.reaccionesRecientes).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within, waitFor, cleanup } from "@testing-library/react";

vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));
vi.mock("@/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: "u1" }, session: null, loading: false }) }));

// Una base mínima: la fila del perfil con su ui_prefs, y qué se escribió.
const base = vi.hoisted(() => {
  const estado = { uiPrefs: null as Record<string, unknown> | null, escrituras: [] as Record<string, unknown>[] };
  const supabase = {
    auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: { ui_prefs: estado.uiPrefs }, error: null }) }),
      }),
      update: (fila: Record<string, unknown>) => ({
        eq: async () => {
          estado.escrituras.push(fila);
          estado.uiPrefs = fila.ui_prefs as Record<string, unknown>;
          return { error: null };
        },
      }),
    }),
  };
  return { estado, supabase };
});
vi.mock("@/integrations/supabase/client", () => ({ supabase: base.supabase }));

import ReactionPicker from "@/pages/messenger/components/ReactionPicker";
import { __reiniciarReaccionesParaTests } from "@/pages/messenger/reaccionesRecientes";

const abrirBarra = () => fireEvent.click(screen.getByRole("button", { name: "Reaccionar" }));
const emojisDeLaBarra = () =>
  screen.getAllByRole("button").filter((b) => b.textContent && !b.getAttribute("aria-label")).map((b) => b.textContent);

beforeEach(() => {
  cleanup();
  localStorage.clear();
  __reiniciarReaccionesParaTests();
  base.estado.uiPrefs = { language: "es", oled: true };
  base.estado.escrituras = [];
});

describe("la barra de reacciones con «+»", () => {
  it("el «+» abre el selector completo y elegir ahí reacciona y cierra", async () => {
    const onSelect = vi.fn();
    render(<ReactionPicker onSelect={onSelect} />);
    abrirBarra();
    expect(emojisDeLaBarra()).toEqual(["👍", "❤️", "😂", "😮", "😢", "🙏", "🔥", "🎉"]);

    fireEvent.click(screen.getByRole("button", { name: "Reaccionar con otro emoji" }));
    // El selector de Google: buscador, categorías y «Uso frecuente».
    expect(screen.getByPlaceholderText("Buscar emojis")).toBeInTheDocument();
    expect(screen.getByText("Uso frecuente")).toBeInTheDocument();
    // El catálogo llega aparte (import dinámico).
    const animales = await screen.findByText("Animales y naturaleza");
    fireEvent.click(within(animales.closest("section")!).getByRole("button", { name: "unicornio" }));

    expect(onSelect).toHaveBeenCalledWith("🦄");
    expect(screen.queryByPlaceholderText("Buscar emojis")).not.toBeInTheDocument();

    // La próxima vez, el unicornio encabeza la barra y sigue habiendo ocho.
    abrirBarra();
    expect(emojisDeLaBarra()).toEqual(["🦄", "👍", "❤️", "😂", "😮", "😢", "🙏", "🔥"]);
  });

  it("buscar en español (con o sin tilde) o en inglés, y Enter elige el primero", async () => {
    const onSelect = vi.fn();
    render(<ReactionPicker onSelect={onSelect} />);
    abrirBarra();
    fireEvent.click(screen.getByRole("button", { name: "Reaccionar con otro emoji" }));
    await screen.findByText("Caras y emociones");

    const buscador = screen.getByPlaceholderText("Buscar emojis");
    fireEvent.change(buscador, { target: { value: "corazon rojo" } });
    const resultados = screen.getByText("Resultados de la búsqueda").closest("section")!;
    expect(within(resultados).getByRole("button", { name: "corazón rojo" })).toHaveTextContent("❤️");

    fireEvent.change(buscador, { target: { value: "pizza" } });
    expect(within(screen.getByText("Resultados de la búsqueda").closest("section")!).getByText("🍕")).toBeInTheDocument();

    fireEvent.change(buscador, { target: { value: "xyzzy" } });
    expect(screen.getByText("Ningún emoji coincide con «xyzzy»")).toBeInTheDocument();

    fireEvent.change(buscador, { target: { value: "fuego" } });
    fireEvent.keyDown(buscador, { key: "Enter" });
    expect(onSelect).toHaveBeenCalledWith("🔥");
  });

  it("reaccionar desde la barra también cuenta y se guarda en el perfil sin pisar lo demás", async () => {
    const onSelect = vi.fn();
    render(<ReactionPicker onSelect={onSelect} />);
    abrirBarra();
    fireEvent.click(screen.getByText("🔥"));
    expect(onSelect).toHaveBeenCalledWith("🔥");

    await waitFor(() => expect(base.estado.escrituras).toHaveLength(1));
    expect(base.estado.escrituras[0]).toEqual({
      ui_prefs: { language: "es", oled: true, reaccionesRecientes: ["🔥"] },
    });

    abrirBarra();
    expect(emojisDeLaBarra()[0]).toBe("🔥");
  });

  it("trae del perfil lo usado en otro dispositivo", async () => {
    base.estado.uiPrefs = { reaccionesRecientes: ["🫡", "👀"] };
    render(<ReactionPicker onSelect={vi.fn()} />);
    abrirBarra();
    await waitFor(() => expect(emojisDeLaBarra().slice(0, 3)).toEqual(["🫡", "👀", "👍"]));
    expect(emojisDeLaBarra()).toHaveLength(8);
  });
});
