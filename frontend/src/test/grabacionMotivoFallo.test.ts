import { describe, it, expect } from "vitest";
import { motivoDeFallo } from "@/lib/grabacionMotivoFallo";

describe("motivoDeFallo", () => {
  it("el 503 del egress se lee como 'grabador ocupado'", () => {
    expect(motivoDeFallo("Request failed with status 503: Service Unavailable")).toMatch(/ocupado con otra grabación/);
  });
  it("el egress que terminó sin archivo se explica por falta de cámara/micro", () => {
    expect(motivoDeFallo("el egress terminó sin stop y no dejó archivo")).toMatch(/nadie tenía la cámara ni el micrófono/);
  });
  it("sin detalle dice que no hay detalle; lo desconocido pasa recortado", () => {
    expect(motivoDeFallo(null)).toBe("Falló sin detalle.");
    expect(motivoDeFallo("x".repeat(300))).toHaveLength(160);
  });
});
