// Los mensajes de manage-api-keys, en los dos idiomas, y que no quede ninguno
// escrito a mano en index.ts (se vería en español con la página en inglés).
import { assert, assertEquals } from "jsr:@std/assert";
import { idiomaDe, msg, TODOS_LOS_MENSAJES } from "./mensajes.ts";

Deno.test("cada mensaje tiene su versión en español y en inglés, y el inglés no tiene acentos", () => {
  for (const [clave, par] of Object.entries(TODOS_LOS_MENSAJES)) {
    assert(par.es.trim() && par.en.trim(), `${clave} está vacío en algún idioma`);
    assert(!/[áéíóúÁÉÍÓÚñÑ¿¡]/.test(par.en), `${clave}: el inglés tiene acentos o ñ («${par.en}»)`);
    const varsEs = [...par.es.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    const varsEn = [...par.en.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    assertEquals(varsEn, varsEs, `${clave}: las variables no coinciden entre idiomas`);
  }
});

Deno.test("el idioma sale de `lang`; sin él, español como siempre", () => {
  assertEquals(idiomaDe({ lang: "en" }), "en");
  assertEquals(idiomaDe({ lang: "es" }), "es");
  assertEquals(idiomaDe({}), "es");
  assertEquals(idiomaDe(null), "es");
  assertEquals(idiomaDe({ lang: "EN; drop table" }), "es");
});

Deno.test("las variables se reemplazan", () => {
  assertEquals(msg("en", "maximoDeKeys", { max: 3 }), "You've reached the maximum of 3 active API keys. Revoke one before creating another.");
  assertEquals(msg("es", "maximoDeKeys", { max: 3 }), "Llegaste al máximo de 3 API keys activas. Revoca una antes de crear otra.");
});

Deno.test("index.ts no devuelve textos escritos a mano: todo pasa por los mensajes", () => {
  const codigo = Deno.readTextFileSync(new URL("./index.ts", import.meta.url))
    .split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  const errores = [...codigo.matchAll(/json\(\s*req\s*,\s*\{\s*error:\s*([^,}]+)/g)].map((m) => m[1].trim());
  assert(errores.length > 15, "el test no encontró los errores: cambió la forma del código");
  // Válidos: m("…"), el mensaje de un error de la base (error.message y parecidos),
  // o "Unauthorized" (lo mira adminInvoke para saber que la sesión se cayó).
  const aMano = errores.filter((e) =>
    !/^m\(/.test(e) && !/^\w+\.message$/.test(e) && e !== '"Unauthorized"' && !/^String\(/.test(e));
  assertEquals(aMano, [], "hay mensajes escritos a mano en manage-api-keys/index.ts");
});
