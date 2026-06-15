// ai-orchestrator — Clari como ORQUESTADOR cross-CRM.
//
// El dueño/management le pregunta cualquier cosa del CRM y Clari usa el CATÁLOGO de
// tools (_shared/agent-tools) con function-calling de Claude para traer datos reales
// y sintetizar. Auth: staff (admin/owner/manager) por JWT. Responde SSE estilo OpenAI
// (choices[].delta.content) para que ClariAiChat lo renderee igual que clari-help.
//
// Deployar con --no-verify-jwt (hace su propia auth de rol).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { runTool, toAnthropicTools, toolsFor } from "../_shared/agent-tools/registry.ts";

const TENANT_ID = "30869615-f579-4981-8a1f-dbebc61eae2d";
const SONNET_MODEL = "claude-sonnet-4-6";
const MAX_ITERATIONS = 6;
const MAX_WALL_MS = 25_000;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = `Sos *Clari*, la asistente ORQUESTADORA de Maven (CRM de una agencia de creadoras de OnlyFans). El equipo de management/dueño te pregunta cosas de TODO el CRM y vos respondés trayendo datos REALES con las herramientas (nunca inventes).
- Si una herramienta puede responder la pregunta, usala. Podés usar varias y cruzar resultados.
- Sé concreta, accionable y breve. Cuando menciones una creadora, usá su link de Instagram (https://instagram.com/<handle>), NO el @handle pelado.
- Si no tenés herramienta para algo, decílo con honestidad en vez de inventar.
- Español rioplatense, tono directo.`;

function sse(text: string): Response {
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
    headers: { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}

function jsonErr(msg: string, status = 400): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
  if (!ANTHROPIC_API_KEY) return jsonErr("ANTHROPIC_API_KEY no configurada", 500);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Auth: JWT de staff (admin/owner/manager). El orquestador ve datos cross-CRM.
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return jsonErr("unauthorized", 401);
  const { data: { user }, error: uErr } = await sb.auth.getUser(token);
  if (uErr || !user) return jsonErr("unauthorized", 401);
  const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", user.id);
  const ok = (roles ?? []).some((r: { role: string }) => ["admin", "owner", "manager"].includes(r.role));
  if (!ok) return jsonErr("forbidden", 403);

  let body: { messages?: Array<{ role: string; content: string }> } = {};
  try { body = await req.json(); } catch { /* ignore */ }
  const convo = (body.messages ?? [])
    .filter((m) => m && m.content)
    .map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content) }));
  if (!convo.length) return jsonErr("Sin mensajes");

  const tools = toAnthropicTools(toolsFor({ scopes: ["read"] }));
  const ctx = { sb, tenantId: TENANT_ID, userId: user.id };
  const messages: Array<Record<string, unknown>> = [...convo];

  const startedAt = Date.now();
  let answer = "No pude generar una respuesta.";

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    if (Date.now() - startedAt > MAX_WALL_MS) break;
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({ model: SONNET_MODEL, max_tokens: 1500, system: SYSTEM, tools, messages }),
    });
    if (!resp.ok) {
      answer = `No pude consultar la IA (${resp.status}). Probá de nuevo.`;
      break;
    }
    const data = await resp.json() as { content: Array<Record<string, unknown>> };
    const blocks = data.content ?? [];
    const toolUses = blocks.filter((b) => b.type === "tool_use");
    const text = blocks
      .filter((b) => b.type === "text")
      .map((b) => String((b as { text?: string }).text ?? ""))
      .join("\n")
      .trim();

    if (toolUses.length === 0) {
      if (text) answer = text;
      break;
    }

    messages.push({ role: "assistant", content: blocks });
    const toolResults: Array<Record<string, unknown>> = [];
    for (const t of toolUses) {
      const tn = String((t as { name?: string }).name ?? "");
      let result: unknown;
      try {
        result = await runTool(tn, ((t as { input?: Record<string, unknown> }).input ?? {}), ctx);
      } catch (e) {
        result = { error: (e as Error).message };
      }
      toolResults.push({
        type: "tool_result",
        tool_use_id: (t as { id?: string }).id,
        content: JSON.stringify(result).slice(0, 8000),
      });
    }
    messages.push({ role: "user", content: toolResults });
  }

  return sse(answer);
});
