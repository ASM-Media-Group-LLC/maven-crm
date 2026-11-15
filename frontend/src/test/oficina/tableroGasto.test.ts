// EL TABLERO DE GASTO (Alvaro, 14/11/2026): «una cosa es cuánto he gastado
// ahorita, otra la proyección». Lo gastado = Argos (lo que cobró Google hasta la
// última lectura + lo que Maven cuenta foto por foto después) + la parte de los
// días que van de lo fijo. Lo que no tiene monto no suma (se lista como «falta»).
import { describe, it, expect } from "vitest";
import { argosPorDia, calcularTableroGasto, ultimaLectura } from "@/lib/tableroGasto";
import type { Cobro } from "@/lib/costos";
import type { ServicioConParte, UsoDelMes } from "@/lib/costosPorParte";

const servicio = (id: string, extra: Partial<ServicioConParte>): ServicioConParte => ({
  id, nombre: id, categoria: "servidores", proveedor: "P", es_maven: true, monto_usd: null, ciclo: "mensual", fuente: "factura",
  detalle: null, proximo_cobro: null, proximo_monto_usd: null, proximo_detalle: null, ahorro_usd: null, ahorro_detalle: null,
  orden: 10, activo: true, revisado_at: "", ...extra,
} as unknown as ServicioConParte);

const SERVICIOS: ServicioConParte[] = [
  servicio("google_ia", { parte: "argos", ciclo: "uso", precio_unitario_usd: 0.002, unidad: "foto_juzgada", monto_usd: 48 }),
  servicio("supabase_maven", { parte: "base", monto_usd: 120 }),
  servicio("godaddy_maven", { parte: "base", monto_usd: 30, ciclo: "anual", proximo_cobro: "2026-12-19" }),
  servicio("contabo_principal", { parte: "base", monto_usd: null, fuente: "falta" }),
  servicio("resend", { parte: "correo", monto_usd: 20, ahorro_usd: 20, ahorro_detalle: "Plan gratis" }),
  servicio("claude", { parte: "herramientas", monto_usd: 200, activo: false }),
  servicio("supabase_otros", { parte: "otras", es_maven: false, monto_usd: 200 }),
];

// 30 días; hoy 10: 1.000 fotos juzgadas por día del 1 al 9 y 500 hoy.
const USO: UsoDelMes = {
  desde: "2026-11-01", hoy: "2026-11-10", dias_del_mes: 30, calculado_at: "2026-11-10T15:00:00Z",
  dias: Array.from({ length: 10 }, (_, i) => ({
    dia: `2026-11-${String(i + 1).padStart(2, "0")}`, pantalla: 0, camara: 0, juzgadas: i === 9 ? 500 : 1000, al_nas: 0, videos: 0, video_seg: 0,
  })),
  almacenamiento: [],
};
const LECTURA: Cobro = { servicio_id: "google_ia", fecha: "2026-11-08", monto_usd: 24, fuente: "lectura", nota: "AI Studio" };

describe("la lectura de Google", () => {
  it("toma la última del mes hasta hoy, nunca una futura ni de otro mes", () => {
    const vieja: Cobro = { ...LECTURA, fecha: "2026-11-05", monto_usd: 10 };
    const futura: Cobro = { ...LECTURA, fecha: "2026-11-12", monto_usd: 99 };
    const otroMes: Cobro = { ...LECTURA, fecha: "2026-10-30", monto_usd: 77 };
    expect(ultimaLectura([vieja, LECTURA, futura, otroMes], "google_ia", "2026-11-10")?.monto).toBe(24);
    expect(ultimaLectura([], "google_ia", "2026-11-10")).toBeNull();
  });

  it("los días que cubre suman lo que dijo Google; después, fotos × precio", () => {
    const m = argosPorDia(USO, 0.002, { fecha: "2026-11-08", monto: 24, nota: null });
    const hasta8 = [...m.entries()].filter(([d]) => d <= "2026-11-08").reduce((a, [, v]) => a + v, 0);
    expect(hasta8).toBeCloseTo(24, 2);            // 8 días × 3,00 (en vez de 8 × 2,00)
    expect(m.get("2026-11-09")).toBe(2);          // 1.000 × 0,002
    expect(m.get("2026-11-10")).toBe(1);          // 500 × 0,002
  });
});

describe("el tablero", () => {
  const tb = calcularTableroGasto(SERVICIOS, [LECTURA], USO, "2026-11-10");

  it("gastado = Argos (24 + 2 + 1) + lo fijo de 10 de 30 días (120 + 20) ÷ 3", () => {
    expect(tb.argos?.gastado).toBe(27);
    expect(tb.argos?.despues).toBe(3);
    expect(tb.gastado).toBeCloseTo(27 + (120 + 20) / 3, 1);
    // Hoy: lo fijo de un día + lo de Argos de hoy.
    expect(tb.hoy).toBeCloseTo((120 + 20) / 30 + 1, 1);
  });

  it("la proyección: Argos al ritmo de lo que va + cada fijo su mes", () => {
    expect(tb.proyeccion).toBeCloseTo(27 / 10 * 30 + 120 + 20, 1);
  });

  it("lo del año va aparte, entero y con su fecha: no se reparte en el mes", () => {
    expect(tb.filas.map((f) => f.id)).not.toContain("godaddy_maven");
    expect(tb.aparte).toEqual([{ id: "godaddy_maven", nombre: "godaddy_maven", proveedor: "P", monto: 30, ciclo: "anual", proximo: "2026-12-19", esteMes: false }]);
    // Si el cobro cae en el mes de hoy, se marca «este mes» (sigue sin sumar al mes).
    const dic = calcularTableroGasto(SERVICIOS, [], { ...USO, hoy: "2026-12-05", desde: "2026-12-01", dias_del_mes: 31, dias: [] }, "2026-12-05");
    expect(dic.aparte[0].esteMes).toBe(true);
    expect(dic.filas.map((f) => f.id)).not.toContain("godaddy_maven");
  });

  it("lo que no es Maven, lo apagado y lo que no tiene monto no suman; lo sin monto va a «falta»", () => {
    const ids = tb.filas.map((f) => f.id);
    expect(ids).not.toContain("supabase_otros");
    expect(ids).not.toContain("claude");
    expect(ids).not.toContain("contabo_principal");
    expect(tb.falta.map((s) => s.id)).toEqual(["contabo_principal"]);
    expect(tb.ahorro).toEqual([{ id: "resend", nombre: "resend", ahorro: 20, detalle: "Plan gratis" }]);
  });

  it("el día a día: lo de Argos real hasta hoy y, después, al ritmo de lo que va", () => {
    expect(tb.serie).toHaveLength(30);
    expect(tb.serie[8].argos).toBe(2);
    expect(tb.serie[20].futuro).toBe(true);
    expect(tb.serie[20].argos).toBeCloseTo(2.7, 2);
  });

  it("si el uso no se pudo leer, Argos es null (se dice), no 0", () => {
    const sin = calcularTableroGasto(SERVICIOS, [LECTURA], null, "2026-11-10");
    expect(sin.sinUso).toBe(true);
    expect(sin.filas.find((f) => f.id === "google_ia")?.gastado).toBeNull();
  });
});
