import { describe, it, expect } from "vitest";

// EN LA FILA COMPACTA (teléfono y ventanita), LA CÁMARA SE VA AL ESCRIBIR.
//
// Jhon (16/09): "al escribir una letra el icono de grabar cambia por el de enviar;
// que también desaparezca la cámara para tener más espacio". Misma condición que
// ya usaba el micrófono: hay texto o adjuntos.
const fuentes = (import.meta as unknown as {
  glob: (p: string, o: Record<string, unknown>) => Record<string, string>;
}).glob("/frontend/src/pages/messenger/components/MessageInput.tsx", { query: "?raw", import: "default", eager: true });

describe("fila compacta del compositor", () => {
  it("la cámara solo se dibuja cuando no hay nada que enviar", () => {
    const c = Object.values(fuentes)[0] ?? "";
    expect(c).toMatch(/\{!\(text\.trim\(\) \|\| pendingFiles\.length > 0\) && \(\s*<Button[\s\S]{0,400}aria-label=\{t\("messenger\.input\.camara"\)\}/);
  });
  it("y el micrófono se vuelve enviar con la misma condición", () => {
    const c = Object.values(fuentes)[0] ?? "";
    expect(c).toMatch(/\{text\.trim\(\) \|\| pendingFiles\.length > 0 \? \(/);
  });
});
