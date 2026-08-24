// Descarga de adjuntos: lo que importa es que los BYTES lleguen intactos. Un
// error acá entrega un PDF o una imagen corrupta sin avisar.
// Correr: deno test supabase/functions/_shared/mime.test.ts

import { extraerAdjunto, parseMessage } from "./mime.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function mismosBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Arma un multipart/mixed con un cuerpo de texto y los adjuntos dados. */
function armarMensaje(
  adjuntos: Array<{ nombre: string; tipo: string; enc: string; cuerpo: string }>,
): string {
  const b = "FRONTERA123";
  const partes = [
    `Content-Type: multipart/mixed; boundary="${b}"`,
    "",
    `--${b}`,
    'Content-Type: text/plain; charset="utf-8"',
    "",
    "Mira el adjunto.",
  ];
  for (const a of adjuntos) {
    partes.push(
      `--${b}`,
      `Content-Type: ${a.tipo}; name="${a.nombre}"`,
      `Content-Transfer-Encoding: ${a.enc}`,
      `Content-Disposition: attachment; filename="${a.nombre}"`,
      "",
      a.cuerpo,
    );
  }
  partes.push(`--${b}--`, "");
  return partes.join("\r\n");
}

Deno.test("base64: los bytes binarios llegan intactos (incluye 0x00 y 0xFF)", () => {
  const original = new Uint8Array([0, 1, 2, 3, 255, 254, 128, 72, 73, 0]);
  const raw = armarMensaje([
    { nombre: "a.bin", tipo: "application/octet-stream", enc: "base64", cuerpo: bytesToBase64(original) },
  ]);
  const adj = extraerAdjunto(raw, 0);
  assert(adj !== null, "no encontró el adjunto");
  assert(mismosBytes(adj!.bytes, original), "los bytes no coinciden");
  assert(adj!.filename === "a.bin", `filename: ${adj!.filename}`);
  assert(adj!.contentType === "application/octet-stream", `tipo: ${adj!.contentType}`);
});

Deno.test("base64 partido en varias líneas de 76 se recompone", () => {
  const original = new Uint8Array(1000).map((_, i) => i % 256);
  const b64 = bytesToBase64(original);
  const plegado = b64.match(/.{1,76}/g)!.join("\r\n"); // como lo manda un cliente real
  const raw = armarMensaje([
    { nombre: "big.dat", tipo: "application/octet-stream", enc: "base64", cuerpo: plegado },
  ]);
  const adj = extraerAdjunto(raw, 0);
  assert(adj !== null && mismosBytes(adj.bytes, original), "roundtrip de base64 plegado falló");
});

Deno.test("el índice elige el adjunto correcto entre varios", () => {
  const uno = new Uint8Array([10, 20, 30]);
  const dos = new Uint8Array([40, 50, 60, 70]);
  const raw = armarMensaje([
    { nombre: "uno.bin", tipo: "application/octet-stream", enc: "base64", cuerpo: bytesToBase64(uno) },
    { nombre: "dos.bin", tipo: "application/pdf", enc: "base64", cuerpo: bytesToBase64(dos) },
  ]);
  assert(mismosBytes(extraerAdjunto(raw, 0)!.bytes, uno), "adjunto 0 mal");
  const a1 = extraerAdjunto(raw, 1)!;
  assert(mismosBytes(a1.bytes, dos), "adjunto 1 mal");
  assert(a1.filename === "dos.bin" && a1.contentType === "application/pdf", "metadata del 1 mal");
});

Deno.test("el orden coincide con parseMessage(...).attachments", () => {
  const uno = new Uint8Array([1, 1, 1]);
  const dos = new Uint8Array([2, 2, 2]);
  const raw = armarMensaje([
    { nombre: "primero.bin", tipo: "application/octet-stream", enc: "base64", cuerpo: bytesToBase64(uno) },
    { nombre: "segundo.bin", tipo: "application/octet-stream", enc: "base64", cuerpo: bytesToBase64(dos) },
  ]);
  const meta = parseMessage(raw).attachments;
  assert(meta[0].filename === "primero.bin" && meta[1].filename === "segundo.bin", "orden de metadata");
  assert(extraerAdjunto(raw, 0)!.filename === meta[0].filename, "el índice 0 no es el mismo que en la lista");
  assert(extraerAdjunto(raw, 1)!.filename === meta[1].filename, "el índice 1 no es el mismo que en la lista");
});

Deno.test("quoted-printable: los =XX vuelven a bytes", () => {
  // "Café\n" en UTF-8 = 43 61 66 C3 A9 0A. En QP: Caf=C3=A9=0A.
  const original = new Uint8Array([0x43, 0x61, 0x66, 0xc3, 0xa9, 0x0a]);
  const raw = armarMensaje([
    { nombre: "nota.txt", tipo: "text/plain", enc: "quoted-printable", cuerpo: "Caf=C3=A9=0A" },
  ]);
  const adj = extraerAdjunto(raw, 0);
  assert(adj !== null && mismosBytes(adj.bytes, original), "QP a bytes falló");
});

Deno.test("un índice fuera de rango devuelve null", () => {
  const raw = armarMensaje([
    { nombre: "solo.bin", tipo: "application/octet-stream", enc: "base64", cuerpo: bytesToBase64(new Uint8Array([9])) },
  ]);
  assert(extraerAdjunto(raw, 5) === null, "debería ser null");
  assert(extraerAdjunto(raw, -1) === null, "índice negativo debería ser null");
});
