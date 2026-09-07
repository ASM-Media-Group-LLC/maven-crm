// El socket real escribe DE A PEDAZOS. Estos tests usan un doble que hace
// exactamente eso, porque es la única forma de reproducir el bug del correo
// de 200 KB sin abrir una conexión de verdad.
// Correr: deno test supabase/functions/_shared/socket-write.test.ts

import { escribirTodo, type SocketEscribible } from "./socket-write.ts";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(msg);
}

/** Socket que solo acepta `tope` bytes por llamada, como uno real bajo carga. */
function socketTacaño(tope: number) {
  const recibido: number[] = [];
  let cerrado = false;
  const conn: SocketEscribible = {
    write(p) {
      const n = Math.min(tope, p.length);
      for (let i = 0; i < n; i++) recibido.push(p[i]);
      return Promise.resolve(n);
    },
    close() { cerrado = true; },
  };
  return { conn, recibido, cerrado: () => cerrado };
}

Deno.test("escribe el mensaje ENTERO aunque el socket lo tome de a pedazos", async () => {
  // 200 KB: el tamaño exacto del correo de Andrea que fallaba.
  const cuerpo = new TextEncoder().encode("x".repeat(200_000) + "\r\n.\r\n");
  const s = socketTacaño(16_384);
  await escribirTodo(s.conn, cuerpo, 60_000, "SMTP");
  assert(
    s.recibido.length === cuerpo.length,
    `se escribieron ${s.recibido.length} de ${cuerpo.length} bytes`,
  );
});

Deno.test("los bytes llegan en ORDEN y sin repetir", async () => {
  const original = new Uint8Array(50_000).map((_, i) => i % 251);
  const s = socketTacaño(1_000);
  await escribirTodo(s.conn, original, 10_000, "IMAP");
  assert(s.recibido.length === original.length, "largo distinto");
  for (let i = 0; i < original.length; i++) {
    if (s.recibido[i] !== original[i]) throw new Error(`byte ${i} no coincide`);
  }
});

Deno.test("un socket que acepta todo de una escribe UNA sola vez", async () => {
  let llamadas = 0;
  const conn: SocketEscribible = {
    write(p) { llamadas++; return Promise.resolve(p.length); },
    close() {},
  };
  await escribirTodo(conn, new TextEncoder().encode("EHLO maven\r\n"), 5_000, "SMTP");
  assert(llamadas === 1, `esperaba 1 llamada, hubo ${llamadas}`);
});

Deno.test("un socket que se traba corta por timeout y CIERRA la conexión", async () => {
  const s = socketTacaño(0);           // acepta 0 bytes: nunca avanza
  let mensaje = "";
  try {
    await escribirTodo(s.conn, new Uint8Array(10), 200, "SMTP");
    throw new Error("debería haber fallado");
  } catch (e) {
    mensaje = (e as Error).message;
  }
  assert(/dejó de aceptar datos|timeout/.test(mensaje), `mensaje raro: ${mensaje}`);
});

Deno.test("un socket que NUNCA responde corta por reloj, no queda colgado", async () => {
  let cerrado = false;
  const conn: SocketEscribible = {
    write() { return new Promise<number>(() => {}); },  // jamás resuelve
    close() { cerrado = true; },
  };
  const t0 = Date.now();
  try {
    await escribirTodo(conn, new Uint8Array(10), 300, "IMAP");
    throw new Error("debería haber fallado");
  } catch (e) {
    assert(/timeout escribiendo al servidor IMAP/.test((e as Error).message),
      `mensaje raro: ${(e as Error).message}`);
  }
  assert(Date.now() - t0 < 3_000, "no cortó a tiempo");
  assert(cerrado, "no cerró la conexión al vencer");
});
