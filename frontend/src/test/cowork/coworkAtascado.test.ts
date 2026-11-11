// Cowork que se queda en la ruedita (lib/coworkAtascado.ts, Isabel, 11/11/2026).
import { describe, it, expect, beforeEach } from "vitest";
import {
  anotarAtasco, marcarRecargaPorAtasco, queHacerConElAtasco, SIN_RECARGAR_OTRA_VEZ_MS, tomarAtascoPrevio, ultimaRecargaPorAtasco,
} from "@/lib/coworkAtascado";

type Glob = { glob: (p: string, o: Record<string, unknown>) => Record<string, string> };
const PAGINA = Object.values((import.meta as unknown as Glob).glob("/frontend/src/pages/cowork/CoworkPage.tsx", { query: "?raw", import: "default", eager: true }))[0] ?? "";

describe("Cowork no se queda en la ruedita para siempre", () => {
  beforeEach(() => { localStorage.clear(); sessionStorage.clear(); });

  it("la primera vez que se traba, recarga sola", () => {
    expect(queHacerConElAtasco({ ultimaRecarga: null, ahora: 1_000_000 })).toBe("recargar");
  });
  it("si se acaba de recargar por lo mismo, no entra en bucle: deja el botón", () => {
    expect(queHacerConElAtasco({ ultimaRecarga: 1_000_000, ahora: 1_000_000 + 30_000 })).toBe("boton");
  });
  it("pasado el rato, vuelve a poder recargar sola", () => {
    expect(queHacerConElAtasco({ ultimaRecarga: 1_000_000, ahora: 1_000_000 + SIN_RECARGAR_OTRA_VEZ_MS })).toBe("recargar");
  });
  it("el paso trabado sobrevive a la recarga y se lee una sola vez", () => {
    anotarAtasco("unirse", 20, 5_000);
    expect(tomarAtascoPrevio()).toEqual({ paso: "unirse", segundos: 20, t: 5_000 });
    expect(tomarAtascoPrevio()).toBeNull();
  });
  it("la marca de recarga queda en la pestaña", () => {
    expect(ultimaRecargaPorAtasco()).toBeNull();
    marcarRecargaPorAtasco(7_000);
    expect(ultimaRecargaPorAtasco()).toBe(7_000);
  });
  it("la página de Cowork tiene el vigilante y el botón Reintentar", () => {
    expect(PAGINA.length).toBeGreaterThan(1000);
    expect(PAGINA).toContain("ATASCO_MS");
    expect(PAGINA).toContain('t("cowork.atasco.reintentar")');
  });
});
