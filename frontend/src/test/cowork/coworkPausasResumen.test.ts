import { describe, it, expect } from "vitest";
import { agregarPausasPorPersona, totalesPausas, minutosLegibles, fraseDeExcesos, type FilaPausasDia } from "@/lib/coworkPausasResumen";

const fila = (o: Partial<FilaPausasDia>): FilaPausasDia => ({
  dia: "2026-09-08", user_id: "u1", nombre: "Ana", banos: 0, seg_bano: 0, bano_limite_seg: 600, bano_excedido: false,
  breaks: 0, seg_break: 0, break_limite_seg: 1800, breaks_excedidos: 0, seg_break_de_mas: 0, auto_cerradas: 0, ...o,
});

describe("agregarPausasPorPersona", () => {
  it("suma días por persona y cuenta excesos: días de baño y breaks pasados", () => {
    const personas = agregarPausasPorPersona([
      fila({ dia: "2026-09-08", banos: 2, seg_bano: 642, bano_excedido: true, breaks: 1, seg_break: 1847, breaks_excedidos: 1, seg_break_de_mas: 47 }),
      fila({ dia: "2026-09-07", banos: 1, seg_bano: 300, breaks: 1, seg_break: 1500 }),
      fila({ user_id: "u2", nombre: "Luis", banos: 1, seg_bano: 84, breaks: 1, seg_break: 1700 }),
    ]);
    expect(personas.map((p) => p.nombre)).toEqual(["Ana", "Luis"]);
    const ana = personas[0];
    expect(ana.dias).toBe(2);
    expect(ana.banos).toBe(3);
    expect(ana.segBano).toBe(942);
    expect(ana.diasBanoExcedido).toBe(1);
    expect(ana.breaksExcedidos).toBe(1);
    expect(ana.segBreakDeMas).toBe(47);
    expect(ana.conExcesos).toBe(true);
    expect(personas[1].conExcesos).toBe(false);
  });
  it("primero quien tiene excesos, luego por más tiempo en pausa", () => {
    const personas = agregarPausasPorPersona([
      fila({ user_id: "a", nombre: "A", seg_break: 3000 }),
      fila({ user_id: "b", nombre: "B", seg_break: 100, breaks_excedidos: 1, seg_break_de_mas: 10 }),
      fila({ user_id: "c", nombre: "C", seg_break: 500 }),
    ]);
    expect(personas.map((p) => p.nombre)).toEqual(["B", "A", "C"]);
  });
  it("sin nombre no queda vacío", () => {
    expect(agregarPausasPorPersona([fila({ nombre: null })])[0].nombre).toBe("Sin nombre");
  });
});

describe("totalesPausas / minutosLegibles / fraseDeExcesos", () => {
  it("totales cuentan personas con excesos", () => {
    const t = totalesPausas(agregarPausasPorPersona([
      fila({ banos: 2, seg_bano: 700, bano_excedido: true }),
      fila({ user_id: "u2", breaks: 1, seg_break: 600 }),
    ]));
    expect(t).toEqual({ personas: 2, banos: 2, segBano: 700, breaks: 1, segBreak: 600, conExcesos: 1 });
  });
  it("minutos legibles", () => {
    expect(minutosLegibles(0)).toBe("0 min");
    expect(minutosLegibles(592)).toBe("10 min");
    expect(minutosLegibles(3900)).toBe("1 h 05 min");
    expect(minutosLegibles(7200)).toBe("2 h");
  });
  it("frase de excesos", () => {
    const [p] = agregarPausasPorPersona([fila({ bano_excedido: true, breaks_excedidos: 2, seg_break_de_mas: 130 })]);
    expect(fraseDeExcesos(p)).toBe("1 día pasado de baño · 2 breaks pasados (+2 min)");
    expect(fraseDeExcesos(agregarPausasPorPersona([fila({})])[0])).toBeNull();
  });
});
