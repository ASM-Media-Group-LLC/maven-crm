import { describe, it, expect } from "vitest";
import { segundosMostrados, formatoReloj, motivoDetenido, motivoDetenidoDeOtro, relojDesdePresencia } from "@/lib/coworkReloj";
import { relojDeRespuesta } from "@/lib/coworkLatido";

const T = 1_700_000_000_000;

describe("segundosMostrados", () => {
  it("corriendo: lo del servidor más lo que pasó desde el latido", () => {
    expect(segundosMostrados({ estado: "activo", segundosHoy: 1000, en: T }, T + 25_000)).toBe(1025);
  });
  it("detenido: se queda en lo del servidor", () => {
    expect(segundosMostrados({ estado: "sin_pantalla", segundosHoy: 1000, en: T }, T + 25_000)).toBe(1000);
  });
  it("sin reloj todavía: cero", () => {
    expect(segundosMostrados(null, T)).toBe(0);
  });
});

describe("formatoReloj y motivos", () => {
  it("formatea con segundos, para que se vea correr", () => {
    expect(formatoReloj(0)).toBe("0m 00s");
    expect(formatoReloj(59)).toBe("0m 59s");
    expect(formatoReloj(45 * 60 + 7)).toBe("45m 07s");
    expect(formatoReloj(3600 * 3 + 60 * 7 + 9)).toBe("3h 07m 09s");
  });
  it("explica por qué está detenido, a la persona y al supervisor", () => {
    expect(motivoDetenido("activo")).toBeNull();
    expect(motivoDetenido("fuera_de_camara")).toBe("no estás frente a la cámara");
    expect(motivoDetenidoDeOtro("fuera_de_camara")).toBe("fuera de cámara");
    expect(motivoDetenido(undefined)).toBeNull();
  });
});

describe("relojDeRespuesta / relojDesdePresencia", () => {
  it("lee estado y segundosHoy de la respuesta del latido", () => {
    expect(relojDeRespuesta({ ok: true, estado: "activo", segundosHoy: 4200 }, T)).toEqual({ estado: "activo", segundosHoy: 4200, en: T });
  });
  it("ignora respuestas sin estado válido (sala inexistente, edge vieja)", () => {
    expect(relojDeRespuesta({ ok: true, estado: null, motivo: "sin sala" }, T)).toBeNull();
    expect(relojDeRespuesta({ ok: true }, T)).toBeNull();
    expect(relojDeRespuesta(null, T)).toBeNull();
  });
  it("arma el reloj desde presencia y tolera bundles viejos sin los campos", () => {
    expect(relojDesdePresencia({ relojEstado: "pausa", relojSegundosHoy: 10, relojEn: T })).toEqual({ estado: "pausa", segundosHoy: 10, en: T });
    expect(relojDesdePresencia({ micOn: true } as never)).toBeNull();
    expect(relojDesdePresencia(undefined)).toBeNull();
    expect(relojDesdePresencia({ relojEstado: "otra", relojSegundosHoy: 10, relojEn: T })).toBeNull();
  });
});
