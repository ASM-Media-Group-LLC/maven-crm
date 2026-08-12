// Recurrencia de recordatorios: la serie de Grace murió porque nadie re-agendaba.
// Correr: deno test supabase/functions/_shared/whatsapp-recurrencia.test.ts
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { proximaOcurrencia } from "./whatsapp.ts";

// 10:20 Bogotá = 15:20 UTC. Todas las aserciones comprueban que la HORA LOCAL se
// conserva, que es lo que se rompe si alguien mete conversiones de más.
const bog = (iso: string) => new Date(iso);
const horaBog = (d: Date) => new Date(d.getTime() - 5 * 3600_000).toISOString().slice(11, 16);

Deno.test("weekdays — de viernes salta a lunes, no a sábado", () => {
  // viernes 2026-08-14 10:20 Bogotá
  const n = proximaOcurrencia(bog("2026-08-14T15:20:00Z"), "weekdays")!;
  assertEquals(n.toISOString().slice(0, 10), "2026-08-17"); // lunes
  assertEquals(horaBog(n), "10:20");
});

Deno.test("weekdays — de lunes a martes", () => {
  const n = proximaOcurrencia(bog("2026-08-17T15:20:00Z"), "weekdays")!;
  assertEquals(n.toISOString().slice(0, 10), "2026-08-18");
});

Deno.test("weekends — de sábado a domingo, y de domingo al sábado siguiente", () => {
  const sab = proximaOcurrencia(bog("2026-08-15T15:20:00Z"), "weekends")!;
  assertEquals(sab.toISOString().slice(0, 10), "2026-08-16"); // domingo
  const dom = proximaOcurrencia(bog("2026-08-16T15:20:00Z"), "weekends")!;
  assertEquals(dom.toISOString().slice(0, 10), "2026-08-22"); // sábado
});

Deno.test("daily y weekly", () => {
  assertEquals(proximaOcurrencia(bog("2026-08-14T15:20:00Z"), "daily")!.toISOString().slice(0, 10), "2026-08-15");
  assertEquals(proximaOcurrencia(bog("2026-08-14T15:20:00Z"), "weekly")!.toISOString().slice(0, 10), "2026-08-21");
});

Deno.test("la hora local se conserva incluso cerca de medianoche UTC", () => {
  // 20:30 Bogotá = 01:30 UTC del día siguiente. Sumar un día no debe correr la hora.
  const n = proximaOcurrencia(bog("2026-08-15T01:30:00Z"), "daily")!;
  assertEquals(horaBog(n), "20:30");
});

Deno.test("recurrencia desconocida o vacía devuelve null (serie que termina visible)", () => {
  assertEquals(proximaOcurrencia(bog("2026-08-14T15:20:00Z"), null), null);
  assertEquals(proximaOcurrencia(bog("2026-08-14T15:20:00Z"), "cada 3 horas"), null);
  assertEquals(proximaOcurrencia("no-es-fecha", "daily"), null);
});
