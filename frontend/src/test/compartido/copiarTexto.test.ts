import { afterEach, describe, expect, it, vi } from "vitest";
import { copiarTexto } from "@/lib/copiarTexto";

// El botón de copiar de la llave nueva fallaba en el panel de navegador de la app
// de escritorio (sin permiso de portapapeles) y la llave se ve una sola vez.
describe("copiarTexto", () => {
  const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  afterEach(() => {
    if (original) Object.defineProperty(navigator, "clipboard", original);
    else delete (navigator as { clipboard?: unknown }).clipboard;
    vi.restoreAllMocks();
  });

  function ponerPortapapeles(writeText: (t: string) => Promise<void>) {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
  }

  it("usa el portapapeles moderno cuando deja", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    ponerPortapapeles(writeText);
    await expect(copiarTexto("mvk_live_prueba")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("mvk_live_prueba");
  });

  it("si el portapapeles está bloqueado, copia seleccionando el texto", async () => {
    ponerPortapapeles(vi.fn().mockRejectedValue(new Error("NotAllowedError")));
    const exec = vi.fn().mockReturnValue(true);
    (document as { execCommand?: unknown }).execCommand = exec;
    await expect(copiarTexto("mvk_live_prueba")).resolves.toBe(true);
    expect(exec).toHaveBeenCalledWith("copy");
    // No deja el textarea colgado en la página.
    expect(document.querySelectorAll("textarea")).toHaveLength(0);
  });

  it("dice false si ningún camino copió", async () => {
    ponerPortapapeles(vi.fn().mockRejectedValue(new Error("NotAllowedError")));
    (document as { execCommand?: unknown }).execCommand = vi.fn().mockReturnValue(false);
    await expect(copiarTexto("x")).resolves.toBe(false);
  });
});
