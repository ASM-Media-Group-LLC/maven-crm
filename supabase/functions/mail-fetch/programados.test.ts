// Los correos programados: la hora que se acepta, la fila que se guarda y que
// el cron la vuelve a revisar igual que un envío a mano.
// Correr: deno test --no-check supabase/functions/mail-fetch/programados.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { filaDelProgramado, HORIZONTE_MS, pedidoDeLaFila, revisarHora } from "./programados.ts";
import { revisarCorreo } from "./enviar.ts";

const AHORA = new Date("2026-10-08T15:00:00Z"); // 10:00 en Bogotá

Deno.test("la hora: mañana 8:00 de Bogotá entra, tal cual", () => {
  const r = revisarHora("2026-10-09T13:00:00.000Z", AHORA);
  assert(r.ok);
  assertEquals(r.cuando.toISOString(), "2026-10-09T13:00:00.000Z");
});

Deno.test("la hora: unos segundos en el pasado se acepta (el reloj siguió andando); media hora, no", () => {
  assert(revisarHora("2026-10-08T14:59:30Z", AHORA).ok);
  const r = revisarHora("2026-10-08T14:30:00Z", AHORA);
  assertEquals(r.ok ? "" : r.error, "esa hora ya pasó");
});

Deno.test("la hora: sin hora, basura o a más de un año, no", () => {
  assertEquals(revisarHora(undefined, AHORA).ok, false);
  assertEquals(revisarHora("mañana", AHORA).ok, false);
  assertEquals(revisarHora(new Date(AHORA.getTime() + HORIZONTE_MS + 60_000).toISOString(), AHORA).ok, false);
});

const pedido = {
  to: ["ana@x.com"],
  cc: ["beto@y.com"],
  bcc: ["jefa@z.com"],
  subject: "Cotización",
  text: "Hola,\n\nva la cotización.",
  html: '<p>Hola,</p><p>va la cotización.</p><img src="cid:img1.ab@maven-ai.me">',
  in_reply_to: "<p@x>",
  references: "<a@x> <p@x>",
  menciones: ["a0000000-0000-4000-8000-000000000001", "no-es-un-id"],
  attachments: [
    { filename: "cotizacion.pdf", contentType: "application/pdf", contentBase64: "JVBERi0xLjQK" },
    { filename: "imagen-1.png", contentType: "image/png", contentBase64: "iVBORw0K", contentId: "img1.ab@maven-ai.me" },
  ],
};

Deno.test("la fila: la lista ve destinatarios, asunto, resumen y SOLO los archivos (no las imágenes pegadas)", () => {
  const r = revisarCorreo(pedido);
  assert(r.ok);
  const f = filaDelProgramado("u1", new Date("2026-10-09T13:00:00Z"), r.correo);
  assertEquals(f.para, ["ana@x.com"]);
  assertEquals(f.cco, ["jefa@z.com"]);
  assertEquals(f.asunto, "Cotización");
  assertEquals(f.resumen, "Hola, va la cotización.");
  assertEquals(f.adjuntos_meta, [{ filename: "cotizacion.pdf", contentType: "application/pdf", sizeBytes: 9 }]);
  assertEquals(f.enviar_en, "2026-10-09T13:00:00.000Z");
  // Las menciones, solo las que son ids.
  assertEquals(f.correo.menciones, ["a0000000-0000-4000-8000-000000000001"]);
});

Deno.test("⚠️ el cron arma el MISMO correo que se programó (ida y vuelta por la fila)", () => {
  const r = revisarCorreo(pedido);
  assert(r.ok);
  const f = filaDelProgramado("u1", new Date("2026-10-09T13:00:00Z"), r.correo);
  // Lo que vuelve de la base: jsonb ida y vuelta.
  const deLaBase = JSON.parse(JSON.stringify({ id: "p1", ...f }));
  const otraVez = revisarCorreo(pedidoDeLaFila(deLaBase));
  assert(otraVez.ok);
  assertEquals(otraVez.correo, r.correo);
});

Deno.test("una dirección mala se dice al PROGRAMAR, no a la hora de salir", () => {
  const r = revisarCorreo({ ...pedido, to: ["ana@x.com\r\nRCPT TO:<otro@x.com>"] });
  assertEquals(r.ok ? 0 : r.status, 400);
});

Deno.test("sin destinatario o vacío: no se programa", () => {
  assertEquals(revisarCorreo({ ...pedido, to: [] }).ok, false);
  assertEquals(revisarCorreo({ to: ["ana@x.com"] }).ok, false);
});
