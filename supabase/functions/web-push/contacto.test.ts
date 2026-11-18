// Correr: deno test --allow-read supabase/functions/web-push/
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { sinRestringidos } from "./contacto.ts";

Deno.test("timbre: en grupo no le suena a quien quien llama no puede sumar", () => {
  assertEquals(sinRestringidos(["a", "b", "c"], ["b"]), ["a", "c"]);
});

Deno.test("timbre: el 1 a 1 de siempre suena aunque sean dos chatters", () => {
  assertEquals(sinRestringidos(["b"], ["b", "c"], ["b"]), ["b"]);
  assertEquals(sinRestringidos(["b", "c"], ["b", "c"], ["b"]), ["b"]);
});

Deno.test("timbre: sin restringidos (o si la consulta falló) suena a todos", () => {
  assertEquals(sinRestringidos(["a", "b"], []), ["a", "b"]);
  assertEquals(sinRestringidos(["a", "b"], null), ["a", "b"]);
});
