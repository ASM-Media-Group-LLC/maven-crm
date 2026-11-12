import { assertEquals } from "jsr:@std/assert@1";
import { clasificarCasillas, httpDeWs, miles, sinConfigurar, veredicto } from "./logica.ts";

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

Deno.test("las casillas de Zoho se cruzan con Maven sin inventar", () => {
  const ahora = Date.parse("2026-11-11T12:00:00Z");
  const { casillas, resumen } = clasificarCasillas(
    [
      { email: "Ana@maven-ai.me", nombre: "Ana" },
      { email: "beto@maven-ai.me" },
      { email: "carla@maven-ai.me" },
      { email: "corp@unlok.me" },
      { email: "ana@maven-ai.me" }, // repetida: cuenta una vez
      { email: "nunca@maven-ai.me" },
    ],
    [
      { email: "ana@maven-ai.me", viva: true, ultimaActividad: "2026-11-10T08:00:00Z" },
      { email: "beto@maven-ai.me", viva: true, ultimaActividad: "2026-10-01T08:00:00Z" },
      { email: "carla@maven-ai.me", viva: false, ultimaActividad: "2026-11-01T08:00:00Z" },
      { email: "nunca@maven-ai.me", viva: true, ultimaActividad: null },
    ],
    ahora,
  );
  assertEquals(resumen, { en_uso: 1, sin_uso: 2, de_alguien_que_salio: 1, sin_cuenta_en_maven: 1, total: 5 });
  // Lo que hay que mirar primero: la gente que salió, después lo sin uso.
  assertEquals(casillas.map((c) => c.estado), ["de_alguien_que_salio", "sin_uso", "sin_uso", "sin_cuenta_en_maven", "en_uso"]);
  assertEquals(casillas.find((c) => c.email === "ana@maven-ai.me")?.nombre, "Ana");
});

Deno.test("si una dirección es de una cuenta viva y de otra borrada, manda la viva", () => {
  const { resumen } = clasificarCasillas(
    [{ email: "x@maven-ai.me" }],
    [
      { email: "x@maven-ai.me", viva: false },
      { email: "x@maven-ai.me", viva: true, ultimaActividad: "2026-11-11T00:00:00Z" },
    ],
    Date.parse("2026-11-11T12:00:00Z"),
  );
  assertEquals(resumen.en_uso, 1);
});
