import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// «Mover a» estaba dibujado y marcado "pronto": un botón gris que se ve, se
// toca y no hace nada. Al conectarlo apareció el riesgo de verdad: el nombre
// de la carpeta destino termina DENTRO de un comando IMAP.

const leer = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const edge = leer("supabase/functions/mail-fetch/index.ts");
const imap = leer("supabase/functions/_shared/imap.ts");

function entre(texto: string, desde: string, hasta: string): string {
  const a = texto.indexOf(desde);
  const b = texto.indexOf(hasta, a + 1);
  expect(a, `no está la marca «${desde}»`).toBeGreaterThan(-1);
  expect(b, `no está la marca «${hasta}»`).toBeGreaterThan(a);
  return texto.slice(a, b);
}

describe("⚠️ el destino no puede inyectar comandos IMAP", () => {
  it("la edge lo valida contra las carpetas REALES de la cuenta", () => {
    // No basta con escapar: si el nombre no existe, no se mueve nada. Eso
    // cierra la inyección y además evita mover a una carpeta con un typo.
    const bloque = entre(edge, 'if (op === "move")', "const sel = await client.selectFolder");
    expect(bloque).toMatch(/await client\.listFolders\(\)/);
    expect(bloque).toMatch(/carpetas\.folders\.find\(\(f\) => f === pedido\)/);
  });

  it("no usa el nombre que llega del cliente tal cual", () => {
    const bloque = entre(edge, 'if (op === "move")', "const sel = await client.selectFolder");
    expect(bloque).not.toMatch(/moveUids\([^)]*pedido/);
  });

  it("⚠️ el segundo cerrojo: moveUids rechaza CR, LF y NUL", () => {
    // Escapar comillas NO alcanza: un salto de línea cierra la línea del
    // comando y lo que siga se ejecuta como un comando IMAP propio.
    // El cerrojo vive en moveUidsConDestino (moveUids la llama), antes de
    // armar el comando.
    const fn = entre(imap, "async moveUidsConDestino(", "const d = `");
    expect(fn).toMatch(/\[\\r\\n\\x00\]/);
    expect(fn).toMatch(/return \{ ok: false/);
    expect(entre(imap, "async moveUids(", "async moveUidsConDestino(")).toMatch(/this\.moveUidsConDestino\(/);
  });

  it("«move» está en la lista de operaciones permitidas", () => {
    expect(edge).toMatch(/const ops = new Set\(\[[^\]]*"move"/);
  });
});

describe("la UI de Mover a", () => {
  const pagina = leer("frontend/src/pages/correo/CorreoPage.tsx");

  it("ya no queda ningún «Mover a» gris", () => {
    expect(pagina).not.toMatch(/etiqueta="Mover a" pronto/);
  });

  it("ofrece las carpetas de la cuenta, no una lista escrita a mano", () => {
    expect(pagina).toMatch(/\(carpetas\.data \?\? \[\]\)/);
  });

  it("no ofrece mover a la carpeta en la que ya estás (la de la lista, o la del correo abierto)", () => {
    expect(pagina).toMatch(/\.filter\(\(f\) => f !== actual\)/);
    expect(pagina).toMatch(/carpetasParaMover\(carpeta\)/);
    expect(pagina).toMatch(/carpetasParaMover\(sel\.folder \?\? carpeta\)/);
  });
});

describe("⚠️ lo movido se TRASLADA en la caché, no se borra (Jhon, 28/09)", () => {
  // «Moví correos y desaparecen, pero luego no aparecen en la dirección que
  // los moví»: la fila se borraba y el correo volvía recién con el barrido
  // (30 min en las carpetas frías). Una etiqueta puesta con «Mover a»
  // quedaba vacía mientras tanto.
  it("el bulk traslada ANTES de borrar lo que no pudo ubicar", () => {
    const i = edge.indexOf("const ubicacion = await trasladarEnCache(");
    const j = edge.indexOf('await admin.from("mail_messages").delete()\n            .eq("user_id", user.id).eq("folder", box).in("uid", lista);');
    expect(i, "no está el traslado").toBeGreaterThan(-1);
    expect(j, "no está el borrado de lo no ubicado").toBeGreaterThan(i);
  });

  it("la fila queda con la MISMA clave con la que la va a buscar el barrido", () => {
    // (user_id, folder, uidvalidity, uid): si faltara el uidvalidity, el
    // barrido insertaría otra fila y el correo saldría dos veces.
    expect(edge).toMatch(/\.update\(\{ folder: dest, uid, uidvalidity,/);
  });

  it("y la pantalla vuelve a leer la vista de la etiqueta después de mover", () => {
    const hook = leer("frontend/src/hooks/useMailbox.ts");
    const bulk = entre(hook, "export function useMailBulk", "export function useMailRealtime");
    expect(bulk).toMatch(/invalidateQueries\(\{ queryKey: \["mail-por-etiqueta"\] \}\)/);
  });
});
