import { describe, it, expect } from "vitest";
import { calcularJornada, type PersonaCruda } from "@/lib/argosJornada";
import { appDe, loBuenoYLoMalo, loPeor, tiempoPorApp } from "@/lib/argosResumen";

// GUARDA de «Lo bueno / Lo malo» y de la frase del día (Alvaro, 11/11/2026: «una
// frase que diga cómo va y por qué, en minutos»; «cada cosa con su hora»).

const base: PersonaCruda = {
  id: "x", nombre: "X", objetivo: true, entrada: "08:00", salida: "12:00", exento: false,
  segmentos: [
    ["activo", "2026-11-10T08:07:00-05:00", "2026-11-10T09:30:00-05:00"],
    ["sin_camara", "2026-11-10T09:30:00-05:00", "2026-11-10T09:44:00-05:00"],
    ["activo", "2026-11-10T09:44:00-05:00", "2026-11-10T12:00:00-05:00"],
  ],
  pausas: [], fuera: [], alertas: [],
  flojas: [["2026-11-10T09:03:00-05:00", "2026-11-10T09:05:00-05:00"]],
};
const at = (h: string) => Date.parse(`2026-11-10T${h}:00-05:00`);
const caps = [
  { at: at("09:03"), veredicto: "Instagram / Navegador web · Perfil personal", flojo: true },
  { at: at("09:08"), veredicto: "Infloww · Responde fans", flojo: false },
  { at: at("09:13"), veredicto: "Infloww · Responde fans", flojo: false },
];

describe("lo bueno y lo malo", () => {
  const j = calcularJornada(base, "2026-11-10", { bano: 600, break: 1800, almuerzo: 1800 }, at("23:00"));
  const r = loBuenoYLoMalo(j, caps);

  it("lo malo, cada cosa con su hora: entró tarde, Instagram, sin cámara", () => {
    expect(r.malo.map((h) => [h.clave, h.estado ?? null, h.min ?? null, h.app ?? null])).toEqual([
      ["tarde", null, 7, null],
      ["falla", "distraido", 2, "Instagram / Navegador web"],
      ["falla", "sin_camara", 14, null],
    ]);
  });

  it("lo bueno: los tramos largos trabajando bien", () => {
    expect(r.bueno.filter((h) => h.clave === "bienTramo").map((h) => h.min)).toEqual([56, 136]);
    expect(r.bueno.some((h) => h.clave === "aTiempo")).toBe(false);
  });

  it("la frase toma lo peor (por minutos) y lo dice en orden de hora", () => {
    expect(loPeor(r.malo, 2).map((h) => h.clave + (h.estado ? `:${h.estado}` : ""))).toEqual(["tarde", "falla:sin_camara"]);
  });

  it("dónde pasó el tiempo, en minutos aproximados por app", () => {
    expect(tiempoPorApp(caps)).toEqual([{ app: "Infloww", min: 10 }, { app: "Instagram / Navegador web", min: 5 }]);
    expect(appDe("Uso del chat interno de Maven para hablar")).toBe("Uso del chat interno");
  });
});
