// La fila que se siembra al guardar un borrador o mandar un correo.
// Correr: deno test --no-check supabase/functions/mail-fetch/sembrar.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { filaSembrada } from "./sembrar.ts";

const base = {
  userId: "u1",
  folder: "Borrador",
  uidvalidity: 7,
  uid: 41,
  fromAddress: "keila@maven-ai.me",
  nombre: "Keila",
  to: ["ana@x.com", "beto@y.com"],
  cc: [],
  subject: "Cotización",
  text: "Hola,\n\nte mando la cotización.",
  html: "<p>Hola,</p><p>te mando la cotización.</p>",
  limpio: { html: "<p>Hola,</p><p>te mando la cotización.</p>", remoteImages: 0 },
  adjuntos: [
    { filename: "cotizacion.pdf", contentType: "application/pdf", contentBase64: "JVBERi0xLjQK" },
    { filename: "imagen-1.png", contentType: "image/png", contentBase64: "iVBORw0K", contentId: "img1.ab@maven-ai.me" },
  ],
  rfc822: "From: x\r\nMessage-ID: <abc@maven-ai.me>\r\nSubject: y\r\n\r\ncuerpo",
  inReplyTo: null,
  references: null,
};

Deno.test("el borrador queda en la caché con sus adjuntos y el Content-ID de la imagen pegada", () => {
  const f = filaSembrada(base);
  assertEquals(f.folder, "Borrador");
  assertEquals(f.uid, 41);
  assertEquals(f.attachments, [
    { filename: "cotizacion.pdf", contentType: "application/pdf", sizeBytes: 9, contentId: null },
    { filename: "imagen-1.png", contentType: "image/png", sizeBytes: 6, contentId: "img1.ab@maven-ai.me" },
  ]);
  assertEquals(f.unread, false);
});

Deno.test("remitente con nombre, destinatarios en una línea, Message-ID del mensaje armado", () => {
  const f = filaSembrada(base);
  assertEquals(f.from_addr, '"Keila" <keila@maven-ai.me>');
  assertEquals(f.to_addr, "ana@x.com, beto@y.com");
  assertEquals(f.message_id, "<abc@maven-ai.me>");
});

Deno.test("el resumen sale del texto, en una línea", () => {
  assertEquals(filaSembrada(base).snippet, "Hola, te mando la cotización.");
});

Deno.test("la respuesta conserva sus cabeceras de hilo, partidas como las guarda el sync", () => {
  const f = filaSembrada({ ...base, inReplyTo: "<p@x>", references: "<a@x> <p@x>" });
  assertEquals(f.in_reply_to, "<p@x>");
  assertEquals(f.refs, ["<a@x>", "<p@x>"]);
});
