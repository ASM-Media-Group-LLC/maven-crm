// La puerta de la función: X-Cron-Token contra CRON_INTERNAL_TOKEN.
// Correr: deno test --allow-read --no-lock supabase/functions/messenger-webhooks/token.test.ts

import { assert, assertEquals } from "jsr:@std/assert";
import { tokenValido } from "./token.ts";

const ESPERADO = "cron-7f3a9c1e5b2d4f60a8e1c3b5d7f9a2c4";

async function huella(s: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
}
/** Un token distinto cuya huella coincide con la esperada en el byte `i` (≈256 pruebas). */
async function gemelo(i: number): Promise<string> {
  const h = (await huella(ESPERADO))[i];
  for (let n = 0; ; n++) {
    const s = `otro-${n}`;
    if ((await huella(s))[i] === h) return s;
  }
}

Deno.test("tokenValido: solo el token exacto, y nunca sin token configurado", async () => {
  assertEquals(await tokenValido(ESPERADO, ESPERADO), true, "el bueno pasa");
  assertEquals(await tokenValido(ESPERADO + "x", ESPERADO), false);
  assertEquals(await tokenValido(ESPERADO.slice(0, -1), ESPERADO), false, "un prefijo no pasa");
  assertEquals(await tokenValido(ESPERADO.slice(0, 8) + "zzzzzzzz", ESPERADO), false, "mismos 8 primeros no pasa");
  assertEquals(await tokenValido("", ESPERADO), false);
  assertEquals(await tokenValido(null, ESPERADO), false, "sin encabezado");
  assertEquals(await tokenValido("", undefined), false, "sin CRON_INTERNAL_TOKEN no pasa nada, ni el vacío");
  assertEquals(await tokenValido("", ""), false, "un CRON_INTERNAL_TOKEN vacío tampoco");
  assertEquals(await tokenValido("undefined", undefined), false);
});

Deno.test("tokenValido: compara TODA la huella (no el primer ni el último byte)", async () => {
  const primero = await gemelo(0);
  const ultimo = await gemelo(31);
  assert(primero !== ESPERADO && ultimo !== ESPERADO);
  assertEquals(await tokenValido(primero, ESPERADO), false, "misma huella en el byte 0");
  assertEquals(await tokenValido(ultimo, ESPERADO), false, "misma huella en el byte 31");
});
