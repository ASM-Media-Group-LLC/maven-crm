import { describe, expect, it } from "vitest";
import { buildComparisonRanges } from "@/pages/sales-overview/usePeriodComparison";

// La comparativa del tab Ventas debe ser a DÍAS EQUIVALENTES: mes-parcial vs
// mes-completo daba −43.4% cuando lo justo (ago 1-24 vs jul 1-24) es −28.0% e
// inflaba "En Riesgo/Bajando". Estas pruebas fijan la aritmética de rangos.
const d = (s: string) => new Date(s + "T00:00:00");
const iso = (x: Date) =>
  `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;

describe("buildComparisonRanges", () => {
  it("preset 'Este mes': clampea `to` a hoy y compara con el mismo período del mes anterior", () => {
    const r = buildComparisonRanges(d("2026-08-01"), d("2026-08-31"), d("2026-08-24"));
    expect(iso(r.effTo)).toBe("2026-08-24"); // no cuenta días futuros
    expect(iso(r.prevFrom)).toBe("2026-07-01");
    expect(iso(r.prevTo)).toBe("2026-07-24"); // ago 1-24 vs jul 1-24 (mismos días transcurridos)
    expect(r.includesToday).toBe(true);
    expect(r.comparisonLabel).toBe("vs mismo período del mes anterior");
  });

  it("mes completo pasado: compara contra el mes anterior completo", () => {
    const r = buildComparisonRanges(d("2026-07-01"), d("2026-07-31"), d("2026-08-24"));
    expect(iso(r.effTo)).toBe("2026-07-31");
    expect(iso(r.prevFrom)).toBe("2026-06-01");
    expect(iso(r.prevTo)).toBe("2026-06-30"); // jun tiene 30 días: capado sin invadir julio
    expect(r.includesToday).toBe(false);
  });

  it("mes anterior más corto (mar vs feb): el período previo nunca invade el actual", () => {
    const r = buildComparisonRanges(d("2026-03-01"), d("2026-03-31"), d("2026-03-30"));
    expect(iso(r.prevFrom)).toBe("2026-02-01");
    expect(iso(r.prevTo)).toBe("2026-02-28"); // feb solo tiene 28 días
  });

  it("preset 'Esta semana' un lunes: 1 día transcurrido vs el lunes pasado", () => {
    // 2026-08-24 es lunes; semana seleccionada = ago 24-30.
    const r = buildComparisonRanges(d("2026-08-24"), d("2026-08-30"), d("2026-08-24"));
    expect(iso(r.effTo)).toBe("2026-08-24");
    expect(iso(r.prevFrom)).toBe("2026-08-17"); // lunes anterior
    expect(iso(r.prevTo)).toBe("2026-08-17"); // mismos días transcurridos (1)
    expect(r.comparisonLabel).toBe("vs período anterior equivalente");
  });

  it("preset 'Hoy': compara contra ayer", () => {
    const r = buildComparisonRanges(d("2026-08-24"), d("2026-08-24"), d("2026-08-24"));
    expect(iso(r.prevFrom)).toBe("2026-08-23");
    expect(iso(r.prevTo)).toBe("2026-08-23");
    expect(r.includesToday).toBe(true);
  });

  it("rango custom pasado: ventana equivalente inmediatamente anterior", () => {
    const r = buildComparisonRanges(d("2026-08-05"), d("2026-08-15"), d("2026-08-24"));
    expect(iso(r.effTo)).toBe("2026-08-15"); // sin clamp: el rango ya es pasado
    expect(iso(r.prevFrom)).toBe("2026-07-25"); // 11 días previos
    expect(iso(r.prevTo)).toBe("2026-08-04");
    expect(r.includesToday).toBe(false);
  });
});
