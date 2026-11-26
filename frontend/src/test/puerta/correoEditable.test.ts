import { describe, it, expect } from "vitest";

// Alvaro, 25/11/2026: «que te recuerde está bien, pero no de esa manera, con un
// botón». El correo recordado se puede editar directo (sin candado ni «Usar otro
// correo»); si se cambia, el login vuelve a preguntar al directorio a qué base va.
// Y el cuadro del NAS caído se puede cerrar (la franja de arriba sigue).
type Glob = { glob: (p: string, o: Record<string, unknown>) => Record<string, string> };
const login = Object.values((import.meta as unknown as Glob).glob("/frontend/src/pages/Login.tsx", { query: "?raw", import: "default", eager: true }))[0];
const nas = Object.values((import.meta as unknown as Glob).glob("/frontend/src/components/oficina/AvisoNasCaido.tsx", { query: "?raw", import: "default", eager: true }))[0];

describe("el correo recordado no se bloquea", () => {
  it("el campo de correo no es de solo lectura ni lleva el enlace «Usar otro correo»", () => {
    expect(login).toBeTruthy();
    expect(login).not.toMatch(/readOnly=/);
    expect(login).not.toMatch(/cobros\.puerta\.otroCorreo/);
  });
  it("si el correo cambió, se vuelve a elegir la base antes de entrar", () => {
    expect(login).toMatch(/correo !== correoElegido/);
    expect(login).toMatch(/await elegirBase\(correo\)/);
  });
  it("el cuadro del NAS caído tiene botón para cerrar", () => {
    expect(nas).toMatch(/onClick=\{cerrar\}/);
  });
});
