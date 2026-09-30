// «Moví correos y desaparecen, pero luego no aparecen en la dirección que los
// moví» (Jhon, 28/09). Mover tiene que decir ADÓNDE fue a parar cada correo,
// para que la caché lo traslade en vez de borrarlo.
// Correr: deno test --no-check supabase/functions/_shared/imap-mover.test.ts

import { ImapClient, expandirSetUid } from "./imap.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}
const igual = (a: unknown, b: unknown, msg: string) =>
  assert(JSON.stringify(a) === JSON.stringify(b), `${msg}: ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);

/** Un cliente sin socket: cada comando contesta lo que diga `respuestas`. */
function clienteFalso(respuestas: (cmd: string) => { ok: boolean; raw: string; completion?: string }) {
  const enviados: string[] = [];
  const c = Object.create(ImapClient.prototype) as ImapClient;
  (c as unknown as { command: (raw: string) => Promise<unknown> }).command = (raw: string) => {
    enviados.push(raw);
    const r = respuestas(raw);
    return Promise.resolve({ ok: r.ok, lines: [], completion: r.completion ?? "", raw: r.raw, error: r.ok ? undefined : "NO" });
  };
  return { c, enviados };
}

Deno.test("MOVE con COPYUID: cada uid de origen queda atado a su uid de destino", async () => {
  const { c } = clienteFalso(() => ({ ok: true, raw: "* OK [COPYUID 77 3:4,9 20:22] Moved\r\n* 3 EXPUNGE\r\nA1 OK MOVE done\r\n" }));
  const r = await c.moveUidsConDestino([3, 4, 9], "Archive");
  assert(r.ok, "tenía que salir bien");
  igual(r.uidvalidity, 77, "uidvalidity");
  igual([...r.mapa.entries()], [[3, 20], [4, 21], [9, 22]], "mapa");
});

Deno.test("MOVE sin COPYUID: sale bien pero sin mapa (quien llama lo busca)", async () => {
  const { c } = clienteFalso(() => ({ ok: true, raw: "A1 OK MOVE done\r\n" }));
  const r = await c.moveUidsConDestino([3], "Archive");
  assert(r.ok, "tenía que salir bien");
  igual(r.mapa.size, 0, "sin mapa");
  igual(r.uidvalidity, undefined, "sin uidvalidity");
});

Deno.test("si el servidor no tiene MOVE: COPY (con su COPYUID) + borrar", async () => {
  const { c, enviados } = clienteFalso((cmd) =>
    cmd.startsWith("UID MOVE") ? { ok: false, raw: "A1 BAD unknown\r\n" }
      : cmd.startsWith("UID COPY") ? { ok: true, raw: "A2 OK [COPYUID 5 8 40] Copied\r\n" }
      : { ok: true, raw: "OK\r\n" });
  const r = await c.moveUidsConDestino([8], "Archive");
  assert(r.ok, "tenía que salir bien");
  igual([...r.mapa.entries()], [[8, 40]], "mapa desde el COPY");
  igual(enviados.map((e) => e.split(" ").slice(0, 2).join(" ")), ["UID MOVE", "UID COPY", "UID STORE", "UID EXPUNGE"], "comandos");
});

Deno.test("un COPYUID con sets de distinto largo NO se usa: atar mal es peor que no atar", async () => {
  const { c } = clienteFalso(() => ({ ok: true, raw: "* OK [COPYUID 7 3:5 20:21]\r\n" }));
  const r = await c.moveUidsConDestino([3, 4, 5], "Archive");
  assert(r.ok, "el movimiento salió bien igual");
  igual(r.mapa.size, 0, "sin mapa");
});

Deno.test("⚠️ un Message-ID con comillas o saltos de línea no llega al servidor", async () => {
  const { c, enviados } = clienteFalso(() => ({ ok: true, raw: "* SEARCH 5\r\n" }));
  igual(await c.uidPorMessageId('<a"b@x> OR ALL'), null, "comillas");
  igual(await c.uidPorMessageId("<a@x>\r\nA9 DELETE INBOX"), null, "salto de línea");
  igual(enviados.length, 0, "no se mandó nada");
  igual(await c.uidPorMessageId("<bien@x>"), 5, "uno normal sí");
  igual(enviados, ['UID SEARCH HEADER Message-ID "<bien@x>"'], "el comando");
});

Deno.test("con dos copias en la carpeta, el uid más nuevo es el recién movido", async () => {
  const { c } = clienteFalso(() => ({ ok: true, raw: "* SEARCH 12 40\r\n" }));
  igual(await c.uidPorMessageId("<x@y>"), 40, "el más nuevo");
});

Deno.test("expandirSetUid", () => {
  igual(expandirSetUid("3:5,9"), [3, 4, 5, 9], "rango y suelto");
  igual(expandirSetUid("5:3"), [3, 4, 5], "rango al revés");
  igual(expandirSetUid("1:999999999"), [], "rango absurdo");
  igual(expandirSetUid("a"), [], "basura");
});
