import { describe, it, expect, beforeEach } from "vitest";
import { marcarLlamadaActiva, quitarLlamadaActiva, hayLlamadaActiva, olvidarLlamadasActivas } from "@/lib/llamadaActiva";

// Cada deploy recargaba la pestaña abierta al primer chunk que ya no existía.
// En una tabla es un parpadeo; en un Meet o en Cowork es que se te caiga la
// llamada. Esta bandera es lo que main.tsx consulta antes de recargar.
beforeEach(() => olvidarLlamadasActivas());

describe("hayLlamadaActiva", () => {
  it("sin llamadas, no hay nada que proteger", () => {
    expect(hayLlamadaActiva()).toBe(false);
  });
  it("con una sala conectada, se protege", () => {
    marcarLlamadaActiva("cowork-plus-1");
    expect(hayLlamadaActiva()).toBe(true);
  });
  it("al desconectar la última, se deja de proteger", () => {
    marcarLlamadaActiva("a"); marcarLlamadaActiva("b");
    quitarLlamadaActiva("a");
    expect(hayLlamadaActiva()).toBe(true);
    quitarLlamadaActiva("b");
    expect(hayLlamadaActiva()).toBe(false);
  });
  it("marcar dos veces la misma sala no la cuenta dos veces", () => {
    marcarLlamadaActiva("hub"); marcarLlamadaActiva("hub");
    quitarLlamadaActiva("hub");
    expect(hayLlamadaActiva()).toBe(false);
  });
});
