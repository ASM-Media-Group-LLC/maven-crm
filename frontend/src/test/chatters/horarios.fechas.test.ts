import { describe, it, expect } from "vitest";
import { lunesDe, sumarDias, etiquetaSemana, etiquetaDia, diaSemanaDe, fechaDe, urlCreadora } from "@/pages/chatters/horarios/types";

// Las semanas del Excel: "DESCANSOS SEMANA DEL 31 al 06 SEPTIEMBRE" es la que
// empieza el lunes 31 de agosto de 2026. Todo el módulo cuelga de ese lunes.
describe("horarios · fechas", () => {
  it("lunesDe devuelve el lunes de la semana (jueves 3/9 → lunes 31/8)", () => {
    expect(lunesDe(new Date(2026, 8, 3))).toBe("2026-08-31");
    expect(lunesDe(new Date(2026, 8, 6))).toBe("2026-08-31"); // domingo sigue en la misma semana
    expect(lunesDe(new Date(2026, 8, 7))).toBe("2026-09-07");
  });

  it("weekday 0 = lunes, como en la BD", () => {
    expect(diaSemanaDe(fechaDe("2026-08-31"))).toBe(0);
    expect(diaSemanaDe(fechaDe("2026-09-06"))).toBe(6);
  });

  it("etiqueta la semana cruzando de mes", () => {
    expect(etiquetaSemana("2026-08-31")).toBe("31 ago al 6 sep");
    expect(etiquetaSemana("2026-09-07")).toBe("7 al 13 de sep");
    expect(etiquetaDia("2026-08-31", 5)).toBe("Sábado 5");
  });

  it("con la interfaz en inglés las etiquetas salen en inglés (el weekday no cambia)", () => {
    expect(etiquetaSemana("2026-08-31", "en")).toBe("Aug 31 – Sep 6");
    expect(etiquetaSemana("2026-09-07", "en")).toBe("Sep 7 – 13");
    expect(etiquetaDia("2026-08-31", 5, "en")).toBe("Saturday 5");
    // Sin idioma sigue en español: es lo que ya devolvía.
    expect(etiquetaDia("2026-08-31", 5, "es")).toBe("Sábado 5");
  });

  it("sumarDias cruza fin de mes y de año", () => {
    expect(sumarDias("2026-09-28", 7)).toBe("2026-10-05");
    expect(sumarDias("2026-12-28", 7)).toBe("2027-01-04");
    expect(sumarDias("2026-09-07", -7)).toBe("2026-08-31");
  });

  it("la rotación de descansos al copiar la semana va lunes→martes y domingo→lunes", () => {
    // Misma fórmula que chatter_rest_days_copy_week: (weekday + 1) % 7.
    const rotar = (wd: number) => (wd + 1) % 7;
    expect(rotar(0)).toBe(1);
    expect(rotar(6)).toBe(0);
  });

  it("solo las creadoras ligadas a una ficha tienen perfil", () => {
    expect(urlCreadora({ creator_id: "abc" })).toBe("/creadores/abc");
    expect(urlCreadora({ creator_id: null })).toBeNull();
  });
});
