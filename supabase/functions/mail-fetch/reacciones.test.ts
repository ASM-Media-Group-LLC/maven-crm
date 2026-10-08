// Las reglas de las reacciones con emoji (como Gmail): qué es un emoji, a quién
// va, cuándo no se puede.
// Correr: deno test --no-check supabase/functions/mail-fetch/reacciones.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import {
  asuntoDeLaReaccion, destinatariosDeLaReaccion, esUnEmoji, referenciasDeLaReaccion, respaldoDeLaReaccion,
  TOPE_DESTINATARIOS,
} from "./reacciones.ts";

Deno.test("un emoji, con tono de piel, unión o bandera: sí", () => {
  for (const e of ["👍", "😂", "👍🏽", "👩‍💻", "❤️", "🇨🇴", "#️⃣"]) assertEquals(esUnEmoji(e), true, e);
});

Deno.test("dos emojis, texto, vacío o basura: no (Gmail lo mostraría como un correo común)", () => {
  for (const e of ["👍👍", "ok", "", "a👍", " 👍", null, 5, "x".repeat(40)]) assertEquals(esUnEmoji(e), false, String(e));
});

const original = {
  from: '"Ana Gómez" <ana@gmail.com>',
  to: '"Keila" <keila@maven-ai.me>, beto@unlok.me',
  cc: "carla@kashagency.me",
};

Deno.test("va a todos como «Responder a todos», sin uno mismo", () => {
  assertEquals(destinatariosDeLaReaccion(original, "keila@maven-ai.me"), {
    ok: true, to: ["ana@gmail.com", "beto@unlok.me"], cc: ["carla@kashagency.me"],
  });
});

Deno.test("a un correo que mandé yo: a sus destinatarios", () => {
  const mio = { from: "keila@maven-ai.me", to: "ana@gmail.com", cc: "" };
  assertEquals(destinatariosDeLaReaccion(mio, "KEILA@maven-ai.me"), { ok: true, to: ["ana@gmail.com"], cc: [] });
});

Deno.test("⚠️ con copia oculta (no estoy en Para ni Cc) no se reacciona: delataría que lo recibí", () => {
  assertEquals(destinatariosDeLaReaccion(original, "jefa@maven-ai.me"), { ok: false, motivo: "no_estas" });
});

Deno.test("con más de 20 personas, no (lo recomienda Google)", () => {
  const muchos = Array.from({ length: TOPE_DESTINATARIOS + 1 }, (_, i) => `p${i}@x.co`).join(", ");
  assertEquals(destinatariosDeLaReaccion({ from: "a@x.co", to: `keila@maven-ai.me, ${muchos}`, cc: "" }, "keila@maven-ai.me").ok, false);
});

Deno.test("asunto «Re:» una sola vez y References con la cadena entera", () => {
  assertEquals(asuntoDeLaReaccion("Cotización"), "Re: Cotización");
  assertEquals(asuntoDeLaReaccion("RE: Cotización"), "RE: Cotización");
  assertEquals(referenciasDeLaReaccion(["<a@x>", "<b@x>"], "<c@x>"), "<a@x> <b@x> <c@x>");
  assertEquals(referenciasDeLaReaccion(null, "<c@x>"), "<c@x>");
});

Deno.test("el texto de respaldo, con el nombre escapado en el HTML", () => {
  assertEquals(respaldoDeLaReaccion("Keila <K>", "👍"), {
    text: "Keila <K> reaccionó con 👍",
    html: "<p>Keila &lt;K&gt; reaccionó con 👍</p>",
  });
});
