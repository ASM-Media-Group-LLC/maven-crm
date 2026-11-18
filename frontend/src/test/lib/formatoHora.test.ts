import { describe, it, expect, afterEach } from "vitest";
import { arreglarAmPm, fijarReloj24, formatUI, horaUI } from "@/lib/formatoHora";
import { a12 } from "@/lib/horaBogota";

// La hora de toda la empresa (Alvaro, 18/11/2026): AM/PM o militar, lo elige el dueño.
const cinco25 = new Date("2026-11-18T17:25:00-05:00");

afterEach(() => fijarReloj24(false));

describe("hora de la empresa", () => {
  it("por defecto AM/PM: «5:25 PM»", () => {
    fijarReloj24(false);
    expect(horaUI(cinco25)).toMatch(/^5:25\s?PM$/);
    expect(a12("17:25")).toBe("5:25 PM");
    expect(formatUI(new Date(2026, 10, 18, 17, 25), "HH:mm")).toMatch(/^5:25\s?PM$/);
  });

  it("con hora militar: «17:25»", () => {
    fijarReloj24(true);
    expect(horaUI(cinco25)).toBe("17:25");
    expect(a12("17:25")).toBe("17:25");
    expect(formatUI(new Date(2026, 10, 18, 17, 25), "HH:mm")).toBe("17:25");
  });

  it("«p. m.» y «pm» quedan como «PM»", () => {
    expect(arreglarAmPm("5:25 p. m.")).toMatch(/^5:25\s?PM$/);
    expect(arreglarAmPm("9:05 a.m.")).toMatch(/^9:05\s?AM$/);
    expect(arreglarAmPm("10:00 pm — 7:00 am")).toMatch(/^10:00\sPM — 7:00\sAM$/);
  });
});
