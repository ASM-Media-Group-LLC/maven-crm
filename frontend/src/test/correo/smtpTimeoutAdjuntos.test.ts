import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// ⚠️ Se lee el fuente con `fs` y no con `?raw`: el `?raw` no llega fuera de
// frontend/ y una guarda que no carga pasa como verde sin revisar nada.
const leer = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");

// ── El timeout del punto final del SMTP ────────────────────────────────────
// 17/09/2026: Lina mandó 13 hojas de vida (18,5 MB → ~25 MB en base64). Los
// bytes llegaron enteros, Zoho los aceptó, pero esperábamos el «250 OK» con
// el timeout de 20 s de un comando común. Ella vio «no se pudo enviar»,
// reintentó, y a los 39 s salió el segundo: Andrea, Mónica y Grace lo
// recibieron dos veces. En prod quedaron las dos copias, 15:37:00 y 15:37:39.
describe("un correo pesado no se puede reportar como fallido a los 20 s", () => {
  const smtp = leer("supabase/functions/_shared/smtp.ts");
  const mailFetch = leer("supabase/functions/mail-fetch/index.ts");

  it("la respuesta al punto final NO usa el timeout de un comando común", () => {
    const i = smtp.indexOf('escribirTodo(this.conn, cuerpo');
    const j = smtp.indexOf("async quit(", i);
    expect(i, "no está la escritura del cuerpo").toBeGreaterThan(-1);
    expect(j, "no está el final de sendMessage").toBeGreaterThan(i);
    const trozo = smtp.slice(i, j);
    expect(trozo).toMatch(/readReply\(\s*timeoutDelPunto\(/);
    // Sin argumento volvería a los 20 s por defecto, que es el bug.
    expect(trozo).not.toMatch(/readReply\(\s*\)/);
  });

  it("⚠️ cortarse DESPUÉS del cuerpo se marca como incierto, no como fallo", () => {
    const i = smtp.indexOf('escribirTodo(this.conn, cuerpo');
    const j = smtp.indexOf("async quit(", i);
    expect(smtp.slice(i, j)).toMatch(/incierto:\s*true/);
  });

  it("la edge lo distingue ANTES de decir «no se pudo enviar»", () => {
    const i = mailFetch.indexOf("const sent = await smtp.sendMessage(");
    const noSePudo = mailFetch.indexOf("no se pudo enviar:", i);
    const incierto = mailFetch.indexOf("sent.incierto", i);
    expect(i, "no está el envío").toBeGreaterThan(-1);
    expect(incierto, "la edge no mira `incierto`").toBeGreaterThan(i);
    // El orden importa: si el genérico va primero, nunca se llega al otro.
    expect(incierto).toBeLessThan(noSePudo);
  });

  it("el mensaje al usuario le dice que NO reintente a ciegas", () => {
    const i = mailFetch.indexOf("sent.incierto");
    const j = mailFetch.indexOf("no se pudo enviar:", i);
    const texto = mailFetch.slice(i, j);
    expect(texto).toMatch(/Enviados/);
    expect(texto).toMatch(/reintentar/i);
    // Y NO puede empezar diciendo que no se pudo: eso es lo que invita a repetir.
    expect(texto).not.toMatch(/error: `no se pudo enviar/);
  });
});
