// Costos y conexiones, solo el dueño (lib/costos.ts, 11/11/2026).
import { describe, it, expect } from "vitest";
import {
  dondeAhorrar, hacePasMasDe, loQueViene, mensual, mesAnterior, num, peor, resumenCostos, semaforoDeChequeo, usd,
  type ServicioCosto,
} from "@/lib/costos";

const base: ServicioCosto = {
  id: "x", nombre: "X", categoria: "ia", proveedor: "P", es_maven: true, monto_usd: 10, ciclo: "mensual", fuente: "factura",
  detalle: null, proximo_cobro: null, proximo_monto_usd: null, proximo_detalle: null, ahorro_usd: null, ahorro_detalle: null,
  orden: 1, activo: true, revisado_at: "2026-11-11T00:00:00Z",
};
const s = (p: Partial<ServicioCosto>): ServicioCosto => ({ ...base, ...p });

describe("los montos", () => {
  it("lo anual se reparte en 12 y lo que falta no se inventa", () => {
    expect(mensual(s({ monto_usd: 29.99, ciclo: "anual" }))).toBe(2.5);
    expect(mensual(s({ monto_usd: null }))).toBeNull();
    // PostgREST manda numeric como texto
    expect(mensual(s({ monto_usd: "148.00" as unknown as number }))).toBe(148);
    expect(num("")).toBeNull();
  });
  it("el mes anterior cruza el año", () => {
    expect(mesAnterior("2026-11-11")).toBe("2026-10-01");
    expect(mesAnterior("2027-01-03")).toBe("2026-12-01");
  });
  it("el total es solo Maven; lo de otros proyectos va aparte", () => {
    const servicios = [
      s({ id: "a", monto_usd: 48, proximo_monto_usd: 95, ahorro_usd: 70, ahorro_detalle: "Flash-Lite" }),
      s({ id: "b", monto_usd: 29.99, ciclo: "anual" }),
      s({ id: "c", monto_usd: null, fuente: "falta" }),
      s({ id: "d", monto_usd: 185, es_maven: false, ahorro_usd: 18.54, ahorro_detalle: "BLU" }),
      s({ id: "e", monto_usd: 999, activo: false }),
    ];
    const r = resumenCostos(servicios, [{ mes: "2026-10-01", servicio_id: "a", monto_usd: 40 }, { mes: "2026-10-01", servicio_id: "d", monto_usd: 185 }], "2026-11-11");
    expect(r.total).toBe(50.5);
    expect(r.faltan).toBe(1);
    expect(r.proximo).toBe(97.5);
    expect(r.ahorro).toBe(88.54);
    expect(r.fuera).toBe(185);
    expect(r.mesPasado).toBe(40);
    expect(r.cambioPct).toBe(26);
  });
  it("sin foto del mes pasado no se inventa el cambio", () => {
    const r = resumenCostos([s({})], [], "2026-11-11");
    expect(r.mesPasado).toBeNull();
    expect(r.cambioPct).toBeNull();
  });
});

describe("lo que viene y dónde ahorrar", () => {
  const servicios = [
    s({ id: "g", proximo_cobro: "2027-01-01", proximo_monto_usd: 95 }),
    s({ id: "d", proximo_cobro: "2026-12-19", monto_usd: 29.99, ciclo: "anual" }),
    s({ id: "viejo", proximo_cobro: "2026-11-01" }),
    s({ id: "lejos", proximo_cobro: "2027-06-01" }),
    s({ id: "e", ahorro_usd: 16, ahorro_detalle: "Starter" }),
    s({ id: "f", ahorro_usd: 70, ahorro_detalle: "Flash-Lite" }),
  ];
  it("ordena los próximos cobros y marca los aumentos", () => {
    const v = loQueViene(servicios, "2026-11-11");
    expect(v.map((x) => x.servicio.id)).toEqual(["d", "g"]);
    expect(v[1].cambia).toBe(true);
    expect(v[1].monto).toBe(95);
    expect(v[0].monto).toBe(29.99);
  });
  it("el ahorro más grande primero", () => {
    expect(dondeAhorrar(servicios).map((x) => x.id)).toEqual(["f", "e"]);
  });
  it("los dólares se leen fácil", () => {
    expect(usd(48)).toBe("USD 48");
    expect(usd(2.5)).toBe("USD 2,50");
  });
});

describe("conexiones", () => {
  it("semáforos", () => {
    expect(semaforoDeChequeo({ estado: "ok" })).toBe("ok");
    expect(semaforoDeChequeo({ estado: "mal" })).toBe("mal");
    expect(semaforoDeChequeo({ estado: "sin_configurar" })).toBe("apagado");
    expect(peor(["ok", "atencion", "ok"])).toBe("atencion");
    expect(peor(["ok", "mal", "atencion"])).toBe("mal");
    expect(peor([])).toBe("ok");
  });
  it("hace cuánto", () => {
    const ahora = Date.parse("2026-11-11T12:00:00Z");
    expect(hacePasMasDe("2026-11-11T10:00:00Z", 1, ahora)).toBe(true);
    expect(hacePasMasDe("2026-11-11T11:30:00Z", 1, ahora)).toBe(false);
    expect(hacePasMasDe(null, 1, ahora)).toBe(true);
  });
});

// ── El tablero con los números reales del 11/11/2026 ──────────────────────
import { esperadoEnMes, mesEnCurso, serieDelAno, sumarMeses, tablero, type Cobro } from "@/lib/costos";

describe("tablero: este mes, el año y la proyección", () => {
  const sv = (p: Partial<ServicioCosto>): ServicioCosto => s({ fuente: "factura", ...p });
  const servicios = [
    sv({ id: "claude", categoria: "ia", monto_usd: 200, dia_cobro: 17 }),
    sv({ id: "google", categoria: "ia", monto_usd: 48, ciclo: "uso", proximo_cobro: "2027-01-01", proximo_monto_usd: 95 }),
    sv({ id: "eleven", categoria: "ia", monto_usd: 26.62, dia_cobro: 7 }),
    sv({ id: "supa", categoria: "servidores", monto_usd: 148, dia_cobro: 14 }),
    sv({ id: "contabo", categoria: "servidores", monto_usd: 26.85, dia_cobro: 15 }),
    sv({ id: "zoho", categoria: "correos", monto_usd: null, fuente: "falta" }),
    sv({ id: "resend", categoria: "correos", monto_usd: 20, dia_cobro: 8 }),
    sv({ id: "godaddy", categoria: "correos", monto_usd: 29.99, ciclo: "anual", proximo_cobro: "2026-12-19", dia_cobro: 19 }),
    sv({ id: "otros", categoria: "otras", monto_usd: 185, es_maven: false, dia_cobro: 14 }),
  ];
  const c = (servicio_id: string, fecha: string, monto_usd: number): Cobro => ({ servicio_id, fecha, monto_usd, fuente: "factura", nota: null });
  const cobros: Cobro[] = [
    c("claude", "2026-10-17", 200), c("claude", "2026-11-06", 25), c("claude", "2026-11-06", 20), c("claude", "2026-11-07", 10),
    c("resend", "2026-10-08", 20), c("resend", "2026-11-08", 20),
    c("google", "2026-10-31", 1.03), c("google", "2026-11-11", 17.44),
    c("eleven", "2026-11-07", 26.62),
    c("supa", "2026-10-13", 48.59), c("supa", "2026-11-14", 122),
    c("contabo", "2026-10-15", 26.85),
    c("otros", "2026-11-01", 999),
  ];
  const hoy = "2026-11-11";

  it("este mes: lo cobrado hasta hoy, y el cierre suma lo fijo que falta y el uso al ritmo del mes", () => {
    const m = mesEnCurso(servicios, cobros, hoy);
    // El uso extra de Claude (6–7 nov) no tapa su cobro fijo del 17.
    expect(m.get("claude")).toEqual({ gastado: 55, proyectado: 255 });
    // Supabase del 14 ya está anunciado: cuenta en el cierre, no en lo gastado.
    expect(m.get("supa")).toEqual({ gastado: 0, proyectado: 122 });
    expect(m.get("contabo")).toEqual({ gastado: 0, proyectado: 26.85 });
    expect(m.get("google")?.proyectado).toBe(47.56);
    expect(m.has("otros")).toBe(false);
  });

  it("los cuatro números de arriba", () => {
    const t = tablero(servicios, cobros, hoy);
    expect(t.gastadoMes).toBe(119.06);
    expect(t.cierreMes).toBe(498.03);
    expect(t.gastadoAno).toBe(119.06 + 200 + 20 + 1.03 + 48.59 + 26.85);
    // Diciembre: todo lo fijo + Google a USD 48 + el dominio.
    expect(servicios.reduce((a, x) => a + esperadoEnMes(x, "2026-12"), 0)).toBeCloseTo(499.46, 2);
    expect(t.cierreAno).toBeCloseTo(296.47 + 498.03 + 499.46, 2);
    // Desde enero Google sube a 95: once meses de 516,47 + diciembre.
    expect(t.proximos12).toBeCloseTo(499.46 + 11 * 516.47, 2);
    expect(t.porServicio[0].servicio.id).toBe("claude");
  });

  it("la serie del año: lo pasado real, este mes partido, lo que viene proyectado", () => {
    const serie = serieDelAno(servicios, cobros, hoy);
    expect(serie).toHaveLength(12);
    expect(serie[9].real.ia).toBe(201.03);
    expect(serie[9].proyectado.ia).toBe(0);
    expect(serie[10].real.ia).toBe(119.06 - 20);
    expect(serie[10].proyectado.servidores).toBe(148.85);
    expect(serie[11].proyectado.correos).toBe(49.99);
    expect(sumarMeses("2026-11", 2)).toBe("2027-01");
  });
});
