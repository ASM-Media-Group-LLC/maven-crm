import { describe, it, expect } from "vitest";
import {
  aCampos, aInstante, claveDeDia, claveDeDiaUTC, diasDelMes, diasQueOcupa,
  horaDe, porDia, rangoDelMes,
} from "@/lib/calendario";

const ev = (starts_at: string, ends_at: string | null = null, all_day = false) =>
  ({ starts_at, ends_at, all_day });

describe("la grilla del mes", () => {
  it("siempre son 42 días, empezando en lunes", () => {
    // Alto fijo: una grilla que cambia de tamaño entre meses hace saltar la
    // página al navegar.
    for (const mes of ["2026-02-01", "2026-09-01", "2026-11-01"]) {
      const dias = diasDelMes(new Date(`${mes}T12:00:00`));
      expect(dias).toHaveLength(42);
      expect(dias[0].getDay()).toBe(1); // lunes
    }
  });

  it("incluye el mes entero y los bordes de las semanas vecinas", () => {
    const dias = diasDelMes(new Date("2026-09-01T12:00:00"));
    const claves = dias.map(claveDeDia);
    expect(claves).toContain("2026-09-01");
    expect(claves).toContain("2026-09-30");
    expect(claves[0] < "2026-09-01").toBe(true);
  });

  it("el rango que se le pide a la base cubre toda la grilla", () => {
    const { desde, hasta } = rangoDelMes(new Date("2026-09-01T12:00:00"));
    const dias = diasDelMes(new Date("2026-09-01T12:00:00"));
    expect(claveDeDia(desde)).toBe(claveDeDia(dias[0]));
    expect(claveDeDia(hasta)).toBe(claveDeDia(dias[41]));
  });
});

describe("⚠️ los eventos de día completo se leen en UTC", () => {
  it("un feriado del 17 cae el 17, no el 16", () => {
    // Se guardan anclados a medianoche UTC (convención de iCalendar para
    // valores DATE). Leerlos en hora local los correría un día en Bogotá
    // (UTC-5): la medianoche UTC del 17 son las 19:00 del 16 allá.
    const feriado = ev("2026-09-17T00:00:00.000Z", null, true);
    expect(diasQueOcupa(feriado)).toEqual(["2026-09-17"]);
  });

  it("uno con hora sí usa la zona de quien mira", () => {
    const reunion = ev("2026-09-17T15:00:00.000Z");
    expect(diasQueOcupa(reunion)).toEqual([claveDeDia(new Date("2026-09-17T15:00:00.000Z"))]);
  });
});

describe("eventos que cruzan días", () => {
  it("uno de varios días ocupa TODAS sus casillas", () => {
    // Si solo se pusiera en el día de inicio, una reunión del lunes a la noche
    // que termina el martes desaparecería del martes, que es cuando se busca.
    const viaje = ev("2026-09-17T00:00:00.000Z", "2026-09-19T00:00:00.000Z", true);
    expect(diasQueOcupa(viaje)).toEqual(["2026-09-17", "2026-09-18", "2026-09-19"]);
  });

  it("uno sin fin declarado ocupa un solo día", () => {
    expect(diasQueOcupa(ev("2026-09-17T00:00:00.000Z", null, true))).toEqual(["2026-09-17"]);
  });

  it("⚠️ una fecha rota no cuelga el render", () => {
    // Tope de seguridad: sin él, un ends_at absurdo haría un bucle de años.
    const roto = ev("2026-09-17T00:00:00.000Z", "2999-01-01T00:00:00.000Z", true);
    expect(diasQueOcupa(roto).length).toBeLessThanOrEqual(400);
  });
});

describe("agrupado por día", () => {
  it("un evento de tres días aparece en los tres", () => {
    const mapa = porDia([ev("2026-09-17T00:00:00.000Z", "2026-09-19T00:00:00.000Z", true)]);
    expect(mapa.get("2026-09-17")).toHaveLength(1);
    expect(mapa.get("2026-09-18")).toHaveLength(1);
    expect(mapa.get("2026-09-19")).toHaveLength(1);
  });

  it("dos eventos el mismo día conviven", () => {
    const mapa = porDia([
      ev("2026-09-17T00:00:00.000Z", null, true),
      ev("2026-09-17T12:00:00.000Z", null, true),
    ]);
    expect(mapa.get("2026-09-17")).toHaveLength(2);
  });
});

describe("la hora de la píldora", () => {
  it("los de día completo no muestran hora", () => {
    expect(horaDe(ev("2026-09-17T00:00:00.000Z", null, true))).toBeNull();
  });

  it("los demás sí", () => {
    expect(horaDe(ev("2026-09-17T15:30:00.000Z"))).toMatch(/^\d{2}:\d{2}$/);
  });
});

describe("ida y vuelta con el formulario", () => {
  it("un día completo vuelve al mismo día", () => {
    const iso = aInstante("2026-09-17", null);
    expect(iso).toBe("2026-09-17T00:00:00.000Z");
    expect(aCampos(iso, true)).toEqual({ fecha: "2026-09-17", hora: "" });
  });

  it("uno con hora vuelve a la misma hora", () => {
    const iso = aInstante("2026-09-17", "14:30");
    expect(aCampos(iso, false)).toEqual({ fecha: "2026-09-17", hora: "14:30" });
  });
});
