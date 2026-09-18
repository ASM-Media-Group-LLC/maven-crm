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
    const fn = entre(imap, "async moveUids(", "const d = `");
    expect(fn).toMatch(/\[\\r\\n\\x00\]/);
    expect(fn).toMatch(/return false/);
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

  it("no ofrece mover a la carpeta en la que ya estás", () => {
    expect(pagina).toMatch(/\.filter\(\(f\) => f !== carpeta\)/);
  });
});
