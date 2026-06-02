import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { whatsappCors } from "../_shared/whatsapp.ts";

// wa-inbox-suggest — Copiloto del inbox (Slice 6a): "Sugerir respuesta".
//
// Dado un conversation_id, lee el contexto (historial reciente del hilo + datos
// del contacto + lead del pipeline si está vinculado) y le pide a Claude que
// redacte EL PRÓXIMO MENSAJE del closer, en el tono de ventas de la agencia.
// NO envía nada — devuelve el texto sugerido para que el closer lo edite y mande.
//
// Autorización (v1, lanzamiento oscuro): SOLO admin (igual que wa-inbox-send).
// Se invoca vía supabase.functions.invoke con el JWT del usuario (verify_jwt ON).
// Lee con service_role (bypassa RLS) para armar el contexto.
//
// Anti-alucinación: el prompt prohíbe inventar datos/cifras de la creadora. Si no
// hay un dato, no se afirma. El humano siempre edita antes de enviar.

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = "claude-sonnet-4-6";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...whatsappCors, "Content-Type": "application/json" },
  });
}

const SYSTEM_PROMPT = `Sos el copiloto de ventas de una agencia de creadoras de OnlyFans, trabajando DENTRO del inbox de un closer que chatea con una creadora (lead) por WhatsApp. Tu única tarea: redactar EL PRÓXIMO MENSAJE que el closer le enviaría a ELLA, listo para mandar.

REGLAS DE ORO (no negociables):
- Hablá de ELLA, no de "nosotros". Prohibido "nos encantaría", "queremos", "nos gustaría".
- Confiado, NUNCA pidas permiso ("si te gustaría escuchar" ❌). Asumí el valor: tenemos el método y los resultados.
- Cuando aplique, liderá con un resultado/beneficio concreto. Bajale el riesgo.
- Cerrá con un micro-compromiso fácil (una pregunta concreta, "¿hoy o mañana?", "¿te paso 2 horarios?"). Nunca "quedamos atentos a tu disponibilidad".
- HUMANO y cálido, nada robótico ni corporativo. Español natural e informal (registro neutro/latam). Como un WhatsApp real.
- Leé en qué punto está la charla (primer contacto, objeción, seguimiento, casi cierre) y respondé a ESO.
- Si la lead puso una objeción, manejala con seguridad y empatía, sin rogar.

ANTI-INVENTO (crítico):
- NO inventes datos de la creadora (nombre, país, nicho, cifras) ni resultados que no estén en el contexto que te paso. Si no tenés un dato, no lo afirmes.
- Si te falta info para responder bien, hacé una pregunta breve y concreta en vez de inventar.

FORMATO DE SALIDA:
- Devolvé SOLO el texto del mensaje, listo para pegar. Sin comillas, sin encabezados, sin explicaciones, sin firmar.
- Corto: 2 a 5 líneas máximo. Un emoji ocasional está bien; no abuses.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: whatsappCors });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── Auth: JWT del usuario ──────────────────────────────────────────────────
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return json({ ok: false, error: "missing_auth" }, 401);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: uErr } = await sb.auth.getUser(token);
  if (uErr || !userData?.user) return json({ ok: false, error: "invalid_token" }, 401);
  const userId = userData.user.id;

  // ── Permiso (v1 = admin) ───────────────────────────────────────────────────
  const { data: roles } = await sb.from("user_roles").select("role").eq("user_id", userId);
  const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
  if (!isAdmin) return json({ ok: false, error: "forbidden" }, 403);

  if (!ANTHROPIC_API_KEY) return json({ ok: false, error: "ai_not_configured" }, 503);

  // ── Input ──────────────────────────────────────────────────────────────────
  let payload: { conversation_id?: string } = {};
  try { payload = await req.json(); } catch { /* */ }
  const conversationId = payload.conversation_id;
  if (!conversationId) return json({ ok: false, error: "missing_conversation" }, 400);

  // ── Contexto: conversación + contacto + lead del pipeline (best-effort) ─────
  const { data: conv } = await (sb as any)
    .from("wa_conversations")
    .select("id, contact_id, department, status, wa_contacts(display_name, instagram_handle, closer_creator_id)")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return json({ ok: false, error: "conversation_not_found" }, 404);

  const contact = conv.wa_contacts ?? {};
  const name = contact.display_name as string | null;
  const handle = contact.instagram_handle as string | null;

  // Historial reciente (últimos 20 mensajes, en orden).
  const { data: msgs } = await (sb as any)
    .from("wa_conversation_messages")
    .select("direction, body, msg_type, sent_at")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: false })
    .limit(20);
  const history = ((msgs ?? []) as Array<{ direction: string; body: string | null; msg_type: string }>)
    .reverse()
    .map((m) => {
      const who = m.direction === "out" ? "Closer" : "Lead";
      const text = m.body || `[${m.msg_type}]`;
      return `${who}: ${text}`;
    })
    .join("\n");

  // Lead del pipeline (si el contacto está vinculado) — best-effort, sin romper.
  let leadCtx = "";
  const ccId = contact.closer_creator_id as string | null;
  if (ccId) {
    try {
      const { data: lead } = await (sb as any)
        .from("closer_creators")
        .select("*")
        .eq("id", ccId)
        .maybeSingle();
      if (lead) {
        const bits: string[] = [];
        if (lead.stage) bits.push(`stage: ${lead.stage}`);
        if (lead.country) bits.push(`país: ${lead.country}`);
        if (lead.quality) bits.push(`quality: ${lead.quality}`);
        if (lead.notes) bits.push(`nota: ${String(lead.notes).slice(0, 200)}`);
        if (bits.length) leadCtx = `\nDatos del lead en Maven (NO inventes más allá de esto): ${bits.join(" · ")}`;
      }
    } catch (_e) { /* sin contexto de pipeline, seguimos */ }
  }

  const who = name || (handle ? "@" + String(handle).replace(/^@/, "") : "la creadora");
  const userMessage =
    `Creadora: ${who}${handle ? ` (IG @${String(handle).replace(/^@/, "")})` : ""}.` +
    leadCtx +
    `\n\nHistorial reciente del chat (lo más nuevo abajo):\n${history || "(sin mensajes previos — es el primer contacto)"}` +
    `\n\nRedactá el próximo mensaje que el Closer le envía a ${who}. Solo el texto del mensaje.`;

  // ── Anthropic ───────────────────────────────────────────────────────────────
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 600,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return json({ ok: false, error: `anthropic ${resp.status}: ${txt.slice(0, 200)}` }, 502);
    }
    const data = await resp.json() as { content?: Array<{ type: string; text?: string }> };
    const suggestion = (data.content ?? [])
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("")
      .trim();
    if (!suggestion) return json({ ok: false, error: "empty_suggestion" }, 502);
    return json({ ok: true, suggestion });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
