import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import QuienesEstan, { fraseDeQuienesEstan } from "@/pages/messenger/videocall/QuienesEstan";
import type { PersonaEnSala } from "@/hooks/useQuienesEstanEnLaSala";

vi.mock("@/hooks/useLanguage", (original) =>
  import("@/test/messenger/espanolEnTests").then((m) => m.idiomaEnEspanol(original)));

const persona = (id: string, nombre: string, extra: Partial<PersonaEnSala> = {}): PersonaEnSala => ({
  id, nombre, foto: null, seed: null, invitado: false, ...extra,
});

describe("fraseDeQuienesEstan", () => {
  it("dice que no hay nadie cuando la sala está vacía", () => {
    expect(fraseDeQuienesEstan([])).toBe("Nadie más ha llegado todavía");
  });
  it("una persona", () => {
    expect(fraseDeQuienesEstan(["Ana"])).toBe("Ana está en esta llamada");
  });
  it("dos y tres personas se enumeran con 'y'", () => {
    expect(fraseDeQuienesEstan(["Ana", "Luis"])).toBe("Ana y Luis están en esta llamada");
    expect(fraseDeQuienesEstan(["Ana", "Luis", "Marta"])).toBe("Ana, Luis y Marta están en esta llamada");
  });
  it("con más de tres deja de enumerar", () => {
    expect(fraseDeQuienesEstan(["Ana", "Luis", "Marta", "Pedro", "Sofía"]))
      .toBe("Ana, Luis y 3 más están en esta llamada");
  });
  it("ignora nombres vacíos", () => {
    expect(fraseDeQuienesEstan(["Ana", "  ", ""])).toBe("Ana está en esta llamada");
  });
});

describe("QuienesEstan", () => {
  it("muestra el spinner solo la primera vez, sin lista", () => {
    render(<QuienesEstan personas={[]} cargando />);
    expect(screen.getByText("Viendo quién está…")).toBeInTheDocument();
  });

  it("con la sala vacía dice que no llegó nadie y no dibuja caras", () => {
    render(<QuienesEstan personas={[]} />);
    expect(screen.getByText("Nadie más ha llegado todavía")).toBeInTheDocument();
    expect(screen.queryByTitle(/./)).not.toBeInTheDocument();
  });

  it("dibuja una cara por persona (iniciales sin foto ni muñequito) y la frase", () => {
    render(<QuienesEstan personas={[persona("1", "Ana Gómez"), persona("2", "Luis Pérez")]} />);
    expect(screen.getByText("Ana Gómez y Luis Pérez están en esta llamada")).toBeInTheDocument();
    expect(screen.getByText("AG")).toBeInTheDocument();
    expect(screen.getByText("LP")).toBeInTheDocument();
  });

  it("usa el muñequito DiceBear cuando la persona eligió uno", () => {
    render(<QuienesEstan personas={[persona("1", "Ana Gómez", { seed: "gatito" })]} />);
    const img = screen.getByAltText("Ana Gómez") as HTMLImageElement;
    // El muñequito se dibuja localmente como SVG embebido, no desde la red.
    expect(img.src.startsWith("data:image/svg+xml")).toBe(true);
    expect(screen.queryByText("AG")).not.toBeInTheDocument();
  });

  it("con más de cinco caras muestra +N", () => {
    const muchos = Array.from({ length: 8 }, (_, i) => persona(String(i), `Persona ${i}`));
    render(<QuienesEstan personas={muchos} />);
    expect(screen.getByText("+3")).toBeInTheDocument();
    expect(screen.getAllByTitle(/Persona/)).toHaveLength(5);
  });

  it("si hay lista, un refresco no vuelve a mostrar el spinner", () => {
    render(<QuienesEstan personas={[persona("1", "Ana")]} cargando />);
    expect(screen.queryByText("Viendo quién está…")).not.toBeInTheDocument();
    expect(screen.getByText("Ana está en esta llamada")).toBeInTheDocument();
  });
});
