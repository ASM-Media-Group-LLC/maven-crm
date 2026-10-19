// Guarda que lee el código (sin red ni base): finalizar o salir de una sesión
// tiene que SOLTAR las asignaciones de sala (is_active=false). Correr:
//   deno test --allow-read --no-lock supabase/functions/cowork-session/finalizar-suelta-asignaciones.test.ts
//
// EL BUG (19/10/2026): endSession marcaba la sesión como terminada y cerraba los
// segmentos de tiempo, pero NUNCA desactivaba las asignaciones de sala —
// leaveSession sí lo hacía. Quedaron 26 asignaciones is_active=true colgadas en
// sesiones ya terminadas (18 personas): la gente arrastraba pertenencia a
// sesiones viejas y, al entrar a su link, aparecía en la sala/sesión de otro
// ("se nos mezcló el cowork"). Esta guarda exige que AMBAS puertas de salida
// suelten la asignación.

import { assert } from "jsr:@std/assert";

const leer = (f: string) => Deno.readTextFileSync(new URL(`./${f}`, import.meta.url));
/** Sin comentarios de línea ni de bloque: una mención en un comentario no cuenta. */
const codigo = (f: string) =>
  leer(f)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .map((l) => l.replace(/\s\/\/.*$/, ""))
    .join("\n");

/** El cuerpo de una acción `if (action === "X")`, hasta la siguiente acción. */
function bloqueDeAccion(src: string, accion: string): string {
  const i = src.indexOf(`action === "${accion}"`);
  assert(i >= 0, `falta la acción ${accion} en index.ts`);
  const resto = src.slice(i + `action === "${accion}"`.length);
  const j = resto.indexOf('action === "');
  return j < 0 ? resto : resto.slice(0, j);
}

/** ¿El bloque desactiva asignaciones de sala (is_active=false)? */
function sueltaAsignaciones(bloque: string): boolean {
  return /cowork_room_assignments/.test(bloque) && /is_active:\s*false/.test(bloque);
}

Deno.test("endSession suelta las asignaciones de sala", () => {
  const bloque = bloqueDeAccion(codigo("index.ts"), "endSession");
  assert(
    sueltaAsignaciones(bloque),
    "endSession debe desactivar las asignaciones (is_active=false), como leaveSession; si no, quedan colgadas y la gente se cruza de sala",
  );
});

Deno.test("leaveSession suelta las asignaciones de sala", () => {
  const bloque = bloqueDeAccion(codigo("index.ts"), "leaveSession");
  assert(
    sueltaAsignaciones(bloque),
    "leaveSession debe desactivar las asignaciones (is_active=false)",
  );
});
