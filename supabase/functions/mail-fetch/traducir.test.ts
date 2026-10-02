// «Traducir» del ⋮ de cada mensaje: el HTML a texto sin perder los saltos de
// línea, el tope, y la llamada a OpenRouter con un fetch de mentira (sin red).
import { assert, assertEquals, assertRejects, assertStringIncludes } from "jsr:@std/assert@1";
import {
  ErrorDeTraduccion, htmlATexto, instrucciones, OPENROUTER_URL, pedirTraduccion, TOPE_CARACTERES,
  textoParaTraducir,
} from "./traducir.ts";

Deno.test("htmlATexto conserva los saltos de línea y los párrafos", () => {
  const html = "<p>Hola equipo,</p><p>Adjunto el informe.<br>Saludos</p><div>Ana</div>";
  assertEquals(htmlATexto(html), "Hola equipo,\n\nAdjunto el informe.\nSaludos\n\nAna");
});

Deno.test("htmlATexto descarta estilos, scripts y comentarios, y decodifica entidades", () => {
  const html = "<style>p{color:red}</style><script>alert(1)</script><!-- x -->" +
    "<p>Caf&eacute; &amp; t&#233; &#x2014; &nbsp;listo &lt;ok&gt;</p>";
  assertEquals(htmlATexto(html), "Café & té — listo <ok>");
});

Deno.test("htmlATexto pone viñetas en las listas", () => {
  assertEquals(htmlATexto("<ul><li>Uno</li><li>Dos</li></ul>"), "• Uno\n• Dos");
});

Deno.test("textoParaTraducir prefiere el texto plano y recorta en un salto de línea", () => {
  assertEquals(textoParaTraducir({ text: "Hello\r\nworld", html: "<p>otro</p>" }), {
    texto: "Hello\nworld", recortado: false,
  });
  assertEquals(textoParaTraducir({ text: "", html: "<p>Solo HTML</p>" }).texto, "Solo HTML");

  const largo = Array.from({ length: 2000 }, (_, i) => `Línea ${i} del correo`).join("\n");
  const r = textoParaTraducir({ text: largo });
  assert(r.recortado);
  assert(r.texto.length <= TOPE_CARACTERES);
  // No parte una línea al medio.
  assert(/Línea \d+ del correo$/.test(r.texto), r.texto.slice(-40));
});

Deno.test("las instrucciones piden el idioma de destino y conservar el formato", () => {
  assertStringIncludes(instrucciones("es"), "into Spanish");
  assertStringIncludes(instrucciones("en"), "into English");
  assertStringIncludes(instrucciones("es"), "line break");
});

Deno.test("pedirTraduccion manda la llave como Bearer y devuelve la traducción", async () => {
  let pedido: { url: string; init: RequestInit } | null = null;
  const falso = ((url: string, init: RequestInit) => {
    pedido = { url, init };
    return Promise.resolve(new Response(JSON.stringify({
      choices: [{ message: { content: "  Hola equipo  " } }],
    }), { status: 200 }));
  }) as unknown as typeof fetch;

  const t = await pedirTraduccion(falso, "sk-prueba", "google/gemini-2.5-flash-lite", "Hello team", "es");
  assertEquals(t, "Hola equipo");
  assertEquals(pedido!.url, OPENROUTER_URL);
  assertEquals((pedido!.init.headers as Record<string, string>).Authorization, "Bearer sk-prueba");
  const cuerpo = JSON.parse(pedido!.init.body as string);
  assertEquals(cuerpo.model, "google/gemini-2.5-flash-lite");
  assertEquals(cuerpo.messages[1], { role: "user", content: "Hello team" });
  assertStringIncludes(cuerpo.messages[0].content, "Spanish");
});

Deno.test("pedirTraduccion: un 401 no filtra la llave y dice qué pasó", async () => {
  const falso = (() => Promise.resolve(new Response("bad key sk-prueba", { status: 401 }))) as unknown as typeof fetch;
  const e = await assertRejects(
    () => pedirTraduccion(falso, "sk-prueba", "m", "x", "en"),
    ErrorDeTraduccion,
  );
  assert(!e.message.includes("sk-prueba"));
  assertEquals(e.status, 502);
});

Deno.test("pedirTraduccion: una respuesta vacía es un error, no una traducción en blanco", async () => {
  const falso = (() => Promise.resolve(new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), { status: 200 }))) as unknown as typeof fetch;
  await assertRejects(() => pedirTraduccion(falso, "k", "m", "x", "en"), ErrorDeTraduccion, "vacía");
});

Deno.test("la acción de la edge: sin llave avisa con un código, y lee SOLO filas de quien llama", async () => {
  const index = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  const desde = index.indexOf('if (action === "translate")');
  const bloque = index.slice(desde, index.indexOf('if (action === "folders")', desde));
  assert(desde > 0, "falta la acción translate");
  assertStringIncludes(bloque, 'Deno.env.get("OPENROUTER_API_KEY")');
  assertStringIncludes(bloque, '{ error: "sin_llave_ia" }');
  assertStringIncludes(bloque, '.eq("user_id", user.id)');
  // La llave nunca vuelve en la respuesta.
  assert(!/json\(req, \{[^}]*apiKey/.test(bloque));
});
