// La Parrilla por OpenRouter: fuerza la herramienta y lee sus argumentos.
// Sin red: fetch es un doble que responde como OpenRouter.
//   deno test --no-check supabase/functions/parrilla-generate/ia.test.ts
import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { costoDeUso, IaError, MODELO_ECONOMICO, pedirParrilla } from "./ia.ts";

function openRouterFalso(status: number, json: unknown) {
  const pedidos: Array<Record<string, unknown>> = [];
  const f = (async (_url: string | URL | Request, init?: RequestInit) => {
    pedidos.push(JSON.parse(String(init?.body ?? "{}")));
    return new Response(JSON.stringify(json), { status });
  }) as typeof fetch;
  return { f, pedidos };
}
const DIAS = [{ day_index: 0, idea: "Foto en la playa", copy_sugerido: "\"Hola\"", extra_desc: "x", extra_items: [{ label: "a", copy: "b" }] }];

Deno.test("fuerza entregar_parrilla y devuelve sus días", async () => {
  const { f, pedidos } = openRouterFalso(200, {
    choices: [{ message: { tool_calls: [{ id: "c", type: "function", function: { name: "entregar_parrilla", arguments: JSON.stringify({ dias: DIAS }) } }] } }],
    usage: { prompt_tokens: 5000, completion_tokens: 2000 },
  });
  const r = await pedirParrilla(f, "llave", MODELO_ECONOMICO, "{\"semana\":1}");
  assertEquals(r.generados, DIAS);
  assertEquals(r.uso?.prompt_tokens, 5000);
  assertEquals(pedidos[0].model, MODELO_ECONOMICO);
  assertEquals(pedidos[0].tool_choice, { type: "function", function: { name: "entregar_parrilla" } });
  const tools = pedidos[0].tools as Array<{ type: string; function: { name: string; parameters: { required: string[] } } }>;
  assertEquals(tools[0].type, "function");
  assertEquals(tools[0].function.name, "entregar_parrilla");
  assertEquals(tools[0].function.parameters.required, ["dias"]);
  assertEquals((pedidos[0].messages as Array<{ role: string }>).map((m) => m.role), ["system", "user"]);
});

Deno.test("sin la herramienta en la respuesta, o con argumentos rotos: IaError 502", async () => {
  for (const message of [{ content: "no sé" }, { tool_calls: [{ function: { name: "entregar_parrilla", arguments: "{roto" } }] }, { tool_calls: [{ function: { name: "entregar_parrilla", arguments: "{\"dias\":[]}" } }] }]) {
    const { f } = openRouterFalso(200, { choices: [{ message }] });
    const e = await assertRejects(() => pedirParrilla(f, "k", MODELO_ECONOMICO, "{}"), IaError);
    assertEquals(e.status, 502);
  }
});

Deno.test("un error de OpenRouter es IaError 502", async () => {
  const { f } = openRouterFalso(401, { error: {} });
  const e = await assertRejects(() => pedirParrilla(f, "k", MODELO_ECONOMICO, "{}"), IaError);
  assertEquals(e.status, 502);
});

Deno.test("el costo de lista del modelo económico", () => {
  assertEquals(costoDeUso(MODELO_ECONOMICO, { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 }), 0.5);
});
