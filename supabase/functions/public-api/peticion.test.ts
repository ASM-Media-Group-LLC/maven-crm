// La IP y las cabeceras de límite, por COMPORTAMIENTO: con un Request de verdad y
// cabeceras falsificadas, no leyendo el texto del código (un test de texto seguía
// en verde aunque se leyera una cabecera que escribe el cliente).

import { assert, assertEquals } from "jsr:@std/assert";
import { cabecerasDeCupo, clientIp, ipAllowed } from "./peticion.ts";

const pedido = (h: Record<string, string>) => new Request("https://x/functions/v1/public-api/", { headers: h });
const FALSAS = {
  "x-forwarded-for": "1.2.3.4",
  "x-client-ip": "1.2.3.4",
  "true-client-ip": "1.2.3.4",
  "forwarded": "for=1.2.3.4",
};

Deno.test("IP: manda la que pone Cloudflare, aunque el cliente mande otras", () => {
  assertEquals(clientIp(pedido({ ...FALSAS, "x-real-ip": "5.6.7.8", "cf-connecting-ip": "9.9.9.9" })), "9.9.9.9");
});

Deno.test("IP: sin cf-connecting-ip, la del proxy; nunca una del cliente", () => {
  assertEquals(clientIp(pedido({ ...FALSAS, "x-real-ip": "5.6.7.8" })), "5.6.7.8");
  assertEquals(clientIp(pedido({ ...FALSAS })), null);
});

Deno.test("whitelist: sin IP conocida no entra; exacta y rango funcionan", () => {
  assertEquals(ipAllowed(null, ["1.2.3.4"]), false);
  // Con un rango que lo abarca todo tampoco: sin IP conocida, no entra.
  assertEquals(ipAllowed(null, ["0.0.0.0/0"]), false);
  assertEquals(ipAllowed(null, ["10.0.0.0/8", "1.2.3.4"]), false);
  assertEquals(ipAllowed("1.2.3.4", ["1.2.3.4"]), true);
  assertEquals(ipAllowed("1.2.3.5", ["1.2.3.4"]), false);
  assertEquals(ipAllowed("10.0.0.7", ["10.0.0.0/24"]), true);
  assertEquals(ipAllowed("10.0.1.7", ["10.0.0.0/24"]), false);
  assertEquals(ipAllowed("1.2.3.4", []), true, "sin whitelist no hay restricción");
  // Con cabeceras falsas y sin la del proxy, una llave con whitelist NO pasa.
  assertEquals(ipAllowed(clientIp(pedido(FALSAS)), ["1.2.3.4"]), false);
});

Deno.test("cupo por minuto: Retry-After ≤ 60 s y X-RateLimit-Reset es la próxima hora", () => {
  const ahora = Date.parse("2026-09-25T18:42:30Z");
  const c = cabecerasDeCupo({ permitido: false, limite: 1000, restantes: 940, reinicio: "2026-09-25T18:43:00+00:00", motivo: "minuto", limite_minuto: 60 }, ahora);
  assert(c.porMinuto);
  assertEquals(c.esperaSeg, 30);
  assertEquals(c.cabeceras["X-RateLimit-Reset"], String(Date.parse("2026-09-25T19:00:00Z") / 1000));
  assertEquals(c.cabeceras["X-RateLimit-Remaining"], "940");
});

Deno.test("cupo por hora: Reset y Retry-After apuntan a la hora siguiente", () => {
  const ahora = Date.parse("2026-09-25T18:42:30Z");
  const c = cabecerasDeCupo({ permitido: false, limite: 1000, restantes: 0, reinicio: "2026-09-25T19:00:00+00:00", motivo: "hora" }, ahora);
  assert(!c.porMinuto);
  assertEquals(c.esperaSeg, 17 * 60 + 30);
  assertEquals(c.cabeceras["X-RateLimit-Reset"], String(Date.parse("2026-09-25T19:00:00Z") / 1000));
});
