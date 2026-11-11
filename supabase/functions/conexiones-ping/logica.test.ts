import { assertEquals } from "jsr:@std/assert@1";
import { httpDeWs, miles, sinConfigurar, veredicto } from "./logica.ts";

Deno.test("el veredicto dice en palabras por qué falla", () => {
  assertEquals(veredicto("x", { status: 200, ms: 120 }, "bien").estado, "ok");
  assertEquals(veredicto("x", { status: 401, ms: 80 }, "bien").detalle, "Error 401: la llave no sirve (vencida o borrada)");
  assertEquals(veredicto("x", { status: 402, ms: 80 }, "bien").detalle, "Error 402: sin saldo o sin cupo");
  assertEquals(veredicto("x", { status: 503, ms: 80 }, "bien").detalle, "Error 503: el servicio está caído");
  assertEquals(veredicto("x", { status: null, ms: 6000, error: "timeout" }, "bien").detalle, "No responde: timeout");
  // LiveKit/gateways: cualquier respuesta por debajo de 500 es que está vivo.
  assertEquals(veredicto("x", { status: 404, ms: 50 }, "vivo", (s) => s < 500).estado, "ok");
});

Deno.test("sin llave no es caído: es sin configurar", () => {
  assertEquals(sinConfigurar("resend", "RESEND_API_KEY").estado, "sin_configurar");
});

Deno.test("ayudas", () => {
  assertEquals(httpDeWs("wss://lk.asmtech.ai"), "https://lk.asmtech.ai");
  assertEquals(miles(302761), "302.761");
  assertEquals(miles(138), "138");
});
