import { describe, it, expect } from "vitest";
import {
  claveDeDia, diasDeLaSemana, rangoDeLaSemana, repartirSolapados, trozoDelDia,
} from "@/lib/calendario";

/** Un evento con hora LOCAL, que es como se posiciona en la grilla. */
const ev = (dia: string, desde: string, hasta: string | null, all_day = false) => ({
  starts_at: new Date(`${dia}T${desde}:00`).toISOString(),
  ends_at: hasta ? new Date(`${dia}T${hasta}:00`).toISOString() : null,
  all_day,
});

const JUEVES = new Date("2026-09-17T12:00:00");

describe("la semana", () => {
  it("son 7 días de lunes a domingo", () => {
    const dias = diasDeLaSemana(JUEVES);
    expect(dias).toHaveLength(7);
    expect(dias[0].getDay()).toBe(1);
    expect(dias[6].getDay()).toBe(0);
    expect(dias.map(claveDeDia)).toContain("2026-09-17");
  });

  it("el rango cubre de la medianoche del lunes al final del domingo", () => {
    const { desde, hasta } = rangoDeLaSemana(JUEVES);
    expect(desde.getHours()).toBe(0);
    expect(hasta.getHours()).toBe(23);
    expect(claveDeDia(desde)).toBe(claveDeDia(diasDeLaSemana(JUEVES)[0]));
  });
});

describe("dónde se dibuja un evento dentro del día", () => {
  it("de 09:00 a 10:30 son 540 minutos desde medianoche y 90 de alto", () => {
    const t = trozoDelDia(ev("2026-09-17", "09:00", "10:30"), JUEVES)!;
    expect(t).toEqual({ desde: 540, minutos: 90 });
  });

  it("los de día completo NO van en la grilla horaria", () => {
    // Van en la banda de arriba, separados, como hace Google.
    expect(trozoDelDia(ev("2026-09-17", "00:00", null, true), JUEVES)).toBeNull();
  });

  it("uno de otro día no se dibuja acá", () => {
    expect(trozoDelDia(ev("2026-09-19", "09:00", "10:00"), JUEVES)).toBeNull();
  });

  it("⚠️ uno que cruza la medianoche se RECORTA a cada día", () => {
    // De 23:00 del 17 a 01:00 del 18. Sin recortar, el bloque se dibujaría
    // fuera de la columna o estiraría la grilla.
    const cruza = {
      starts_at: new Date("2026-09-17T23:00:00").toISOString(),
      ends_at: new Date("2026-09-18T01:00:00").toISOString(),
      all_day: false,
    };
    expect(trozoDelDia(cruza, JUEVES)).toEqual({ desde: 1380, minutos: 60 });
    const viernes = new Date("2026-09-18T12:00:00");
    expect(trozoDelDia(cruza, viernes)).toEqual({ desde: 0, minutos: 60 });
  });

  it("uno sin fin declarado dura 30 minutos, no cero", () => {
    // Un bloque de alto cero no se ve, y un evento invisible es peor que uno
    // con una duración supuesta.
    expect(trozoDelDia(ev("2026-09-17", "09:00", null), JUEVES)!.minutos).toBe(30);
  });

  it("uno muy corto igual mide 20 minutos, para poder clicarlo", () => {
    expect(trozoDelDia(ev("2026-09-17", "09:00", "09:05"), JUEVES)!.minutos).toBe(20);
  });
});

describe("⚠️ eventos que se pisan", () => {
  it("dos a la misma hora se reparten en dos columnas", () => {
    // Sin esto, uno se dibuja encima del otro y el de abajo desaparece —
    // justo cuando más importa verlos.
    const r = repartirSolapados(
      [ev("2026-09-17", "09:00", "10:00"), ev("2026-09-17", "09:30", "10:30")],
      JUEVES,
    );
    expect(r).toHaveLength(2);
    expect(r.every((x) => x.columnas === 2)).toBe(true);
    expect(r.map((x) => x.columna).sort()).toEqual([0, 1]);
  });

  it("dos que NO se tocan ocupan cada uno todo el ancho", () => {
    const r = repartirSolapados(
      [ev("2026-09-17", "09:00", "10:00"), ev("2026-09-17", "11:00", "12:00")],
      JUEVES,
    );
    expect(r.every((x) => x.columnas === 1)).toBe(true);
  });

  it("el hueco se reusa: tres eventos encadenados no piden tres columnas", () => {
    // 9-10 y 10-11 no se pisan entre sí, así que comparten columna aunque el
    // de 9:30-10:30 los encadene en un mismo grupo.
    const r = repartirSolapados(
      [
        ev("2026-09-17", "09:00", "10:00"),
        ev("2026-09-17", "09:30", "10:30"),
        ev("2026-09-17", "10:00", "11:00"),
      ],
      JUEVES,
    );
    expect(Math.max(...r.map((x) => x.columnas))).toBe(2);
  });

  it("los de día completo no entran en el reparto", () => {
    const r = repartirSolapados([ev("2026-09-17", "00:00", null, true)], JUEVES);
    expect(r).toHaveLength(0);
  });
});
