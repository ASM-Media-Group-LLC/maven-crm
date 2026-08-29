import { describe, it, expect } from "vitest";
import { initials } from "@/lib/avatar";

// Las iniciales del avatar, y el bug que se veía en pantalla.
//
// Jhon lo pilló en la miniatura de la videollamada: "la primera letra es como
// un caracter no válido". El cálculo hacía `nombre[0]`, y eso NO devuelve el
// primer carácter: devuelve la primera unidad de 16 bits. Un nombre que empieza
// con emoji quedaba cortado por la mitad y se dibujaba el cuadradito de
// carácter inválido.
//
// Y aunque llegara entero, una banderita no es una inicial.

describe("iniciales del avatar", () => {
  it("nombre y apellido", () => {
    expect(initials("Jhon Lopez")).toBe("JL");
  });

  it("un solo nombre: una sola letra", () => {
    expect(initials("Alexandra")).toBe("A");
  });

  it("un emoji al principio NO se corta por la mitad", () => {
    // Antes esto devolvía media pareja sustituta → cuadradito.
    const r = initials("🏳 Jhon Lopez");
    expect(r).toBe("JL");
    expect(r).not.toMatch(/[\uD800-\uDFFF]/);   // sin mitades sueltas
  });

  it("emoji pegado al nombre tampoco", () => {
    expect(initials("🔥Alexandra Ruiz")).toBe("AR");
  });

  it("un nombre hecho solo de emojis no inventa una inicial", () => {
    expect(initials("🔥✨")).toBe("?");
  });

  it("vacío o nulo", () => {
    expect(initials("")).toBe("?");
    expect(initials(null)).toBe("?");
    expect(initials(undefined)).toBe("?");
  });

  it("saca la arroba de los handles", () => {
    expect(initials("@maria.villegas")).toBe("MV");
  });

  it("separadores con punto, guion y guion bajo", () => {
    expect(initials("luis_carlos")).toBe("LC");
    expect(initials("ana-sofia")).toBe("AS");
  });

  it("acentos y ñ siguen siendo letras", () => {
    expect(initials("Ángel Ñuñez")).toBe("ÁÑ");
  });
});
