import { describe, it, expect } from "vitest";
import { calcularNota, bandaDeNota } from "@/lib/notaEmpleado";

// La nota del Monitor IA (Argos) tiene que ser JUSTA y predecible: 0–100 con
// color, y cuando falta un dato (p. ej. no hay horario para la puntualidad) el
// peso se REPARTE, no se pierde. Este guard ata ese comportamiento.

describe("nota del empleado (Monitor IA)", () => {
  it("bandas de color por umbral (80 / 60)", () => {
    expect(bandaDeNota(91)).toBe("bien");
    expect(bandaDeNota(80)).toBe("bien");
    expect(bandaDeNota(79)).toBe("ojo");
    expect(bandaDeNota(60)).toBe("ojo");
    expect(bandaDeNota(59)).toBe("mal");
    expect(bandaDeNota(0)).toBe("mal");
  });

  it("alguien perfecto (sin horario) saca nota alta y verde", () => {
    const n = calcularNota({ horasHechas: 6, faltasSerias: 0, minutosPausaDeMas: 0 });
    expect(n.valor).toBe(100);
    expect(n.banda).toBe("bien");
  });

  it("las faltas serias bajan la nota", () => {
    const limpio = calcularNota({ horasHechas: 6, faltasSerias: 0, minutosPausaDeMas: 0 });
    const conFaltas = calcularNota({ horasHechas: 6, faltasSerias: 5, minutosPausaDeMas: 0 });
    expect(conFaltas.valor!).toBeLessThan(limpio.valor!);
  });

  it("las pausas de más restan en su factor", () => {
    const n = calcularNota({ horasHechas: 6, faltasSerias: 0, minutosPausaDeMas: 30 });
    const pausas = n.factores.find((f) => f.clave === "pausas")!;
    expect(pausas.sub).toBe(40); // 100 - 30*2
    expect(n.valor!).toBeLessThan(100);
  });

  it("sin horario, puntualidad queda SIN dato y su peso se reparte (no castiga)", () => {
    const n = calcularNota({ horasHechas: 6, faltasSerias: 0, minutosPausaDeMas: 0 });
    const punt = n.factores.find((f) => f.clave === "puntualidad")!;
    expect(punt.sub).toBeNull();
    // Con horas=100, faltas=100, pausas=100 y puntualidad repartida → 100, no castiga.
    expect(n.valor).toBe(100);
  });

  it("con horario, la tardanza y la ausencia cuentan", () => {
    const tarde = calcularNota({ horasHechas: 6, faltasSerias: 0, minutosPausaDeMas: 0, minutosTarde: 10 });
    const puntT = tarde.factores.find((f) => f.clave === "puntualidad")!;
    expect(puntT.sub).toBe(70); // 100 - 10*3
    const ausente = calcularNota({ horasHechas: 0, faltasSerias: 0, minutosPausaDeMas: 0, ausente: true });
    const puntA = ausente.factores.find((f) => f.clave === "puntualidad")!;
    expect(puntA.sub).toBe(0);
  });

  it("horas cumplidas se miden contra la meta cuando se pasa", () => {
    const n = calcularNota({ horasHechas: 3, horasMeta: 6, faltasSerias: 0, minutosPausaDeMas: 0 });
    const horas = n.factores.find((f) => f.clave === "horas")!;
    expect(horas.sub).toBe(50); // 3/6
  });

  it("alguien que va mal saca nota roja", () => {
    const n = calcularNota({
      horasHechas: 2,
      horasMeta: 6,
      faltasSerias: 5,
      minutosTarde: 35,
      minutosPausaDeMas: 22,
    });
    expect(n.banda).toBe("mal");
    expect(n.valor!).toBeLessThan(60);
  });
});
