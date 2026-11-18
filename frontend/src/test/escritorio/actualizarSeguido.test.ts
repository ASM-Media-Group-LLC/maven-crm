import { describe, expect, it } from "vitest";

// Guarda (17/11/2026): Alvaro publicaba una versión nueva de la app y la app no
// se la ofrecía, porque buscaba cada 4 horas. Ahora busca cada 15 minutos, al
// despertar el computador y a mano desde el menú.
const actualizar = Object.values(import.meta.glob("../../../../desktop/src/actualizar.js", { query: "?raw", import: "default", eager: true }))[0] as string;
const main = Object.values(import.meta.glob("../../../../desktop/src/main.js", { query: "?raw", import: "default", eager: true }))[0] as string;

describe("la app de computador busca versión nueva seguido", () => {
  it("cada 15 minutos o menos", () => {
    const m = actualizar.match(/const CADA = (\d+) \* 60 \* 1000;/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeLessThanOrEqual(15);
  });

  it("también al despertar el computador y al desbloquear la pantalla", () => {
    expect(actualizar).toContain('powerMonitor.on("resume"');
    expect(actualizar).toContain('powerMonitor.on("unlock-screen"');
  });

  it("se puede buscar a mano desde el menú", () => {
    expect(main).toContain("buscarActualizacion = iniciarActualizaciones(");
    expect(main.match(/buscarActualizacion\(true\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
