// Clari por OpenRouter: el bucle de herramientas y la conversión del catálogo.
// Sin red: fetch es un doble que responde como OpenRouter.
//   deno test --no-check supabase/functions/ai-orchestrator/openrouter.test.ts
import { assert, assertEquals } from "jsr:@std/assert@1";
import { toolsFor } from "../_shared/agent-tools/registry.ts";
import { conversar, costoDeUso, herramientasOpenRouter, MODELO_ECONOMICO, OPENROUTER_URL, sinAdditionalProperties } from "./openrouter.ts";

type Pedido = { url: string; init: RequestInit; body: Record<string, unknown> };
function openRouterFalso(respuestas: Array<{ status?: number; json: unknown }>) {
  const pedidos: Pedido[] = [];
  const f = (async (url: string | URL | Request, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    pedidos.push({ url: String(url), init: init ?? {}, body });
    const r = respuestas.shift();
    if (!r) throw new Error("se pidieron más vueltas de las esperadas");
    return new Response(JSON.stringify(r.json), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { f, pedidos };
}
const base = (f: typeof fetch, extra: Partial<Parameters<typeof conversar>[0]> = {}) => ({
  fetch: f, apiKey: "llave-de-prueba", modelo: MODELO_ECONOMICO, system: "Eres Clari.",
  mensajes: [{ role: "user", content: "¿Cuántas creadoras activas hay?" }],
  herramientas: herramientasOpenRouter([{ name: "contar_creadoras", description: "Cuenta", input_schema: { type: "object", properties: { estado: { type: "string" } } } }]),
  correr: async () => ({ total: 64 }), registrar: () => {}, maxIteraciones: 6, maxMs: 25_000, ...extra,
});

Deno.test("el catálogo real queda sin additionalProperties y en formato de función", () => {
  const catalogo = toolsFor({ scopes: ["read"] });
  assert(catalogo.length > 0, "el catálogo de lectura tiene herramientas");
  const convertido = herramientasOpenRouter(catalogo);
  assertEquals(convertido.length, catalogo.length);
  assert(!JSON.stringify(convertido).includes("additionalProperties"), "no queda ningún additionalProperties");
  assert(JSON.stringify(catalogo.map((t) => t.input_schema)).includes("additionalProperties"),
    "línea base: el catálogo sí lo tiene (si no, la prueba de arriba no prueba nada)");
  for (const t of convertido) {
    assertEquals(t.type, "function");
    assert(t.function.name && typeof t.function.description === "string");
    const p = (t.function as { parameters?: { properties?: Record<string, unknown> } }).parameters;
    if (p) assert(Object.keys(p.properties ?? {}).length > 0, `${t.function.name}: si lleva parameters, no van vacíos`);
  }
});

Deno.test("sinAdditionalProperties limpia a cualquier profundidad y no toca lo demás", () => {
  const s = { type: "object", additionalProperties: false, properties: { a: { type: "object", additionalProperties: true, properties: { b: { type: "array", items: { type: "object", additionalProperties: false } } } } }, required: ["a"] };
  assertEquals(sinAdditionalProperties(s), { type: "object", properties: { a: { type: "object", properties: { b: { type: "array", items: { type: "object" } } } } }, required: ["a"] });
});

Deno.test("una herramienta sin parámetros va sin parameters", () => {
  const [t] = herramientasOpenRouter([{ name: "hoy", description: "Hoy", input_schema: { type: "object", properties: {} } }]);
  assertEquals("parameters" in t.function, false);
});

Deno.test("el bucle: pide una herramienta, la corre y responde con el texto final", async () => {
  const { f, pedidos } = openRouterFalso([
    { json: { choices: [{ message: { content: null, tool_calls: [{ id: "call_1", type: "function", function: { name: "contar_creadoras", arguments: "{\"estado\":\"active\"}" } }] } }], usage: { prompt_tokens: 1200, completion_tokens: 30, cost: 0.000132 } } },
    { json: { choices: [{ message: { content: "Hay 64 creadoras activas." } }], usage: { prompt_tokens: 1300, completion_tokens: 12 } } },
  ]);
  const corridas: Array<[string, Record<string, unknown>]> = [];
  const usos: Array<[unknown, number]> = [];
  const r = await conversar(base(f, {
    correr: async (n, a) => { corridas.push([n, a]); return { total: 64 }; },
    registrar: (u, i) => usos.push([u, i]),
  }));
  assertEquals(r, "Hay 64 creadoras activas.");
  assertEquals(corridas, [["contar_creadoras", { estado: "active" }]]);
  assertEquals(pedidos.length, 2);
  assertEquals(pedidos[0].url, OPENROUTER_URL);
  assertEquals((pedidos[0].init.headers as Record<string, string>)["Authorization"], "Bearer llave-de-prueba");
  assertEquals(pedidos[0].body.model, MODELO_ECONOMICO);
  assertEquals(pedidos[0].body.tool_choice, "auto");
  assertEquals(pedidos[0].body.usage, { include: true });
  const m0 = pedidos[0].body.messages as Array<Record<string, unknown>>;
  assertEquals(m0[0], { role: "system", content: "Eres Clari." }, "el system va como primer mensaje");
  const m1 = pedidos[1].body.messages as Array<Record<string, unknown>>;
  assertEquals(m1.at(-2)?.role, "assistant");
  assertEquals((m1.at(-2)?.tool_calls as unknown[]).length, 1, "la segunda vuelta lleva la llamada del modelo…");
  assertEquals(m1.at(-1), { role: "tool", tool_call_id: "call_1", content: "{\"total\":64}" }, "…y el resultado con su tool_call_id");
  assertEquals(usos.map(([, i]) => i), [0, 1], "registra el uso de cada vuelta");
});

Deno.test("argumentos que no son JSON: corre la herramienta con {} y sigue", async () => {
  const { f } = openRouterFalso([
    { json: { choices: [{ message: { tool_calls: [{ id: "c", function: { name: "contar_creadoras", arguments: "{roto" } }] } }] } },
    { json: { choices: [{ message: { content: "Listo." } }] } },
  ]);
  const args: unknown[] = [];
  const r = await conversar(base(f, { correr: async (_n, a) => { args.push(a); return {}; } }));
  assertEquals(r, "Listo.");
  assertEquals(args, [{}]);
});

Deno.test("una herramienta que falla le llega al modelo como error, no corta el bucle", async () => {
  const { f, pedidos } = openRouterFalso([
    { json: { choices: [{ message: { tool_calls: [{ id: "c", function: { name: "contar_creadoras", arguments: "{}" } }] } }] } },
    { json: { choices: [{ message: { content: "No pude contarlas." } }] } },
  ]);
  const r = await conversar(base(f, { correr: async () => { throw new Error("sin permiso"); } }));
  assertEquals(r, "No pude contarlas.");
  const m = pedidos[1].body.messages as Array<Record<string, unknown>>;
  assertEquals(m.at(-1)?.content, "{\"error\":\"sin permiso\"}");
});

Deno.test("si OpenRouter responde con error, Clari lo dice y no sigue", async () => {
  const { f, pedidos } = openRouterFalso([{ status: 402, json: { error: { message: "sin crédito" } } }]);
  const r = await conversar(base(f));
  assertEquals(r, "No pude consultar la IA (402). Prueba de nuevo.");
  assertEquals(pedidos.length, 1);
});

Deno.test("el tope de vueltas se respeta", async () => {
  const pedir = { json: { choices: [{ message: { tool_calls: [{ id: "c", function: { name: "contar_creadoras", arguments: "{}" } }] } }] } };
  const { f, pedidos } = openRouterFalso([pedir, pedir, pedir]);
  const r = await conversar(base(f, { maxIteraciones: 3 }));
  assertEquals(pedidos.length, 3);
  assertEquals(r, "No pude generar una respuesta.");
});

Deno.test("el costo: el que informa OpenRouter, o el de lista", () => {
  assertEquals(costoDeUso(MODELO_ECONOMICO, { prompt_tokens: 1000, completion_tokens: 1000, cost: 0.42 }), 0.42);
  assertEquals(costoDeUso(MODELO_ECONOMICO, { prompt_tokens: 1_000_000, completion_tokens: 1_000_000 }), 0.5);
  assertEquals(costoDeUso("otro/modelo", { prompt_tokens: 1000, completion_tokens: 1000 }), 0);
});
