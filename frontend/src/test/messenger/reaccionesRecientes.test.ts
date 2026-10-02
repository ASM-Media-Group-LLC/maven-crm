// LA BARRA DE REACCIONES APRENDE COMO LA DE WHATSAPP (pedido de Jhon, 02/10).
//
// Siempre son ocho; lo último con que reaccionaste va primero y lo que falta lo
// completan los de siempre. Aquí van las cuentas, sin pantalla: dada la barra de
// antes y el emoji usado, cuál es la barra de después.
import { describe, it, expect } from "vitest";
import {
  REACCIONES_POR_DEFECTO, EMOJIS_EN_LA_BARRA, MAX_RECIENTES,
  registrarReaccion, barraDeReacciones, frecuentesDeReacciones, recientesValidos,
} from "@/pages/messenger/reaccionesRecientes";

/** La barra que queda después de reaccionar, en orden, con cada emoji de `usos`. */
const barraTras = (...usos: string[]) =>
  barraDeReacciones(usos.reduce<string[]>((recientes, e) => registrarReaccion(recientes, e), []));

describe("la barra de reacciones", () => {
  it("sin historial son los ocho de siempre, en su orden", () => {
    expect(barraDeReacciones([])).toEqual([...REACCIONES_POR_DEFECTO]);
    expect(EMOJIS_EN_LA_BARRA).toBe(8);
  });

  it("un emoji nuevo entra primero y empuja fuera al último de los de siempre", () => {
    expect(barraTras("🦄")).toEqual(["🦄", "👍", "❤️", "😂", "😮", "😢", "🙏", "🔥"]);
  });

  it("uno que ya estaba en la barra sube al frente sin repetirse", () => {
    expect(barraTras("🔥")).toEqual(["🔥", "👍", "❤️", "😂", "😮", "😢", "🙏", "🎉"]);
  });

  it("lo más reciente primero, y la barra nunca pasa de ocho", () => {
    const usos = ["🦄", "🍕", "🚀", "🐶", "🌮", "🎸", "🧠", "🫠", "🥑"];
    const barra = barraTras(...usos);
    expect(barra).toHaveLength(8);
    expect(barra).toEqual([...usos].reverse().slice(0, 8));
  });

  it("volver a usar uno viejo lo trae al frente", () => {
    expect(barraTras("🦄", "🍕", "🦄")).toEqual(["🦄", "🍕", "👍", "❤️", "😂", "😮", "😢", "🙏"]);
  });

  it("el historial guarda hasta 24 y es el «Uso frecuente» del selector", () => {
    let recientes: string[] = [];
    for (let i = 0; i < 30; i++) recientes = registrarReaccion(recientes, String.fromCodePoint(0x1f600 + i));
    expect(recientes).toHaveLength(MAX_RECIENTES);
    expect(recientes[0]).toBe(String.fromCodePoint(0x1f600 + 29));
    // Con historial corto, los de siempre completan la sección.
    expect(frecuentesDeReacciones(["🦄"])).toEqual(["🦄", ...REACCIONES_POR_DEFECTO]);
  });

  it("lo que llega del perfil o de localStorage se valida", () => {
    expect(recientesValidos(["🦄", "👍"])).toEqual(["🦄", "👍"]);
    expect(recientesValidos(["🦄", "🦄", "👍"])).toEqual(["🦄", "👍"]);
    expect(recientesValidos("🦄")).toBeNull();
    expect(recientesValidos([1, 2])).toBeNull();
    expect(recientesValidos(["", "👍"])).toBeNull();
    expect(recientesValidos(null)).toBeNull();
  });
});
