import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  claveDeError, contrasenaValida, correoDeInvitacion, correoValido, enlaceDeInvitacion, idiomaDe, nombreValido, tokenValido, uuidValido,
} from "./logica.ts";

Deno.test("correo: se limpia y se valida", () => {
  assertEquals(correoValido("  Dueno@Empresa.COM "), "dueno@empresa.com");
  assertEquals(correoValido("sin-arroba"), null);
  assertEquals(correoValido(42), null);
});

Deno.test("nombre: de 2 a 120 letras, sin espacios de más", () => {
  assertEquals(nombreValido("  Ana   María "), "Ana María");
  assertEquals(nombreValido("A"), null);
  assertEquals(nombreValido("x".repeat(121)), null);
});

Deno.test("idioma: solo es o en (por defecto es)", () => {
  assertEquals(idiomaDe("en"), "en");
  assertEquals(idiomaDe("fr"), "es");
});

Deno.test("uuid y token", () => {
  assertEquals(uuidValido("A0000000-0000-4000-8000-000000000001"), "a0000000-0000-4000-8000-000000000001");
  assertEquals(uuidValido("1; drop table"), null);
  assertEquals(tokenValido("a".repeat(64)), "a".repeat(64));
  assertEquals(tokenValido("a".repeat(63)), null);
});

Deno.test("contraseña: de 8 a 72", () => {
  assertEquals(contrasenaValida("1234567"), null);
  assertEquals(contrasenaValida("12345678"), "12345678");
  assertEquals(contrasenaValida("x".repeat(73)), null);
});

Deno.test("el enlace lleva el token en el #hash (no viaja al servidor)", () => {
  assertEquals(enlaceDeInvitacion("https://app.maven-ai.me/", "abc"), "https://app.maven-ai.me/crear-contrasena#t=abc");
});

Deno.test("la clave del error de la base", () => {
  assertEquals(claveDeError("faltan_pendientes: setup_sin_pagar"), "faltan_pendientes");
  assertEquals(claveDeError("Algo raro"), "error");
});

Deno.test("el correo escapa lo que escribe Maven y va en el idioma del Dueño", () => {
  const es = correoDeInvitacion({ idioma: "es", nombre: "<b>Ana</b>", empresa: "A&B", enlace: "https://x/crear-contrasena#t=1" });
  assertStringIncludes(es.asunto, "ya está lista en Maven");
  assertStringIncludes(es.html, "&lt;b&gt;Ana&lt;/b&gt;");
  assertStringIncludes(es.html, "A&amp;B");
  assertStringIncludes(es.texto, "https://x/crear-contrasena#t=1");
  const en = correoDeInvitacion({ idioma: "en", nombre: "Ann", empresa: "Acme", enlace: "https://x" });
  assertStringIncludes(en.asunto, "is ready on Maven");
  assertStringIncludes(en.html, "Create my password");
});
