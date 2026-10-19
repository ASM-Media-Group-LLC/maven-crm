// Guarda que lee el código: createSession NO debe permitir dos sesiones ACTIVAS
// con el mismo nombre en la agencia. Correr:
//   deno test --allow-read --no-lock supabase/functions/cowork-session/sesion-nombre-unico.test.ts
//
// EL PROBLEMA (19/10/2026): había 5 sesiones "CHATTERS KASH" (4 terminadas, 1
// activa). La gente se repartía entre varias con el mismo nombre y se perdían
// los links. Ahora no se puede crear otra activa con un nombre que ya existe.

import { assert } from "jsr:@std/assert";

const leer = (f: string) => Deno.readTextFileSync(new URL(`./${f}`, import.meta.url));
const codigo = (f: string) =>
  leer(f)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .map((l) => l.replace(/\s\/\/.*$/, ""))
    .join("\n");

function bloqueDeAccion(src: string, accion: string): string {
  const i = src.indexOf(`action === "${accion}"`);
  assert(i >= 0, `falta la acción ${accion} en index.ts`);
  const resto = src.slice(i + `action === "${accion}"`.length);
  const j = resto.indexOf('action === "');
  return j < 0 ? resto : resto.slice(0, j);
}

Deno.test("createSession rechaza un nombre de sesión ACTIVA duplicado", () => {
  const b = bloqueDeAccion(codigo("index.ts"), "createSession");
  assert(/\.from\("cowork_sessions"\)/.test(b), "debe consultar cowork_sessions");
  assert(/"status",\s*"active"/.test(b), "el chequeo debe mirar solo sesiones activas");
  assert(/409/.test(b), "debe rechazar con 409 cuando el nombre ya existe activo");
});
