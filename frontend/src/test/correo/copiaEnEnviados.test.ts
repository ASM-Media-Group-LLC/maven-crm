import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { tamanoDeBase64 } from "../../../../supabase/functions/_shared/base64";

// 17/09/2026: Jhon mandó un correo y al abrirlo en Enviados decía "(sin
// contenido)", aunque en la lista se veía el resumen. La fila de Enviados la
// sembramos NOSOTROS después del APPEND para que el correo aparezca al
// instante —el barrido completo tarda hasta 30 min y Enviados no está en
// HOT_FOLDERS—, pero esa siembra escribía asunto, fecha y `snippet` y se
// salteaba el cuerpo. En la base: len_html 0, len_text 0, snippet "TEst".

const leer = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

describe("tamanoDeBase64", () => {
  it("devuelve los bytes DECODIFICADOS, no el largo del base64", () => {
    // "hola" → aG9sYQ== : 4 bytes reales, 8 caracteres de base64.
    expect(tamanoDeBase64("aG9sYQ==")).toBe(4);
  });

  it("descuenta el relleno", () => {
    expect(tamanoDeBase64("YQ==")).toBe(1);   // "a"
    expect(tamanoDeBase64("YWI=")).toBe(2);   // "ab"
    expect(tamanoDeBase64("YWJj")).toBe(3);   // "abc"
  });

  it("ignora los saltos de línea que el MIME mete cada 76 caracteres", () => {
    const partido = "YWJj\r\nYWJj\r\n";
    expect(tamanoDeBase64(partido)).toBe(6);
  });

  it("⚠️ NO confunde el tamaño inflado con el real", () => {
    // 1 MB de archivo son ~1,37 MB de base64. Guardar el inflado rompería el
    // desempate por tamaño al buscar la parte del adjunto.
    const unMega = "A".repeat(1_398_104); // ≈ 1 MB decodificado
    const bytes = tamanoDeBase64(unMega);
    expect(bytes).toBeGreaterThan(1_000_000);
    expect(bytes).toBeLessThan(1_100_000);
    expect(bytes).toBeLessThan(unMega.length);
  });

  it("no se rompe con vacío", () => {
    expect(tamanoDeBase64("")).toBe(0);
  });
});

describe("la copia sembrada en Enviados trae el correo entero", () => {
  const edge = leer("supabase/functions/mail-fetch/index.ts");

  /** El bloque del upsert que siembra la copia, acotado por sus dos extremos. */
  const siembra = (() => {
    const a = edge.indexOf('await admin.from("mail_messages").upsert({');
    const b = edge.indexOf('onConflict: "user_id,folder,uidvalidity,uid"', a);
    expect(a, "no está la siembra de Enviados").toBeGreaterThan(-1);
    expect(b, "no está el cierre del upsert").toBeGreaterThan(a);
    return edge.slice(a, b);
  })();

  it("⚠️ escribe el CUERPO, que es lo que faltaba", () => {
    expect(siembra).toMatch(/\bhtml:/);
    expect(siembra).toMatch(/\btext_body:/);
  });

  it("guarda el html SANEADO y no el crudo", () => {
    // El crudo dejaría pasar imágenes remotas que el resto del Correo bloquea.
    expect(siembra).toMatch(/html:\s*limpio\?\.html/);
    expect(siembra).toMatch(/remote_images:/);
  });

  it("también el Cc y los adjuntos", () => {
    expect(siembra).toMatch(/\bcc_addr:/);
    expect(siembra).toMatch(/\battachments:/);
  });

  it("los adjuntos van con la MISMA forma que escribe el sync", () => {
    // {filename, contentType, sizeBytes, contentId}: el visor busca la parte
    // por nombre y usa el tamaño para desempatar. Otra forma = descarga rota.
    for (const campo of ["filename", "contentType", "sizeBytes", "contentId"]) {
      expect(siembra, `falta ${campo} en los adjuntos sembrados`).toMatch(
        new RegExp(`\\b${campo}:`),
      );
    }
  });

  it("el tamaño del adjunto es el decodificado", () => {
    expect(siembra).toMatch(/sizeBytes:\s*tamanoDeBase64\(/);
    // Guardar `.length` del base64 sería el bug que el helper evita.
    expect(siembra).not.toMatch(/sizeBytes:\s*\w+\.contentBase64\.length/);
  });
});
