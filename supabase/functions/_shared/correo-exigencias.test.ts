// Correo «cambió la cámara o la pantalla» (Alvaro, 19/11/2026).
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { asuntoExigencias, correoExigenciasHTML, fraseExigencias, movimientos, sentido, type CambioExigencias } from "./correo-exigencias.ts";

const base: CambioExigencias = {
  id: "c1",
  tipo: "puesto",
  created_at: "2026-11-19T20:42:00Z",
  actor: "Jackeline Mejía",
  puesto: "Marketing",
  persona: null,
  puesto_antes: null,
  puesto_despues: null,
  camara_antes: true,
  camara_despues: false,
  pantalla_antes: true,
  pantalla_despues: true,
  afectados: [{ id: "a", nombre: "Isabel Tuiran" }, { id: "b", nombre: "Brayan Castaño" }],
  destinatarios: ["d1"],
  empresa: "Kash Agency",
  marca_nombre: null,
  marca_logo_url: null,
};

Deno.test("quién le quitó qué a qué puesto", () => {
  assertEquals(fraseExigencias(base), "Jackeline Mejía le quitó la cámara al puesto Marketing");
  assertEquals(sentido(base), "quita");
  assertEquals(asuntoExigencias(base), "Maven · Jackeline Mejía le quitó la cámara al puesto Marketing");
});

Deno.test("pedir las dos y cambio mixto", () => {
  const pide = { ...base, camara_antes: false, camara_despues: true, pantalla_antes: false, pantalla_despues: true };
  assertEquals(fraseExigencias(pide), "Jackeline Mejía le pidió la cámara y la pantalla al puesto Marketing");
  assertEquals(sentido(pide), "pide");
  const mixto = { ...base, pantalla_antes: false, pantalla_despues: true };
  assertEquals(movimientos(mixto), { quita: ["cámara"], pide: ["pantalla"] });
  assertEquals(sentido(mixto), "mixto");
});

Deno.test("cambio de puesto de una persona", () => {
  const p: CambioExigencias = { ...base, tipo: "persona", actor: "Alvaro Stephan Mejía", puesto: null, persona: "Miguel Garcia",
    puesto_antes: "Closer", puesto_despues: "Freelance", pantalla_despues: false };
  assertEquals(fraseExigencias(p), "Alvaro Stephan Mejía pasó a Miguel Garcia a Freelance: ya no comparte la cámara ni la pantalla");
  const html = correoExigenciasHTML(p);
  assertStringIncludes(html, "Pasó de <b");
  assertStringIncludes(html, "<b>Argos</b> deja de vigilar");
});

Deno.test("marca: la de la empresa si tiene, si no Maven", () => {
  assertStringIncludes(correoExigenciasHTML(base), "[M]aven");
  const cliente = correoExigenciasHTML({ ...base, marca_nombre: "Acme <Studio>", marca_logo_url: "https://acme.test/logo.png" });
  assertStringIncludes(cliente, 'src="https://acme.test/logo.png"');
  assertStringIncludes(cliente, "Acme &lt;Studio&gt; · hecho con");
  assertEquals(asuntoExigencias({ ...base, marca_nombre: "Acme" }).startsWith("Acme · "), true);
});

Deno.test("los nombres van escapados y se dice a cuántos afecta", () => {
  const html = correoExigenciasHTML({ ...base, afectados: [{ id: "x", nombre: "<b>Ana</b>" }] });
  assertStringIncludes(html, "&lt;b&gt;Ana&lt;/b&gt;");
  assertStringIncludes(html, "A quiénes afecta (1)");
});
