import { describe, it, expect } from "vitest";
import { fraseCorta } from "@/components/hr/TarjetaArgos";

// Debajo de cada pantallazo va qué hacía EN CORTO (Alvaro, 12/11: la frase larga
// de Argos «se embola»). La frase entera se ve al tocar la foto.
describe("fraseCorta", () => {
  it("corta en el primer «mientras», «para», «a través» o «y» y quita el sujeto de relleno", () => {
    expect(fraseCorta("Navegando en Instagram visualizando reels mientras mantiene activa una llamada")).toBe("Navegando en Instagram visualizando reels");
    expect(fraseCorta("El usuario gestiona conversaciones con fans a través de la plataforma.")).toBe("Gestiona conversaciones con fans");
    expect(fraseCorta("Uso de la plataforma de mensajería para gestionar conversaciones")).toBe("Uso de la plataforma de mensajería");
    expect(fraseCorta("El usuario se encuentra en una sala de videollamada y monitoreo de Cowork")).toBe("Se encuentra en una sala de videollamada");
  });

  it("no deja una frase mocha: si el corte cae muy pronto, sigue al siguiente", () => {
    expect(fraseCorta("Revisa y responde mensajes de fans")).toBe("Revisa y responde mensajes de fans");
  });

  it("sin texto no inventa nada", () => {
    expect(fraseCorta(null)).toBeNull();
    expect(fraseCorta("  ")).toBeNull();
  });
});
