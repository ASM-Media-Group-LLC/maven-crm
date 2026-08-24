import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callGeminiOnce } from "../_shared/gemini.ts";
import { SYSTEM_PROMPT } from "./prompt.ts";

// scouter-company-fill — asistente conversacional para llenar la config
// de búsqueda de una scouter_company. Reemplaza el one-shot Groq que
// daba siempre la misma config genérica.
//
// Flujo:
//   1. Frontend manda { name, description, current_config, messages }.
//   2. Esta función arma el prompt con el form state + chat history.
//   3. Gemini 2.5 flash devuelve JSON: o una pregunta o el config final.
//   4. Frontend, si recibe `ready: true`, popula el form con `config`.
//
// Auth: requiere JWT del user (RLS protege scouter_companies).

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface FillRequest {
  name?: string;
  description?: string;
  current_config?: Record<string, unknown>;
  messages?: Array<{ role: "user" | "assistant"; content: string }>;
}

interface AssistantResponse {
  ready: boolean;
  question?: string;
  missing_field?: string;
  config?: Record<string, unknown>;
  summary?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return jsonError("Use POST", 405);
  }

  // Auth
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return jsonError("Falta Authorization", 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const supabaseAnon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const supabase = createClient(supabaseUrl, supabaseAnon, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) return jsonError("No autenticado", 401);

  // Parse input
  let body: FillRequest;
  try {
    body = (await req.json()) as FillRequest;
  } catch {
    return jsonError("JSON inválido", 400);
  }
  const name = (body.name || "").trim();
  const description = (body.description || "").trim();
  const currentConfig = body.current_config ?? {};
  const messages = Array.isArray(body.messages) ? body.messages : [];

  if (!name && !description && messages.length === 0) {
    return jsonError("Falta name/description o conversation history", 400);
  }

  // API key
  const geminiKey = Deno.env.get("GEMINI_API_KEY") || Deno.env.get("GOOGLE_AI_API_KEY");
  if (!geminiKey) return jsonError("GEMINI_API_KEY no configurada", 500);

  // Build the user message: form state + (last user reply if conversational)
  const formStateBlock = `[FORM STATE]
Compañía: ${name || "(sin nombre)"}
Descripción: ${description || "(sin descripción)"}
Config actual (lo que ya está llenado):
${JSON.stringify(currentConfig, null, 2)}`;

  const userMessages: Array<{ role: "user" | "assistant"; content: string }> = [
    { role: "user", content: formStateBlock },
  ];
  for (const m of messages) {
    if (m.role === "user" || m.role === "assistant") {
      userMessages.push({ role: m.role, content: String(m.content || "") });
    }
  }

  // If first turn (no chat yet), nudge the model to either ask or fill.
  if (messages.length === 0) {
    userMessages.push({
      role: "user",
      content:
        "Analizá la compañía con la info de arriba. Si te falta algo crítico, hacé UNA pregunta concreta. Si tenés suficiente, devolvé el JSON con ready:true y la config llena.",
    });
  }

  // Call Gemini
  let result;
  try {
    result = await callGeminiOnce({
      apiKey: geminiKey,
      model: "gemini-2.5-flash",
      systemPrompt: SYSTEM_PROMPT,
      messages: userMessages,
      temperature: 0.4,
      maxOutputTokens: 1500,
      timeoutMs: 60_000,
    });
  } catch (e) {
    const msg = (e as Error).message ?? "Error de Gemini";
    const status = /rate limit|429/i.test(msg)
      ? 429
      : /key|401|403/i.test(msg)
        ? 402
        : 502;
    return jsonError(msg, status);
  }

  // Parse JSON response (Gemini sometimes wraps in ```json blocks).
  const cleaned = result.text
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: AssistantResponse;
  try {
    parsed = JSON.parse(cleaned) as AssistantResponse;
  } catch (e) {
    console.error("Gemini returned non-JSON:", cleaned.slice(0, 500));
    return jsonError("La IA devolvió una respuesta inválida. Prueba de nuevo.", 502);
  }

  if (typeof parsed.ready !== "boolean") {
    return jsonError("Respuesta de IA sin campo 'ready'", 502);
  }

  return new Response(JSON.stringify(parsed), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
