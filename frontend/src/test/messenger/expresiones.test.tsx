// El botón único del teléfono (emojis + GIF + stickers). Lo que no puede romperse:
// que abra, que la pestaña de emojis muestre los frecuentes y el catálogo, y que
// tocar un emoji lo inserte SIN cerrar el panel (como WhatsApp).
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Expresiones from "@/pages/messenger/components/Expresiones";

vi.mock("@/hooks/useLanguage", () => ({ useLanguage: () => ({ t: (k: string) => k }) }));

describe("Expresiones", () => {
  it("abre, muestra frecuentes y catálogo, e inserta al tocar", () => {
    const onEmoji = vi.fn();
    render(
      <QueryClientProvider client={new QueryClient()}>
        <Expresiones favoritos={["🦄"]} onEmoji={onEmoji} onGif={vi.fn()} onSticker={vi.fn()} />
      </QueryClientProvider>,
    );
    fireEvent.click(screen.getByTestId("expresiones"));
    expect(screen.getByText("Frecuentes")).toBeInTheDocument();
    expect(screen.getByText("Caras")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "🦄" }));
    expect(onEmoji).toHaveBeenCalledWith("🦄");
    // sigue abierto
    expect(screen.getByText("Frecuentes")).toBeInTheDocument();
  });
});
