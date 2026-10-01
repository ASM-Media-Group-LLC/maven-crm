// El análisis de QA por OpenRouter: qué se pide y cómo se lee la respuesta.
// Sin red: fetch es un doble que responde como OpenRouter.
//   deno test --no-check supabase/functions/qa-analyze/openrouter.test.ts
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { costoDeUso, MODELO_ECONOMICO, OPENROUTER_URL, pedirAnalisis, sinCercas } from "./openrouter.ts";

function openRouterFalso(status: number, json: unknown) {
  const pedidos: Array<{ url: string; body: Record<string, unknown>; headers: Record<string, string> }> = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    pedidos.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")), headers: init?.headers as Record<string, string> });
    return new Response(JSON.stringify(json), { status });
  }) as typeof fetch;
  return { f, pedidos };
}

Deno.test("pide JSON con el system y el mensaje, y devuelve el texto sin cercas", async () => {
  const { f, pedidos } = openRouterFalso(200, {
    choices: [{ message: { content: "```json\n{\"overall_score\": 80}\n```" } }],
    usage: { prompt_tokens: 9000, completion_tokens: 1500, cost: 0.0015 },
  });
  const r = await pedirAnalisis(f, "llave", MODELO_ECONOMICO, "la rúbrica", "la transcripción", 135_000);
  assertEquals(r.raw, "{\"overall_score\": 80}");
  assertEquals(r.usage?.cost, 0.0015);
  assertEquals(pedidos[0].url, OPENROUTER_URL);
  assertEquals(pedidos[0].headers["Authorization"], "Bearer llave");
  assertEquals(pedidos[0].body.model, MODELO_ECONOMICO);
  assertEquals(pedidos[0].body.response_format, { type: "json_object" });
  assertEquals(pedidos[0].body.messages, [{ role: "system", content: "la rúbrica" }, { role: "user", content: "la transcripción" }]);
  assertEquals(pedidos[0].body.usage, { include: true });
});

Deno.test("los errores de OpenRouter salen legibles (los mapea a 429/402/502 el index)", async () => {
  for (const [status, patron] of [[401, /API key inválida/], [402, /crédito agotado/], [429, /rate limit/], [500, /respondió 500/]] as const) {
    const { f } = openRouterFalso(status, { error: {} });
    await assertRejects(() => pedirAnalisis(f, "k", MODELO_ECONOMICO, "s", "u", 135_000), Error, undefined, `status ${status}`)
      .then((e) => { if (!patron.test((e as Error).message)) throw new Error(`status ${status}: ${(e as Error).message}`); });
  }
});

Deno.test("una respuesta vacía es un error, no un análisis en blanco", async () => {
  const { f } = openRouterFalso(200, { choices: [{ message: { content: "  " } }] });
  await assertRejects(() => pedirAnalisis(f, "k", MODELO_ECONOMICO, "s", "u", 135_000), Error, "vacía");
});

Deno.test("sinCercas y el costo", () => {
  assertEquals(sinCercas("```\n{}\n```"), "{}");
  assertEquals(sinCercas("{\"a\":1}"), "{\"a\":1}");
  assertEquals(costoDeUso(MODELO_ECONOMICO, { prompt_tokens: 2_000_000, completion_tokens: 0 }), 0.2);
  assertEquals(costoDeUso(MODELO_ECONOMICO, { cost: 0.01 }), 0.01);
});
