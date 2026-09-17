import { describe, it, expect, afterEach } from "vitest";
import { traducir, fijarIdioma, getTranslation } from "@/lib/i18n";

// `traducir()` es el diccionario para el código que NO es un componente: los
// avisos `toast()` que salen de un callback o de una mutación, y los módulos de
// `lib/` que arman texto sin poder llamar a un hook.
//
// Lo que se fija acá es el contrato, porque es fácil de romper sin darse cuenta:
// si alguien cambia el provider y deja de llamar a `fijarIdioma`, `traducir()`
// sigue devolviendo español para siempre y nadie se entera hasta que un usuario
// en inglés ve un toast en español.

afterEach(() => fijarIdioma("es"));

describe("traducir() fuera de React", () => {
  it("sigue el idioma que le fija el provider", () => {
    fijarIdioma("es");
    expect(traducir("common.save")).toBe("Guardar");

    fijarIdioma("en");
    expect(traducir("common.save")).toBe("Save");
  });

  it("arranca en español, como el provider", () => {
    expect(traducir("common.save")).toBe("Guardar");
  });

  it("reemplaza los parámetros igual que t()", () => {
    fijarIdioma("en");
    expect(getTranslation("common.save", "en")).toBe(traducir("common.save"));
  });

  it("devuelve la clave si falta la traducción, para que se note en QA", () => {
    // El fallback de getTranslation: una clave sin fila se ve tal cual en
    // pantalla («common.noExiste») en vez de quedar en blanco.
    expect(getTranslation("common.noExiste" as never, "en")).toBe("common.noExiste");
  });
});
