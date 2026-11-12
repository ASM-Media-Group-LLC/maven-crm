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
import { desgloseDelMes, esperadoEnMes, mesEnCurso, serieDelAno, sumarMeses, tablero, type Cobro } from "@/lib/costos";

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

describe("el desglose de un mes", () => {
  const sv = (p: Partial<ServicioCosto>): ServicioCosto => s({ fuente: "factura", ...p });
  const servicios = [
    sv({ id: "claude", categoria: "ia", monto_usd: 200, dia_cobro: 17 }),
    sv({ id: "resend", categoria: "correos", monto_usd: 20, dia_cobro: 8 }),
  ];
  const cobros: Cobro[] = [
    { servicio_id: "claude", fecha: "2026-10-17", monto_usd: 200, fuente: "factura", nota: "Plan Ultra" },
    { servicio_id: "resend", fecha: "2026-10-08", monto_usd: 20, fuente: "factura", nota: null },
    { servicio_id: "resend", fecha: "2026-11-08", monto_usd: 20, fuente: "factura", nota: null },
  ];
  it("un mes pasado: lo cobrado, con sus cobros", () => {
    const d = desgloseDelMes(servicios, cobros, "2026-11-11", "2026-10");
    expect(d.map((l) => [l.servicio.id, l.real, l.proyectado])).toEqual([["claude", 200, 0], ["resend", 20, 0]]);
    expect(d[0].cobros[0].nota).toBe("Plan Ultra");
  });
  it("este mes: lo cobrado y lo que falta", () => {
    const d = desgloseDelMes(servicios, cobros, "2026-11-11", "2026-11");
    expect(d.map((l) => [l.servicio.id, l.real, l.proyectado])).toEqual([["claude", 0, 200], ["resend", 20, 0]]);
  });
  it("un mes que viene: todo proyectado", () => {
    const d = desgloseDelMes(servicios, cobros, "2026-11-11", "2026-12");
    expect(d.map((l) => [l.servicio.id, l.real, l.proyectado])).toEqual([["claude", 0, 200], ["resend", 0, 20]]);
  });
});

// ── Cuentas atadas (Alvaro, 11/11: «no me dijiste cuántas cuentas había atadas») ──
import {
  contarCuentas, dondeBajarCostos, esLiberable, licenciasQueSobran, ordenarCuentas, type CuentaAtada,
} from "@/lib/costos";

describe("cuentas atadas y dónde bajar costos", () => {
  let n = 0;
  const cu = (p: Partial<CuentaAtada>): CuentaAtada => ({
    id: `c${++n}`, servicio_id: "zoho", tipo: "buzon", nombre: `cuenta ${n}`, detalle: null, estado: "en_uso",
    cantidad: 1, ahorro_usd_mes: null, fuente: "verificado", revisado: null, orden: 100, ...p,
  });
  // Lo que se verificó el 11/11/2026, en chico.
  const servicios = [
    s({ id: "zoho", nombre: "Zoho", monto_usd: null, fuente: "falta", orden: 70, ahorro_detalle: "Libera casillas" }),
    s({ id: "supabase_otros", nombre: "Supabase: otros", es_maven: false, monto_usd: 185, orden: 200, ahorro_usd: 78.48, ahorro_detalle: "Pausa 8" }),
    s({ id: "google_ia", nombre: "Google", monto_usd: 48, orden: 10, ahorro_usd: 70, ahorro_detalle: "Flash-Lite" }),
    s({ id: "elevenlabs", nombre: "ElevenLabs", monto_usd: 0.03, orden: 20 }),
    s({ id: "resend", nombre: "Resend", monto_usd: 0.54, orden: 60 }),
    s({ id: "viejo", nombre: "Apagado", activo: false, orden: 1 }),
  ];
  const cuentas: CuentaAtada[] = [
    cu({ servicio_id: "zoho", nombre: "52 casillas de gente activa", cantidad: 52 }),
    ...Array.from({ length: 13 }, () => cu({ servicio_id: "zoho", estado: "de_alguien_que_salio" })),
    ...Array.from({ length: 3 }, () => cu({ servicio_id: "zoho", estado: "sin_uso" })),
    cu({ servicio_id: "zoho", tipo: "puesto", estado: "no_se_puede_ver", fuente: "falta" }),
    ...Array.from({ length: 8 }, () => cu({ servicio_id: "supabase_otros", tipo: "proyecto", estado: "sin_uso", ahorro_usd_mes: "9.81" as unknown as number })),
    ...Array.from({ length: 13 }, () => cu({ servicio_id: "supabase_otros", tipo: "proyecto" })),
    cu({ servicio_id: "google_ia", tipo: "llave" }),
    cu({ servicio_id: "elevenlabs", tipo: "puesto", ahorro_usd_mes: 19.36 }),
    ...Array.from({ length: 4 }, () => cu({ servicio_id: "elevenlabs", tipo: "llave", estado: "sin_uso" })),
    cu({ servicio_id: "viejo", tipo: "llave", estado: "sin_uso", ahorro_usd_mes: 500 }),
  ];

  it("cuenta por estado, con la cantidad de cada renglón", () => {
    const k = contarCuentas(cuentas.filter((c) => c.servicio_id === "zoho"));
    expect(k).toMatchObject({ en_uso: 52, de_alguien_que_salio: 13, sin_uso: 3, no_se_puede_ver: 1, total: 69, liberables: 16 });
    // Sin precio no es «ahorro 0»: no se sabe.
    expect(k.conPrecio).toBe(false);
    expect(k.ahorro).toBe(0);
    // PostgREST manda numeric como texto.
    expect(contarCuentas(cuentas.filter((c) => c.servicio_id === "supabase_otros")).ahorro).toBe(78.48);
    expect(esLiberable({ estado: "no_se_puede_ver" })).toBe(false);
  });

  it("primero lo que se puede soltar, el ahorro más grande arriba; lo que se usa al final", () => {
    const orden = ordenarCuentas([
      cu({ nombre: "activa", estado: "en_uso" }),
      cu({ nombre: "no se ve", estado: "no_se_puede_ver" }),
      cu({ nombre: "salió", estado: "de_alguien_que_salio", orden: 10 }),
      cu({ nombre: "parado", estado: "sin_uso", ahorro_usd_mes: 9.81, orden: 50 }),
    ]);
    expect(orden.map((c) => c.nombre)).toEqual(["parado", "salió", "no se ve", "activa"]);
  });

  it("dónde bajar: las cuentas mandan sobre el ahorro del servicio y nada se cuenta dos veces", () => {
    const r = dondeBajarCostos(servicios, cuentas);
    expect(r.candidatos.map((c) => [c.servicio.id, c.ahorro])).toEqual([
      ["supabase_otros", 78.48], // de sus 8 proyectos parados, no el 78,48 del servicio sumado encima
      ["google_ia", 70],         // sin cuentas para soltar: manda el ahorro del servicio
      ["elevenlabs", 19.36],     // el plan; las 4 llaves sin uso no tienen precio
      ["zoho", null],            // 16 casillas para soltar, pero el precio no se ve
    ]);
    expect(r.total).toBe(167.84);
    expect(r.sinPrecio).toBe(1);
    expect(r.candidatos.find((c) => c.servicio.id === "zoho")?.conteo?.liberables).toBe(16);
    // Lo apagado no cuenta, aunque tenga cuentas con ahorro.
    expect(r.candidatos.some((c) => c.servicio.id === "viejo")).toBe(false);
  });

  it("sin cuentas ni ahorros no hay candidatos (y no se inventa nada)", () => {
    expect(dondeBajarCostos([s({ id: "x" })], [])).toEqual({ candidatos: [], total: 0, sinPrecio: 0 });
  });

  it("Zoho en vivo: cuántas licencias sobran hoy y si se sueltan las de gente que salió", () => {
    const resumen = { en_uso: 52, sin_uso: 3, de_alguien_que_salio: 13, sin_cuenta_en_maven: 1, total: 69 };
    expect(licenciasQueSobran({ licencias: { compradas: 70, usadas: 69 }, resumen })).toEqual({ libresHoy: 1, libresDespues: 17 });
    expect(licenciasQueSobran({ licencias: null, resumen })).toBeNull();
  });
});
