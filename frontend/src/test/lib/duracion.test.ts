import { describe, it, expect } from "vitest";
import { enHoras, minutosEnHorasEnPlantilla } from "@/lib/duracion";

// Alvaro, 18/11/2026: «dame en horas en toda la plataforma, no 538 min».
describe("minutos en horas", () => {
  it("hasta 59 en minutos; de 60 en adelante en horas", () => {
    expect(enHoras(45)).toBe("45 min");
    expect(enHoras(538)).toBe("8 h 58 min");
    expect(enHoras(433)).toBe("7 h 13 min");
    expect(enHoras(120)).toBe("2 h");
  });

  it("el traductor cambia «{n} min» por horas cuando n llega a 60", () => {
    expect(minutosEnHorasEnPlantilla("hace {n} min", { n: 272 })).toBe("hace 4 h 32 min");
    expect(minutosEnHorasEnPlantilla("Lleva {n} minutos así", { n: 90 })).toBe("Lleva 1 h 30 min así");
    expect(minutosEnHorasEnPlantilla("hace {n} min", { n: 12 })).toBe("hace {n} min");
    expect(minutosEnHorasEnPlantilla("{u} de {g} min", { u: 70, g: 15 })).toBe("{u} de {g} min");
  });
});
