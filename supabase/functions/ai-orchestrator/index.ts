import { corsFor } from "../_shared/cors.ts";
// ai-orchestrator — Clari como ORQUESTADOR cross-CRM.
//
// El dueño/management le pregunta cualquier cosa del CRM y Clari usa el CATÁLOGO de
// tools (_shared/agent-tools) con function-calling para traer datos reales y
// sintetizar. Desde el 01/10/2026 va por OpenRouter con un Gemini económico
// (ver openrouter.ts): Maven ya no tiene llave de Anthropic. Auth: staff (admin/owner/manager) por JWT. Responde SSE estilo OpenAI
// (choices[].delta.content) para que ClariAiChat lo renderee igual que clari-help.
//
// Deployar con --no-verify-jwt (hace su propia auth de rol).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runTool, toolsFor } from "../_shared/agent-tools/registry.ts";
import { conversar, costoDeUso, herramientasOpenRouter, MODELO_ECONOMICO } from "./openrouter.ts";

const TENANT_ID = "30869615-f579-4981-8a1f-dbebc61eae2d";
const MAX_ITERATIONS = 6;
const MAX_WALL_MS = 25_000;

const cors = (req: Request) => corsFor(req);

const SYSTEM = `Eres *Clari*, la asistente ORQUESTADORA de Maven (CRM de una agencia de creadoras de OnlyFans). El equipo de management/dueño te pregunta cosas de TODO el CRM y tú respondes trayendo datos REALES con las herramientas (nunca inventes).
- Si una herramienta puede responder la pregunta, úsala. Puedes usar varias y cruzar resultados.
- Sé concreta, accionable y breve. Cuando menciones una creadora, usa su link de Instagram (https://instagram.com/<handle>), NO el @handle pelado.
- Si no tienes herramienta para algo, dilo con honestidad en vez de inventar.
- Español neutro (tú, nunca vos), tono directo.`;

function sse(req: Request, text: string): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const chunk = JSON.stringify({ choices: [{ delta: { content: text } }] });
      controller.enqueue(enc.encode(`data: ${chunk}\n\n`));
      controller.enqueue(enc.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, {
    headers: { ...cors(req), "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}

function jsonErr(req: Request, msg: string, status = 400): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
  if (!OPENROUTER_API_KEY) return jsonErr(req, "OPENROUTER_API_KEY no configurada", 500);
  const modelo = Deno.env.get("IA_MODELO_OPENROUTER") || MODELO_ECONOMICO;

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Auth: JWT de staff (admin/owner/manager). El orquestador ve datos cross-CRM.
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return jsonErr(req, "unauthorized", 401);
  const { data: { user }, error: uErr } = await sb.auth.getUser(token);
  if (uErr || !user) return jsonErr(req, "unauthorized", 401);
  const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", user.id);
  const ok = (roles ?? []).some((r: { role: string }) => ["admin", "owner", "manager"].includes(r.role));
  if (!ok) return jsonErr(req, "forbidden", 403);

  let body: { messages?: Array<{ role: string; content: string }> } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const convo = (body.messages ?? [])
    .filter((m) => m && m.content)
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content) }));
  if (!convo.length) return jsonErr(req, "Sin mensajes");

  const ctx = { sb, tenantId: TENANT_ID, userId: user.id };
  const answer = await conversar({
    fetch,
    apiKey: OPENROUTER_API_KEY,
    modelo,
    system: SYSTEM,
    mensajes: convo,
    herramientas: herramientasOpenRouter(toolsFor({ scopes: ["read"] })),
    correr: (nombre, args) => runTool(nombre, args, ctx),
    // Cada vuelta del bucle queda en api_usage_log con su costo real (el que
    // informa OpenRouter). Falla silenciosa: la telemetría no rompe a Clari.
    registrar: (uso, iter) => {
      void sb.from("api_usage_log").insert({
        provider: "openrouter",
        operation: "ai-orchestrator",
        model: modelo,
        units: { input_tokens: uso?.prompt_tokens ?? 0, output_tokens: uso?.completion_tokens ?? 0 },
        cost_usd: costoDeUso(modelo, uso),
        context: { iter, user_id: user.id },
        tenant_id: TENANT_ID,
      }).then(({ error }) => { if (error) console.warn("api_usage_log:", error.message); });
    },
    maxIteraciones: MAX_ITERATIONS,
    maxMs: MAX_WALL_MS,
  });

  return sse(req, answer);
});
