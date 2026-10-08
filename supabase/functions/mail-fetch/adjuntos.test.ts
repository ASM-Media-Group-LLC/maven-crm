// La revisión de adjuntos que comparten enviar y guardar el borrador.
// Correr: deno test --no-check supabase/functions/mail-fetch/adjuntos.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { revisarAdjuntos, TOPE_ADJUNTOS_BYTES } from "./adjuntos.ts";

const pdf = { filename: "cotizacion.pdf", contentType: "application/pdf", contentBase64: "JVBERi0xLjQK" };

Deno.test("sin adjuntos (o con basura en vez de lista): lista vacía, no error", () => {
  assertEquals(revisarAdjuntos(undefined), { ok: true, adjuntos: [] });
  assertEquals(revisarAdjuntos("hola"), { ok: true, adjuntos: [] });
});

Deno.test("un archivo y una imagen pegada pasan tal cual", () => {
  const img = { filename: "imagen-1.png", contentType: "image/png", contentBase64: "iVBORw0K", contentId: "img1.ab12cd34@maven-ai.me" };
  assertEquals(revisarAdjuntos([pdf, img]), { ok: true, adjuntos: [pdf, img] });
});

Deno.test("a un adjunto le falta el contenido: 400", () => {
  const r = revisarAdjuntos([{ filename: "x.pdf", contentType: "application/pdf" }]);
  assertEquals(r.ok ? 0 : r.status, 400);
});

Deno.test("un contentId con salto de línea no llega a la cabecera: 400", () => {
  const r = revisarAdjuntos([{ ...pdf, contentId: "a@b\r\nBcc: x@y.com" }]);
  assertEquals(r.ok ? 0 : r.status, 400);
});

Deno.test("pasarse de 20 MB de archivo: 413", () => {
  // 4 caracteres de base64 = 3 bytes.
  const grande = "A".repeat(Math.ceil((TOPE_ADJUNTOS_BYTES + 3) / 3) * 4);
  const r = revisarAdjuntos([{ ...pdf, contentBase64: grande }]);
  assertEquals(r.ok ? 0 : r.status, 413);
});

Deno.test("justo 20 MB todavía entra", () => {
  const justo = "A".repeat(Math.floor((TOPE_ADJUNTOS_BYTES * 4) / 3));
  assertEquals(revisarAdjuntos([{ ...pdf, contentBase64: justo }]).ok, true);
});
