import { describe, it, expect } from "vitest";
import { normalizeRoomCode, isCompleteRoomCode, ROOM_CODE_LENGTH } from "@/lib/coworkRoomCode";

// El código de sala se comparte por WhatsApp y se dicta por voz, así que llega
// sucio: en minúscula, con espacios, con guiones que alguien agregó para leerlo.
// La normalización es la que decide si el canje funciona o el usuario ve
// "Código inválido" sin entender por qué.
describe("normalizeRoomCode", () => {
  it("pasa un código ya limpio sin tocarlo", () => {
    expect(normalizeRoomCode("4KTEUP")).toBe("4KTEUP");
  });

  it("sube a mayúsculas", () => {
    expect(normalizeRoomCode("4kteup")).toBe("4KTEUP");
  });

  it("saca espacios de los extremos y del medio", () => {
    expect(normalizeRoomCode("  4K TE UP ")).toBe("4KTEUP");
  });

  it("saca guiones y puntos que la gente agrega al dictarlo", () => {
    expect(normalizeRoomCode("4K-TE-UP")).toBe("4KTEUP");
    expect(normalizeRoomCode("4.K.T.E.U.P")).toBe("4KTEUP");
  });

  it("recorta a 6 caracteres (pegar dos veces no arma un código raro)", () => {
    expect(normalizeRoomCode("4KTEUP4KTEUP")).toBe("4KTEUP");
    expect(normalizeRoomCode("4KTEUP").length).toBe(ROOM_CODE_LENGTH);
  });

  it("descarta acentos y símbolos en vez de dejarlos pasar", () => {
    expect(normalizeRoomCode("4KTÉU¡P")).toBe("4KTUP");
  });

  it("de un pegado vacío o basura devuelve cadena vacía", () => {
    expect(normalizeRoomCode("")).toBe("");
    expect(normalizeRoomCode("   ---   ")).toBe("");
  });
});

describe("isCompleteRoomCode", () => {
  it("es true solo con los 6 caracteres, ya normalizados", () => {
    expect(isCompleteRoomCode("4kteup")).toBe(true);
    expect(isCompleteRoomCode("4K-TE-UP")).toBe(true);
  });

  it("es false mientras el usuario todavía está tipeando", () => {
    expect(isCompleteRoomCode("4KT")).toBe(false);
    expect(isCompleteRoomCode("")).toBe(false);
  });

  it("es false si lo que pegó no tiene 6 caracteres útiles", () => {
    // Cinco letras + un acento que se descarta: NO alcanza, y el botón no se habilita.
    expect(isCompleteRoomCode("4KTÉUP")).toBe(false);
  });
});
