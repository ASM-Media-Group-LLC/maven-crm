import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { MAVEN_GUIDE } from "./maven-guide.ts";
import { streamGeminiAsOpenAI } from "../_shared/gemini.ts";

// clari-help — asistente de soporte global de Maven CRM.
//
// Diferencia con ai-sales-chat (Sales Coach) y qa-chat-mike (Mike):
//   - Clari NO consulta tablas del negocio.
//   - Clari conoce LA APP: rutas, módulos, flujos, sistema de permisos.
//   - Recibe el rol y permisos del usuario y los usa para dar
//     respuestas role-aware ("tu rol no te lo permite, pedile a un
//     admin que te habilite X").
//
// Modelo: Gemini 1.5 Flash por default (free tier 15 RPM, 1500 req/día,
// 1M tokens contexto). Fallback a Groq Llama 3.1 8B si no hay
// GEMINI_API_KEY. Se puede forzar Groq con CLARI_HELP_PROVIDER=groq.
// El frontend espera SSE en shape OpenAI; el helper de Gemini traduce
// el stream para que el cliente no se entere del cambio.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface UserContext {
  role?: string | null;
  permissions?: Array<{
    module: string;
    submodule: string | null;
    can_access: boolean;
  }>;
  isAdmin?: boolean;
}

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface RequestBody {
  messages: ChatMessage[];
  userContext?: UserContext;
}

const buildSystemPrompt = (ctx: UserContext | undefined): string => {
  const role = ctx?.role || "(sin rol detectado)";
  const isAdmin = ctx?.isAdmin === true;

  // Resumimos los permisos en una lista compacta para que el LLM la
  // pueda escanear sin consumir tokens en negativas:
  //   "Agency QA: Calls, New QA, QA History, QA Chat (sin Borrar Calls)"
  let permissionsBlock = "";
  if (isAdmin) {
    permissionsBlock = "ESTE USUARIO ES ADMIN — tiene acceso a TODOS los módulos y submódulos.";
  } else if (ctx?.permissions && ctx.permissions.length > 0) {
    const byModule = new Map<string, { allowed: string[]; denied: string[] }>();
    for (const p of ctx.permissions) {
      const slot = byModule.get(p.module) ?? { allowed: [], denied: [] };
      const tag = p.submodule ?? "(módulo)";
      if (p.can_access) slot.allowed.push(tag);
      else slot.denied.push(tag);
      byModule.set(p.module, slot);
    }
    const lines: string[] = [];
    for (const [mod, { allowed, denied }] of byModule.entries()) {
      const parts: string[] = [];
      if (allowed.length > 0) parts.push(`SI: ${allowed.join(", ")}`);
      if (denied.length > 0) parts.push(`NO: ${denied.join(", ")}`);
      lines.push(`• ${mod} — ${parts.join(" | ")}`);
    }
    permissionsBlock = `Permisos del usuario:\n${lines.join("\n")}`;
  } else {
    permissionsBlock =
      "Sin info de permisos en este request — asumí los defaults de su rol.";
  }

  return `Sos "Clari", el asistente de soporte de Maven CRM. Hablás en español rioplatense, cercano y directo.

TU ROL
  - Sos asistente de USO de la app, no de los datos.
  - Respondés cómo hacer cosas: "¿dónde está X?", "¿cómo creo Y?", "¿qué permiso necesito para Z?".
  - NO tenés acceso a creadoras, QAs, tickets, empleados ni ningún dato del negocio. Si te preguntan eso, los derivás al agente correcto (ver sección ASISTENTES IA EN MAVEN).

CONTEXTO DEL USUARIO QUE TE ESTÁ HABLANDO
  - Rol: ${role}
  - ${permissionsBlock}

REGLAS DE RESPUESTA
  1. Respuestas BREVES y útiles. 2-5 frases por default. Solo expandís si te piden "explicame en detalle".
  2. Si el usuario pregunta cómo hacer algo y SU rol NO TIENE el permiso requerido, decilo claro:
     "Tu rol de [rol] no tiene acceso a [módulo → submódulo]. Pedile a un admin que te habilite [Settings → Usuarios → Roles → tu rol → permisos]."
     Si el usuario ya es admin pero le falta el permiso, decile que vaya a Settings → Roles y se lo agregue al rol que sea.
  3. Si la pregunta es sobre DATOS DEL NEGOCIO (números, ranking, nombres específicos), derivá:
     • Datos de QAs / closers → "Eso te lo responde Mike, abrí Agency QA → Chat with Mike."
     • Datos de creadoras / earnings → "Eso es del Sales Coach: Finanzas → Asistente IA (Beta), o Creator Sales → IA Ventas."
  4. Cuando referenciás una página, escribí la ruta entre backticks (ej: \`/agency-qa\`) para que se vea distinto.
  5. Si no sabés algo, decí "No sé eso de cabeza, mejor revisá la sección X o preguntale a un admin." NO inventes features que no están en la guía.
  6. Saludá la primera vez con un mensaje corto y directo. No uses "estimado" ni lenguaje corporativo.

GUÍA COMPLETA DE LA APP
${MAVEN_GUIDE}`;
};

// Extrae los chunks SSE que devuelve Groq y los re-emite con el mismo
// formato OpenAI-compatible que espera el frontend (ClariAiChat ya
// parsea \`data: {...}\\n\` con \`choices[0].delta.content\`).
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // ───── auth ─────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "No autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey =
      Deno.env.get("SUPABASE_ANON_KEY") ||
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Token inválido" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ───── body ─────
    const body = (await req.json()) as RequestBody;
    const messages = body.messages ?? [];
    const userContext = body.userContext;

    if (messages.length === 0) {
      return new Response(JSON.stringify({ error: "Sin mensajes" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ───── Provider selection: Gemini (default) → Groq fallback ─────
    const systemPrompt = buildSystemPrompt(userContext);
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const provider =
      (Deno.env.get("CLARI_HELP_PROVIDER") || "").toLowerCase() ||
      (GEMINI_API_KEY ? "gemini" : "groq");

    if (provider === "gemini") {
      if (!GEMINI_API_KEY) {
        return new Response(
          JSON.stringify({ error: "GEMINI_API_KEY no configurada." }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const geminiModel =
        Deno.env.get("CLARI_HELP_MODEL_GEMINI") || "gemini-2.0-flash";
      return streamGeminiAsOpenAI({
        apiKey: GEMINI_API_KEY,
        model: geminiModel,
        systemPrompt,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: 0.7,
        maxOutputTokens: 1024,
        corsHeaders,
      });
    }

    // ───── Groq fallback ─────
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Ni GEMINI_API_KEY ni GROQ_API_KEY configurada." }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    const GROQ_MODEL =
      Deno.env.get("CLARI_HELP_MODEL") || "llama-3.1-8b-instant";
    const GROQ_URL =
      Deno.env.get("GROQ_BASE_URL") ||
      "https://api.groq.com/openai/v1/chat/completions";

    const groqResp = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          ...messages.map((m) => ({ role: m.role, content: m.content })),
        ],
        stream: true,
      }),
    });

    if (!groqResp.ok) {
      const status = groqResp.status;
      const errText = await groqResp.text().catch(() => "");
      console.error("Groq error", status, errText.slice(0, 500));
      if (status === 429) {
        return new Response(
          JSON.stringify({
            error: "Estoy saturado, probá en unos segundos.",
          }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (status === 401 || status === 402) {
        return new Response(
          JSON.stringify({ error: "Cuota agotada o key inválida." }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      return new Response(JSON.stringify({ error: "Error en el proveedor IA" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Streamed passthrough — Groq ya emite formato OpenAI-compatible
    // (data: {choices:[{delta:{content:""}}]}\\n) que el frontend
    // ClariAiChat consume tal cual.
    return new Response(groqResp.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("clari-help error:", e);
    return new Response(JSON.stringify({ error: "Error interno" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
