import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// 18/09/2026, CAÍDA EN PRODUCCIÓN.
//
// El frontend salió pidiendo `in_reply_to` y `refs` ANTES de que la migración
// estuviera aplicada. PostgREST no devuelve las columnas que existen y omite
// las que no: rechaza el SELECT ENTERO. El Correo quedó así para todo el
// mundo:
//
//   «No se pudieron traer los mensajes
//    column mail_messages.in_reply_to does not exist»
//
// Dos columnas OPCIONALES —que solo mejoran cómo se agrupan los hilos—
// voltearon el módulo completo. La lección no es "acordate de aplicar la
// migración": es que una mejora opcional no puede ser un punto de falla del
// camino principal.

const hook = readFileSync(
  resolve(process.cwd(), "frontend/src/hooks/useMailbox.ts"), "utf8",
);

describe("⚠️ la bandeja NO se cae si faltan las columnas de hilos", () => {
  it("reintenta sin ellas cuando el error las nombra", () => {
    expect(hook).toMatch(/if \(error && \/in_reply_to\|refs\/\.test/);
    expect(hook).toMatch(/await traer\(COLUMNAS_BASE\)/);
  });

  it("el primer intento SÍ las pide: el reintento es el respaldo, no el plan", () => {
    expect(hook).toMatch(/traer\(`\$\{COLUMNAS_BASE\}, in_reply_to, refs`\)/);
  });

  it("⚠️ un error que NO sea por esas columnas sigue rompiendo", () => {
    // Tragarse cualquier error dejaría la bandeja vacía sin decir por qué, que
    // es peor que el cartel rojo: parece que no tenés correos.
    expect(hook).toMatch(/if \(error\) throw error;/);
  });

  it("las columnas base no incluyen las opcionales", () => {
    const i = hook.indexOf("const COLUMNAS_BASE");
    const j = hook.indexOf(";", i);
    const base = hook.slice(i, j);
    expect(base).not.toMatch(/in_reply_to|refs/);
    expect(base).toMatch(/message_id/);
  });
});
