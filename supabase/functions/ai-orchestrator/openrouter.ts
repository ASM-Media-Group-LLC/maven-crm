// Clari (modo CRM) por OpenRouter, con un Gemini económico. Desde el 01/10/2026
// Maven ya no tiene llave de Anthropic (Jhon la eliminó): este es el bucle de
// herramientas en el formato de OpenAI que habla OpenRouter.
//
// Vive en la carpeta de la función y no en _shared/: un cambio en _shared
// redespliega las ~97 funciones.

export const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
// El Gemini más barato con herramientas (01/10/2026: US$0,10 / 0,40 por millón).
// Se cambia sin desplegar con el secret IA_MODELO_OPENROUTER.
export const MODELO_ECONOMICO = "google/gemini-2.5-flash-lite";
const PRECIO_LISTA: Record<string, { in: number; out: number }> = {
  "google/gemini-2.5-flash-lite": { in: 0.10, out: 0.40 },
};

export interface UsoOpenRouter { prompt_tokens?: number; completion_tokens?: number; cost?: number }

/** El costo en US$: el que informa OpenRouter (usage.cost) o, si no vino, el de lista. */
export function costoDeUso(modelo: string, u: UsoOpenRouter | undefined): number {
  if (typeof u?.cost === "number") return u.cost;
  const p = PRECIO_LISTA[modelo];
  if (!p) return 0;
  return ((u?.prompt_tokens ?? 0) * p.in + (u?.completion_tokens ?? 0) * p.out) / 1_000_000;
}

/** Gemini rechaza «additionalProperties» en el esquema de una función, y el catálogo
 *  lo usa (22 veces). Se quita solo aquí, al convertir: el catálogo no cambia. */
export function sinAdditionalProperties(s: unknown): unknown {
  if (Array.isArray(s)) return s.map(sinAdditionalProperties);
  if (s && typeof s === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(s as Record<string, unknown>)) {
      if (k !== "additionalProperties") out[k] = sinAdditionalProperties(v);
    }
    return out;
  }
  return s;
}

interface HerramientaDelCatalogo { name: string; description: string; input_schema: unknown }

/** El catálogo en el formato de OpenAI. Una herramienta sin parámetros va sin
 *  «parameters» (Gemini no acepta un objeto con «properties» vacío). */
export function herramientasOpenRouter(tools: HerramientaDelCatalogo[]) {
  return tools.map((t) => {
    const params = sinAdditionalProperties(t.input_schema) as { properties?: Record<string, unknown> } | null;
    const sinParametros = !params?.properties || Object.keys(params.properties).length === 0;
    return {
      type: "function",
      function: { name: t.name, description: t.description, ...(sinParametros ? {} : { parameters: params }) },
    };
  });
}

interface LlamadaAHerramienta { id?: string; function?: { name?: string; arguments?: string } }

export interface Conversacion {
  fetch: typeof fetch;
  apiKey: string;
  modelo: string;
  system: string;
  mensajes: Array<{ role: string; content: string }>;
  herramientas: ReturnType<typeof herramientasOpenRouter>;
  correr: (nombre: string, args: Record<string, unknown>) => Promise<unknown>;
  registrar: (uso: UsoOpenRouter | undefined, iter: number) => void;
  maxIteraciones: number;
  maxMs: number;
  ahora?: () => number;
}

/** El bucle: pregunta, corre las herramientas que pida el modelo, devuelve la respuesta. */
export async function conversar(c: Conversacion): Promise<string> {
  const ahora = c.ahora ?? Date.now;
  const inicio = ahora();
  const messages: Array<Record<string, unknown>> = [{ role: "system", content: c.system }, ...c.mensajes];
  let respuesta = "No pude generar una respuesta.";

  for (let iter = 0; iter < c.maxIteraciones; iter++) {
    if (ahora() - inicio > c.maxMs) break;
    const resp = await c.fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${c.apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://app.maven-ai.me",
        "X-Title": "Maven",
      },
      body: JSON.stringify({
        model: c.modelo,
        max_tokens: 1500,
        messages,
        ...(c.herramientas.length ? { tools: c.herramientas, tool_choice: "auto" } : {}),
        usage: { include: true },
      }),
    });
    if (!resp.ok) {
      respuesta = `No pude consultar la IA (${resp.status}). Prueba de nuevo.`;
      break;
    }
    const data = await resp.json() as {
      choices?: Array<{ message?: { content?: string | null; tool_calls?: LlamadaAHerramienta[] } }>;
      usage?: UsoOpenRouter;
    };
    c.registrar(data.usage, iter);
    const msg = data.choices?.[0]?.message ?? {};
    const llamadas = Array.isArray(msg.tool_calls) ? msg.tool_calls : [];
    const texto = typeof msg.content === "string" ? msg.content.trim() : "";

    if (llamadas.length === 0) {
      if (texto) respuesta = texto;
      break;
    }

    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: llamadas });
    for (const l of llamadas) {
      let args: Record<string, unknown> = {};
      try { args = JSON.parse(l.function?.arguments || "{}"); } catch { args = {}; }
      let resultado: unknown;
      try {
        resultado = await c.correr(String(l.function?.name ?? ""), args);
      } catch (e) {
        resultado = { error: (e as Error).message };
      }
      messages.push({ role: "tool", tool_call_id: l.id, content: JSON.stringify(resultado).slice(0, 8000) });
    }
  }
  return respuesta;
}
