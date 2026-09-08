// "-69970 años" en el perfil de una creadora: la fecha venía como 71996-02-09.
import { describe, it, expect } from "vitest";
import { computeAge, getDaysUntilBirthday, edadPlausible } from "@/lib/edad";
import { anioTipeadoEnRango } from "@/components/ui/date-input";

const hoy = new Date(2026, 8, 7); // 7 de septiembre de 2026

describe("computeAge con guard de plausibilidad", () => {
  it("una fecha normal da la edad de siempre", () => {
    expect(computeAge("1996-02-09", hoy)).toBe(30);
    expect(computeAge("1996-12-25", hoy)).toBe(29);
  });
  it("un año con un dígito de más no da un número negativo: da null", () => {
    expect(computeAge("71996-02-09", hoy)).toBeNull();
    expect(computeAge("91994-08-13", hoy)).toBeNull();
    expect(computeAge("1195-06-01", hoy)).toBeNull();
  });
  it("una fecha futura o de bebé tampoco se muestra", () => {
    expect(computeAge("2026-06-14", hoy)).toBeNull();
    expect(computeAge("2020-01-01", hoy)).toBeNull();
  });
  it("basura da null", () => {
    expect(computeAge("no es fecha", hoy)).toBeNull();
    expect(edadPlausible(NaN)).toBe(false);
  });
});

describe("getDaysUntilBirthday", () => {
  it("cuenta los días hasta el próximo cumpleaños", () => {
    expect(getDaysUntilBirthday("1996-02-09", hoy)).toBe(155);
  });
  it("con una fecha imposible no inventa un cumpleaños", () => {
    expect(getDaysUntilBirthday("71996-02-09", hoy)).toBeNull();
  });
});

describe("anioTipeadoEnRango (DateInput)", () => {
  it("acepta un año dentro del rango del componente", () => {
    expect(anioTipeadoEnRango("09/02/1996", 1940, 2026)).toBe(true);
  });
  it("rechaza años fuera de rango y textos incompletos", () => {
    expect(anioTipeadoEnRango("09/02/7199", 1940, 2026)).toBe(false); // lo que queda de 71996 recortado a 4 dígitos
    expect(anioTipeadoEnRango("09/02/1195", 1940, 2026)).toBe(false);
    expect(anioTipeadoEnRango("09/02/2031", 1940, 2026)).toBe(false);
    expect(anioTipeadoEnRango("09/02/19", 1940, 2026)).toBe(false);
  });
});
