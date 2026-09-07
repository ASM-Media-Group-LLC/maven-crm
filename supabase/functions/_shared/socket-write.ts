// Escribir TODOS los bytes a un socket.
//
// Vive suelto y no dentro de SmtpClient/ImapClient por dos razones: el mismo
// bug mordió a los dos, y acá se puede probar con un socket falso sin abrir
// una conexión de verdad.

/** Lo mínimo que necesitamos de un Deno.Conn. Un tipo propio (y no Deno.Conn)
 *  para poder pasarle un doble en los tests. */
export interface SocketEscribible {
  write(p: Uint8Array): Promise<number>;
  close(): void;
}

/** Reloj real contra la promesa: al vencer, cerrar la conexión hace fallar
 *  también la escritura pendiente. Mismo patrón que en smtp.ts / imap.ts. */
async function conReloj<T>(p: Promise<T>, ms: number, mensaje: string, alVencer: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reloj = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      // Rechazar ANTES de cerrar: si no, el rechazo del socket ("Bad resource
      // ID") le gana la carrera y la persona ve ese error en vez del motivo.
      reject(new Error(mensaje));
      try {
        alVencer();
      } catch {
        // cerrar una conexión ya muerta no es noticia
      }
    }, ms);
  });
  try {
    return await Promise.race([p, reloj]);
  } finally {
    clearTimeout(timer);
    // La perdedora rechaza tarde y ya nadie la escucha: sin esto queda un
    // "unhandled rejection" que puede voltear el isolate entero.
    p.catch(() => {});
  }
}

/**
 * Escribe `bytes` completo, insistiendo hasta que no quede nada.
 *
 * ⚠️ EL BUG QUE ESTO ARREGLA (07/09/2026). `conn.write()` NO garantiza
 * escribir el buffer entero: es UNA llamada al socket, devuelve cuántos bytes
 * entraron y puede ser MENOS de los que le diste. Con comandos cortos siempre
 * entra todo, así que no se nota nunca. Con el cuerpo de un correo entraba un
 * pedazo, el resto se descartaba en silencio, y el servidor se quedaba
 * esperando el terminador que ya no iba a llegar → timeout.
 *
 * Se vio con un correo de ~200 KB (un adjunto): los de 2 KB salían bien y ese
 * fallaba SIEMPRE, a los 20 s exactos, con "no se pudo enviar: timeout
 * esperando al servidor SMTP" y el correo perfectamente sano.
 */
export async function escribirTodo(
  conn: SocketEscribible,
  bytes: Uint8Array,
  ms: number,
  quien: string,
): Promise<void> {
  const deadline = Date.now() + ms;
  let escritos = 0;
  while (escritos < bytes.length) {
    const restante = deadline - Date.now();
    if (restante <= 0) throw new Error(`timeout escribiendo al servidor ${quien}`);
    const n = await conReloj(
      conn.write(bytes.subarray(escritos)),
      restante,
      `timeout escribiendo al servidor ${quien}`,
      () => conn.close(),
    );
    // 0 bytes sin error no debería pasar, pero si pasa, reintentar en un bucle
    // cerrado quema la CPU del isolate hasta el timeout.
    if (n <= 0) throw new Error(`el servidor ${quien} dejó de aceptar datos`);
    escritos += n;
  }
}
