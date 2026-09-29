// Maven y el NAS tienen que firmar IGUAL: si no, no pasa ningún archivo.
// El vector de abajo lo generó infra/nas-drive/firma.mjs (Node) el 28/09; el
// test de Node (infra/nas-drive/test.mjs) verifica el mismo vector al revés.
// Correr: deno test --no-check supabase/functions/_shared/drive-firma.test.ts

import { firmar, verificar } from "./drive-firma.ts";

function assert(c: boolean, m: string) { if (!c) throw new Error(m); }

export const VECTOR = {
  secreto: "vector-de-prueba-del-drive-0123456789abcdef",
  permiso: "eyJvcCI6InJlY2libyIsImsiOiIxMTExMTExMS0xMTExLTExMTEtMTExMS0xMTExMTExMTExMTEvMjIyMjIyMjItMjIyMi0yMjIyLTIyMjItMjIyMjIyMjIyMjIyIiwic2l6ZSI6MTIzLCJzaGEyNTYiOiJhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhIiwiZSI6NDEwMjQ0NDgwMH0.JrSS4luiQ5EE77inIqYUPq4zRgTwqFbGchDWLUXW3-0",
};

Deno.test("un recibo firmado por el NAS (Node) se verifica en Maven (Deno)", async () => {
  const d = await verificar(VECTOR.secreto, VECTOR.permiso);
  assert(!!d, "no verificó");
  assert(d!.op === "recibo" && d!.size === 123, "datos distintos");
});

Deno.test("y lo que firma Maven sale IGUAL que en el NAS", async () => {
  const datos = JSON.parse(new TextDecoder().decode(
    Uint8Array.from(atob(VECTOR.permiso.split(".")[0].replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0)),
  ));
  assert(await firmar(VECTOR.secreto, datos) === VECTOR.permiso, "la firma de Deno no coincide con la de Node");
});

Deno.test("otro secreto, datos cambiados o vencido: nada", async () => {
  assert(await verificar("otro-secreto-de-mas-de-treinta-y-dos-cars", VECTOR.permiso) === null, "otro secreto");
  const [c, f] = VECTOR.permiso.split(".");
  assert(await verificar(VECTOR.secreto, `${c.slice(0, -2)}xx.${f}`) === null, "datos cambiados");
  const vencido = await firmar(VECTOR.secreto, { op: "get", k: "x", e: 1 });
  assert(await verificar(VECTOR.secreto, vencido) === null, "vencido");
  assert(await verificar(VECTOR.secreto, `${VECTOR.permiso}.extra`) === null, "tres partes");
});
