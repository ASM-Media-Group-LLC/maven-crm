// Correr: deno test --allow-read supabase/functions/_shared/correo-primer-contacto.test.ts
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { asuntoPrimerContacto, correoPrimerContactoHTML, horaBogota, type PrimerContacto } from "./correo-primer-contacto.ts";

const c: PrimerContacto = {
  tenant_id: "t",
  a: "11111111-1111-4111-8111-111111111111",
  b: "22222222-2222-4222-8222-222222222222",
  nombre_a: "Breyner",
  nombre_b: "Daniel <script>",
  creado: "2026-11-18T19:05:00Z",
  destinatarios: ["x"],
};

Deno.test("primer contacto: asunto con los dos nombres", () => {
  assertEquals(asuntoPrimerContacto({ ...c, nombre_b: "Daniel" }), "Breyner y Daniel empezaron a hablarse por primera vez");
});

Deno.test("primer contacto: hora de Bogotá", () => {
  assertEquals(horaBogota("2026-11-18T19:05:00Z"), "18/11/2026 14:05");
});

Deno.test("primer contacto: el HTML escapa los nombres y enlaza a las dos personas", () => {
  const h = correoPrimerContactoHTML(c);
  assert(!h.includes("<script>"));
  assert(h.includes("Daniel &lt;script&gt;"));
  assert(h.includes(`/hr/persona/${c.a}`) && h.includes(`/hr/persona/${c.b}`));
});
