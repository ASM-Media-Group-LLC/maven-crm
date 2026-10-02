// LA BARRA DE ENVÍO RÁPIDO DEL MESSENGER NO SE TOCA; SU «+» SOLO SE VE MEJOR.
//
// ⚠️ Innegociable (Jhon): la fila de emojis arriba del cuadro de escritura, con su
// «+» y su lápiz, queda en el mismo lugar y hace lo mismo. Lo único que cambió el
// 02/10 es lo que se ve DENTRO del popup del «+»: el selector de Google en lugar
// de la lista de categorías del Chatter. Elegir ahí sigue sumando el emoji a la
// barra, el popup no se cierra y lo que ya está en la barra queda deshabilitado.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { useState } from "react";

vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

import { EmojiBar } from "@/pages/chatter-evaluator/workspace/EmojiBar";
import SelectorDeEmojis from "@/components/chat/SelectorDeEmojis";

type Glob = { glob: (p: string, o: Record<string, unknown>) => Record<string, string> };
const fuente = Object.values((import.meta as unknown as Glob).glob(
  "/frontend/src/pages/messenger/components/MessageInput.tsx", { query: "?raw", import: "default", eager: true },
))[0] ?? "";

/** La barra como la arma MessageInput: insertar, sumar, quitar y el selector de Google. */
function BarraDelMessenger({ onPick }: { onPick: (e: string) => void }) {
  const [emojis, setEmojis] = useState(["👍", "❤️"]);
  return (
    <EmojiBar
      emojis={emojis}
      onPick={onPick}
      onAdd={(e) => setEmojis((curr) => (curr.includes(e) ? curr : [...curr, e]))}
      onRemove={(e) => setEmojis((curr) => curr.filter((x) => x !== e))}
      selector={({ enLaBarra, onAgregar }) => (
        <SelectorDeEmojis className="h-96" deshabilitados={enLaBarra} motivoDeshabilitado="Ya en la barra" onElegir={onAgregar} />
      )}
    />
  );
}

describe("la barra de envío rápido del Messenger", () => {
  it("MessageInput sigue montando la misma barra y solo le pasa el selector al «+»", () => {
    expect(fuente.length).toBeGreaterThan(1000);
    expect(fuente).toMatch(/<EmojiBar\s+emojis=\{messengerEmojis\}\s+onPick=\{\(e\) => composerRef\.current\?\.insertText\(e\)\}/);
    expect(fuente).toMatch(/selector=\{\(\{ enLaBarra, onAgregar \}\) => \(\s*<SelectorDeEmojis/);
    // Sigue solo en escritorio y fuera de la grabación, como antes.
    expect(fuente).toMatch(/\{!isRecording && !isMobile && \(\s*<div>\s*<EmojiBar/);
  });

  it("tocar un emoji de la barra lo inserta, igual que antes", () => {
    const onPick = vi.fn();
    render(<BarraDelMessenger onPick={onPick} />);
    fireEvent.click(screen.getByText("❤️"));
    expect(onPick).toHaveBeenCalledWith("❤️");
  });

  it("el «+» abre el selector de Google; elegir suma a la barra y el popup sigue abierto", async () => {
    const onPick = vi.fn();
    render(<BarraDelMessenger onPick={onPick} />);
    fireEvent.click(screen.getByTitle("Agregar emoji"));
    const dialogo = screen.getByRole("dialog");
    expect(within(dialogo).getByPlaceholderText("Buscar emojis")).toBeInTheDocument();

    const caras = (await within(dialogo).findByText("Caras y emociones")).closest("section")!;
    // Lo que ya está en la barra se ve, pero deshabilitado.
    expect(within(caras).getByText("❤️").closest("button")).toBeDisabled();

    fireEvent.click(within(caras).getByText("😎"));
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(within(caras).getByText("😎").closest("button")).toBeDisabled();

    // Ya está en la barra (fuera del popup).
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    fireEvent.click(screen.getByText("😎"));
    expect(onPick).toHaveBeenCalledWith("😎");
  });

  it("sin selector (Chatter, bandeja, composer compartido) sigue el catálogo de siempre", () => {
    render(<EmojiBar emojis={["😏"]} onPick={vi.fn()} onAdd={vi.fn()} onRemove={vi.fn()} />);
    fireEvent.click(screen.getByTitle("Agregar emoji"));
    expect(within(screen.getByRole("dialog")).getByText("Cuerpo")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).queryByPlaceholderText("Buscar emojis")).not.toBeInTheDocument();
  });
});
