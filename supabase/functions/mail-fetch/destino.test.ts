// Deshacer un movimiento necesita el uid NUEVO de cada correo en la carpeta de
// destino (los uid son por carpeta). Esto prueba lo que la edge le contesta a la
// pantalla para eso.
// Correr: deno test --no-check supabase/functions/mail-fetch/destino.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { destinoParaLaRespuesta } from "./destino.ts";

Deno.test("cada uid pedido con el que recibió en el destino, en el orden pedido", () => {
  const r = destinoParaLaRespuesta("Archive", 77, new Map([[9, 22], [3, 20], [4, 21]]), [3, 4, 9]);
  assertEquals(r, { folder: "Archive", uidvalidity: 77, mapa: [[3, 20], [4, 21], [9, 22]] });
});

Deno.test("sin mapa (el servidor no dijo COPYUID y no se encontró): vacío, no inventado", () => {
  const r = destinoParaLaRespuesta("Papelera", undefined, new Map(), [5, 6]);
  assertEquals(r, { folder: "Papelera", uidvalidity: null, mapa: [] });
});

Deno.test("los que no se ubicaron quedan afuera; los demás van", () => {
  const r = destinoParaLaRespuesta("Snoozed", 3, new Map([[5, 40]]), [5, 6]);
  assertEquals(r.mapa, [[5, 40]]);
});

Deno.test("⚠️ un uid que NO se pidió no sale (no se mueve lo que nadie tocó)", () => {
  const r = destinoParaLaRespuesta("Archive", 1, new Map([[5, 40], [99, 41]]), [5]);
  assertEquals(r.mapa, [[5, 40]]);
});

Deno.test("⚠️ dos de origen al MISMO uid de destino: respuesta rota, se descartan los dos", () => {
  const r = destinoParaLaRespuesta("Archive", 1, new Map([[5, 40], [6, 40], [7, 41]]), [5, 6, 7]);
  assertEquals(r.mapa, [[7, 41]]);
});

Deno.test("basura en el mapa o en los pedidos no pasa", () => {
  const mapa = new Map<number, number>([[5, 0], [6, -3], [7, 1.5], [8, 50]]);
  const r = destinoParaLaRespuesta("Archive", 0, mapa, [5, 6, 7, 8, 8]);
  assertEquals(r, { folder: "Archive", uidvalidity: null, mapa: [[8, 50]] });
});
