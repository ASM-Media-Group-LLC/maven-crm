// Costos por parte de Maven (Alvaro, 13/11/2026): cada pieza con su cuenta,
// hoy / en el mes / al cierre, lo compartido junto en «Base de Maven», lo que no
// es Maven aparte y un dato que falta nunca se vuelve 0.
import { describe, it, expect } from "vitest";
import { calcularCostosPorParte, parteDe, pesoDePartes, proyectar, type ServicioConParte, type UsoDelMes } from "@/lib/costosPorParte";
import type { Cobro } from "@/lib/costos";

const servicio = (id: string, extra: Partial<ServicioConParte> = {}): ServicioConParte => ({
  id, nombre: id, categoria: "otras", proveedor: id, es_maven: true, monto_usd: null, ciclo: "mensual", fuente: "factura",
  detalle: null, proximo_cobro: null, proximo_monto_usd: null, proximo_detalle: null, ahorro_usd: null, ahorro_detalle: null,
  orden: 10, activo: true, revisado_at: "", ...extra,
});

const SERVICIOS: ServicioConParte[] = [
  servicio("google_ia", { parte: "argos", ciclo: "uso", monto_usd: 48, precio_unitario_usd: "0.0026", unidad: "foto_juzgada" }),
  servicio("elevenlabs", { parte: "argos", ciclo: "uso", monto_usd: 0.03 }),
  servicio("supabase_maven", { parte: "base", monto_usd: 111.88 }),
  servicio("contabo_principal", { parte: "base", monto_usd: null, fuente: "falta" }),
  servicio("godaddy_maven", { parte: "base", monto_usd: 29.99, ciclo: "anual" }),
  servicio("contabo_llamadas", { parte: "cowork", monto_usd: 26.85 }),
  servicio("resend", { parte: "correo", monto_usd: 0.54, ciclo: "uso" }),
  servicio("zoho", { parte: "correo", monto_usd: null, fuente: "falta" }),
  servicio("github", { parte: "herramientas", monto_usd: 0 }),
  servicio("claude", { parte: "herramientas", monto_usd: 200, activo: false }),
  servicio("supabase_otros", { parte: "otras", es_maven: false, monto_usd: 185 }),
];

const dia = (d: string, juzgadas: number, extra: Partial<UsoDelMes["dias"][number]> = {}) =>
  ({ dia: d, pantalla: 100, camara: 100, juzgadas, al_nas: 0, videos: 0, video_seg: 0, ...extra });
const USO: UsoDelMes = {
  desde: "2026-11-01", hoy: "2026-11-10", dias_del_mes: 30, calculado_at: "2026-11-10T20:00:00Z",
  dias: [
    ...Array.from({ length: 9 }, (_, i) => dia(`2026-11-0${i + 1}`, 1000)),
    dia("2026-11-10", 500, { pantalla: 300, camara: 200, videos: 4, video_seg: 600 }),
  ],
  almacenamiento: [
    { bucket: "chat-files", gb: 50, archivos: 100 },
    { bucket: "monitor-capturas", gb: 7.25, archivos: 1000 },
    { bucket: "argos-clips", gb: 2.15, archivos: 20 },
  ],
};
const COBROS: Cobro[] = [
  { servicio_id: "google_ia", fecha: "2026-11-08", monto_usd: 17.44, fuente: "factura", nota: null },
  { servicio_id: "supabase_maven", fecha: "2026-11-14", monto_usd: 82.7, fuente: "factura", nota: null },
  { servicio_id: "supabase_maven", fecha: "2026-10-13", monto_usd: 15.28, fuente: "factura", nota: null },
  { servicio_id: "contabo_llamadas", fecha: "2026-10-15", monto_usd: 26.85, fuente: "factura", nota: null },
  { servicio_id: "supabase_otros", fecha: "2026-10-14", monto_usd: 185, fuente: "factura", nota: null },
  { servicio_id: "claude", fecha: "2026-10-17", monto_usd: 200, fuente: "factura", nota: null },
];

describe("costos por parte de Maven", () => {
  const r = calcularCostosPorParte(SERVICIOS, COBROS, USO, "2026-11-10");
  const parte = (p: string) => r.partes.find((x) => x.parte === p)!;

  it("la IA de Google: fotos juzgadas × precio, hoy, en el mes y al cierre al ritmo de hoy", () => {
    const ia = parte("argos").piezas.find((p) => p.clave === "ia")!;
    expect(ia.datos.juzgadasHoy).toBe(500);
    expect(ia.datos.juzgadasMes).toBe(9500);
    expect(ia.hoy).toBe(1.3);
    expect(ia.mes).toBe(24.7);
    // 24,70 ÷ 10 días × 30 días
    expect(ia.cierre).toBe(74.1);
    // Se cuadra con la factura del mes que ya llegó (la de mañana no cuenta).
    expect(ia.facturado).toBe(17.44);
  });

  it("Argos trae sus seis piezas en orden; las fotos y los videos dentro del plan no cuestan", () => {
    const claves = parte("argos").piezas.map((p) => p.clave);
    expect(claves).toEqual(["ia", "fotos", "videos", "servicio", "push", "velocidad"]);
    const fotos = parte("argos").piezas.find((p) => p.clave === "fotos")!;
    expect(fotos.gratis).toBe(true);
    expect(fotos.datos.fotosHoy).toBe(500);
    expect(fotos.datos.gb).toBe(7.25);
    expect(fotos.datos.totalGb).toBe(59.4);
    const videos = parte("argos").piezas.find((p) => p.clave === "videos")!;
    expect(videos.datos.videosHoy).toBe(4);
    expect(videos.datos.minutosMes).toBe(10);
  });

  it("si Maven se pasa de los GB del plan, cada bucket paga su parte de lo de más", () => {
    const lleno = { ...USO, almacenamiento: [{ bucket: "monitor-capturas", gb: 60, archivos: 1 }, { bucket: "chat-files", gb: 60, archivos: 1 }] };
    const fotos = calcularCostosPorParte(SERVICIOS, [], lleno, "2026-11-10").partes[0].piezas.find((p) => p.clave === "fotos")!;
    // 20 GB de más × 0,021 = 0,42 al mes; la mitad es de las fotos.
    expect(fotos.gratis).toBe(false);
    expect(fotos.cierre).toBe(0.21);
  });

  it("lo fijo se prorratea: hoy es 1/30 del mes y en el mes va lo de los días que van", () => {
    const supa = parte("base").piezas.find((p) => p.servicio?.id === "supabase_maven")!;
    expect(supa.cierre).toBe(111.88);
    expect(supa.mes).toBe(37.29);
    expect(supa.hoy).toBeCloseTo(3.7293, 3);
    // El dominio anual: 29,99 ÷ 12.
    expect(parte("base").piezas.find((p) => p.servicio?.id === "godaddy_maven")!.cierre).toBe(2.5);
  });

  it("lo que falta se cuenta como falta, no como 0", () => {
    const base = parte("base");
    const contabo = base.piezas.find((p) => p.servicio?.id === "contabo_principal")!;
    expect(contabo.cierre).toBeNull();
    expect(base.faltan).toBe(1);
    expect(base.cierre).toBe(114.38);
    expect(parte("correo").faltan).toBe(1);
    expect(r.total.faltan).toBe(2);
  });

  it("lo que no es Maven va aparte y no suma; lo apagado no aparece", () => {
    expect(r.otras.cierre).toBe(185);
    expect(r.partes.flatMap((p) => p.piezas).some((p) => p.servicio?.id === "supabase_otros")).toBe(false);
    expect(r.partes.flatMap((p) => p.piezas).some((p) => p.servicio?.id === "claude")).toBe(false);
    // 74,10 + 0,03 + 111,88 + 2,50 + 26,85 + 0,54 + 0 = 215,90
    expect(r.total.cierre).toBe(215.9);
  });

  it("el mes pasado sale de las facturas de Maven (sin lo que no es Maven ni lo apagado)", () => {
    expect(r.mesPasado).toBe(42.13);
    expect(r.cuadradoAl).toBe("2026-11-08");
  });

  it("día por día: lo real hasta hoy y lo que falta al ritmo de hoy", () => {
    expect(r.serie).toHaveLength(30);
    expect(r.serie[0].uso).toBe(2.6);
    expect(r.serie[9].uso).toBe(1.3);
    expect(r.serie[9].futuro).toBe(false);
    expect(r.serie[10].futuro).toBe(true);
    expect(r.serie[10].uso).toBe(2.47);
    // Lo fijo del día: (215,90 − 74,10) ÷ 30
    expect(r.serie[0].fijo).toBe(4.73);
  });

  it("si el uso no se pudo leer, las piezas de uso quedan sin número (no en 0) y se marcan", () => {
    const sin = calcularCostosPorParte(SERVICIOS, COBROS, null, "2026-11-10");
    const argos = sin.partes.find((p) => p.parte === "argos")!;
    const ia = argos.piezas.find((p) => p.clave === "ia")!;
    expect(ia.cierre).toBeNull();
    expect(ia.sinUso).toBe(true);
    expect(argos.sinUso).toBe(3);
    expect(sin.total.sinUso).toBeGreaterThan(0);
    expect(sin.almacenTotalGb).toBeNull();
  });

  it("antes de la migración (sin columna parte) cada servicio cae en su parte igual", () => {
    expect(parteDe(servicio("contabo_llamadas"))).toBe("cowork");
    expect(parteDe(servicio("x", { es_maven: false }))).toBe("otras");
    expect(parteDe(servicio("google_ia", { parte: "nada" }))).toBe("argos");
  });

  it("la barra apilada suma 100 entre las partes con dato", () => {
    const pesos = pesoDePartes(r.partes);
    expect(Math.round(pesos.reduce((a, p) => a + p.pct, 0))).toBe(100);
    expect(pesos.find((p) => p.parte === "herramientas")).toBeUndefined();
  });

  it("proyectar no divide por cero", () => {
    expect(proyectar(10, 0, 30)).toBe(300);
  });
});
