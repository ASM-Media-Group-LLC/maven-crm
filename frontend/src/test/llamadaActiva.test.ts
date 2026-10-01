import { describe, it, expect, beforeEach } from "vitest";
import { marcarLlamadaActiva, quitarLlamadaActiva, hayLlamadaActiva, olvidarLlamadasActivas, marcarConexionEnCurso } from "@/lib/llamadaActiva";

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

// Una llamada que está ENTRANDO también se protege: marcarLlamadaActiva recién
// llega cuando room.connect termina, y una recarga mientras se pide el token o se
// conecta la corta igual (camino real: el aviso de un llamado de Cowork enfoca la
// pestaña, el vigía de versión despierta y la persona entra en esos segundos).
describe("marcarConexionEnCurso", () => {
  it("mientras conecta, hay llamada; al soltar, no", () => {
    const soltar = marcarConexionEnCurso("cowork-plus-1");
    expect(hayLlamadaActiva()).toBe(true);
    soltar();
    expect(hayLlamadaActiva()).toBe(false);
  });
  it("cada intento tiene su marca: soltar uno no suelta el otro, ni dos veces rompe nada", () => {
    const a = marcarConexionEnCurso("sala");
    const b = marcarConexionEnCurso("sala");
    a();
    a();
    expect(hayLlamadaActiva()).toBe(true);
    b();
    expect(hayLlamadaActiva()).toBe(false);
  });
  it("soltar la conexión no suelta la sala ya conectada", () => {
    const soltar = marcarConexionEnCurso("hub");
    marcarLlamadaActiva("hub");
    soltar();
    expect(hayLlamadaActiva()).toBe(true);
    quitarLlamadaActiva("hub");
    expect(hayLlamadaActiva()).toBe(false);
  });
});
