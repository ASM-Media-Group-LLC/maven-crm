// La tarjeta de Kash: el gasto del mes se arma con los días guardados.
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { diaBogota, juntarResumen } from "./logica.ts";

Deno.test("el día es el de Bogotá", () => {
  assertEquals(diaBogota(new Date("2026-12-01T03:00:00Z")), "2026-11-30");
});

Deno.test("guarda el gasto de hoy, suma el mes y olvida lo viejo", () => {
  const antes = { gasto_por_dia: { "2026-10-31": 9, "2026-11-18": 10, "2026-11-19": 11, "2026-09-30": 7 } };
  const r = juntarResumen(antes, { personas: 91, argos_gasto_hoy_usd: 12.5 }, new Date("2026-11-20T15:00:00Z"));
  assertEquals(r.gasto_por_dia, { "2026-10-31": 9, "2026-11-18": 10, "2026-11-19": 11, "2026-11-20": 12.5 });
  assertEquals(r.argos_gastado_mes_usd, 33.5);
  assertEquals(r.argos_gastado_mes_desde, "2026-11-18");
  assertEquals(r.personas, 91);
  // Durante el día, el mismo día se pisa (no se suma dos veces).
  const r2 = juntarResumen(r, { argos_gasto_hoy_usd: 13 }, new Date("2026-11-20T20:00:00Z"));
  assertEquals(r2.argos_gastado_mes_usd, 34);
  // Sin dato de hoy: no se inventa.
  assertEquals(juntarResumen(null, { argos_gasto_hoy_usd: null }, new Date("2026-11-20T15:00:00Z")).argos_gastado_mes_usd, 0);
});
