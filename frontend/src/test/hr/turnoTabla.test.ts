import { describe, it, expect } from "vitest";
import { armarFila, instanteBogota, seccionDe, semanaDe, type EntradaPersona } from "@/lib/turnoTabla";

// La tabla del turno de Argos (25/11/2026): las cuentas de cada columna y el semáforo «normal».
const DIA = "2026-11-24";
const h = (hhmm: string) => instanteBogota(DIA, hhmm);
const FIN_DEL_DIA = instanteBogota("2026-11-25", "12:00");

function persona(p: Partial<EntradaPersona> = {}): EntradaPersona {
  return {
    userId: "u1",
    nombre: "Ana",
    horario: { entrada: "16:00:00", salida: "00:00:00", toleranciaMin: 5, confirmado: true, comidaMin: 30, banoMin: 10 },
    segmentos: [{ estado: "activo", inicio: h("16:00"), fin: instanteBogota("2026-11-25", "00:05") }],
    pausas: [],
    avisos: [],
    marcas: [],
    ...p,
  };
}

describe("tabla del turno", () => {
  it("a tiempo y sin novedades: todo en orden", () => {
    const f = armarFila(DIA, persona(), FIN_DEL_DIA);
    expect(f.tardeMin).toBeNull();
    expect(f.nivel).toBe("ok");
    expect(seccionDe(f)).toBe("bien");
  });

  it("17 min tarde es ámbar; 79 min es rojo", () => {
    const tarde = (m: string) => armarFila(DIA, persona({ segmentos: [{ estado: "activo", inicio: h(m), fin: h("23:59") }] }), FIN_DEL_DIA);
    expect(tarde("16:17").tardeMin).toBe(17);
    expect(tarde("16:17").nivelLlegada).toBe("ambar");
    expect(tarde("17:19").nivelLlegada).toBe("rojo");
  });

  it("sin horario confirmado no se cuenta tarde", () => {
    const p = persona({ segmentos: [{ estado: "activo", inicio: h("17:00"), fin: h("23:59") }] });
    p.horario.confirmado = false;
    expect(armarFila(DIA, p, FIN_DEL_DIA).tardeMin).toBeNull();
  });

  it("almuerzo y break suman como comida; las de menos de un minuto no cuentan", () => {
    const f = armarFila(DIA, persona({
      pausas: [
        { kind: "almuerzo", inicio: h("19:00"), fin: h("19:00") + 20_000, autoCerrada: false },
        { kind: "break", inicio: h("19:30"), fin: h("20:12"), autoCerrada: false },
      ],
    }), FIN_DEL_DIA);
    expect(f.comida).toHaveLength(1);
    expect(f.comidaMin).toBe(42);
    expect(f.nivelComida).toBe("rojo"); // 12 min de más
  });

  it("el baño es un saldo del día: 14 de 10 min es ámbar", () => {
    const f = armarFila(DIA, persona({
      pausas: [
        { kind: "bano", inicio: h("18:00"), fin: h("18:08"), autoCerrada: false },
        { kind: "bano", inicio: h("21:00"), fin: h("21:06"), autoCerrada: false },
      ],
    }), FIN_DEL_DIA);
    expect(f.banos).toBe(2);
    expect(f.banoMin).toBe(14);
    expect(f.nivelBano).toBe("ambar");
  });

  it("avisos ignorados: 1 es ámbar, 2 es rojo", () => {
    const aviso = (escalado: boolean) => ({ tipo: "camara_apagada", at: h("18:00"), escalado, cerrado: true });
    expect(armarFila(DIA, persona({ avisos: [aviso(true)] }), FIN_DEL_DIA).nivelAvisos).toBe("ambar");
    expect(armarFila(DIA, persona({ avisos: [aviso(true), aviso(true)] }), FIN_DEL_DIA).nivelAvisos).toBe("rojo");
  });

  it("no vino con el turno terminado es rojo", () => {
    const f = armarFila(DIA, persona({ segmentos: [] }), FIN_DEL_DIA);
    expect(f.noVino).toBe(true);
    expect(f.nivel).toBe("rojo");
  });

  it("la semana va de lunes a domingo", () => {
    expect(semanaDe("2026-11-26")[0]).toBe("2026-11-23");
    expect(semanaDe("2026-11-26")[6]).toBe("2026-11-29");
  });
});
