// El botón único del teléfono (emojis + GIF + stickers). Lo que no puede romperse:
// que abra, que la pestaña de emojis muestre los frecuentes y el catálogo, y que
// tocar un emoji lo inserte SIN cerrar el panel (como WhatsApp). Desde el 02/10
// la pestaña de emojis es el selector de Google (components/chat/SelectorDeEmojis).
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Expresiones from "@/pages/messenger/components/Expresiones";

vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

describe("Expresiones", () => {
  it("abre, muestra frecuentes y catálogo, e inserta al tocar", async () => {
    const onEmoji = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Expresiones favoritos={["🦄"]} onEmoji={onEmoji} onGif={vi.fn()} onSticker={vi.fn()} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByTestId("expresiones"));
    // El selector de Google: «Uso frecuente» con los de la barra y una sección por categoría.
    const frecuentes = screen.getByText("Uso frecuente").closest("section")!;
    expect(await screen.findByText("Caras y emociones")).toBeInTheDocument();
    fireEvent.click(within(frecuentes).getByText("🦄"));
    expect(onEmoji).toHaveBeenCalledWith("🦄");
    // sigue abierto
    expect(screen.getByText("Uso frecuente")).toBeInTheDocument();
    // En el teléfono el buscador NO se enfoca solo: abriría el teclado encima.
    expect(screen.getByPlaceholderText("Buscar emojis")).not.toHaveFocus();
  });
});
