import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { whatsappCors } from "../_shared/whatsapp.ts";

// wa-inbox-suggest — Copiloto del inbox (Slice 6a).
//
// El botón ✨ abre un MENÚ; cada acción llama a esta función con `action`. Solo
// se gasta cuando el closer elige una acción (no auto-dispara). Acciones:
//   - suggest   → redacta el próximo mensaje del closer (va al compose, editable)
//   - summarize → TL;DR del hilo (info, no se envía)
//   - signals   → señal principal + próximo paso (info, no se envía)
//
// Costo: usa Haiku (~5× más barato que Sonnet — alcanza para textos cortos),
// cap de tokens bajo y contexto recortado (últimos 12 mensajes). El humano
// siempre revisa/edita antes de enviar. Prompt anti-inventar cifras.
//
// Autorización (v1, lanzamiento oscuro): SOLO admin. (6a.2 lo cambia por
// has_permission(uid,'WhatsApp','IA') + cuota por usuario.) verify_jwt ON.

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = "claude-haiku-4-5"; // barato — suficiente para redactar/resumir un WhatsApp

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...whatsappCors, "Content-Type": "application/json" },
  });
}

const BASE = `Sos el copiloto de ventas de una agencia de creadoras de OnlyFans, trabajando DENTRO del inbox de un closer que chatea con una creadora (lead) por WhatsApp. Español natural e informal (registro neutro/latam). NUNCA inventes datos de la creadora (nombre, país, nicho, cifras) ni resultados que no estén en el contexto que te paso; si te falta un dato, no lo afirmes.`;

const ACTIONS: Record<string, { system: string; instruction: (who: string) => string; maxTokens: number }> = {
  suggest: {
    system: `${BASE}

Tu tarea: redactar EL PRÓXIMO MENSAJE que el closer le enviaría a ELLA, listo para mandar.
REGLAS DE ORO:
- Hablá de ELLA, no de "nosotros". Prohibido "nos encantaría", "queremos".
- Confiado, NUNCA pidas permiso ("si te gustaría escuchar" ❌). Asumí el valor.
- Cuando aplique, liderá con un resultado/beneficio concreto y bajale el riesgo.
- Cerrá con un micro-compromiso fácil ("¿hoy o mañana?"). Nunca "quedamos atentos a tu disponibilidad".
- Humano y cálido, nada robótico. Si hay objeción, manejala con seguridad y empatía.
SALIDA: solo el texto del mensaje, listo para pegar. Sin comillas ni explicaciones. 2-5 líneas máx.`,
    instruction: (who) => `Redactá el próximo mensaje que el Closer le envía a ${who}. Solo el texto del mensaje.`,
    maxTokens: 500,
  },
  summarize: {
    system: `${BASE}

Tu tarea: resumir el hilo para que el closer/supervisor lo retome de un vistazo.
SALIDA: 3 a 5 bullets cortos cubriendo — estado/interés del lead, qué se le ofreció, objeción principal, último contacto, y qué quedó PENDIENTE. Conciso. Sin preámbulo.`,
    instruction: (_who) => `Resumí esta conversación en bullets cortos.`,
    maxTokens: 400,
  },
  signals: {
    system: `${BASE}

Tu tarea: leer la conversación y devolver señal + próximo paso.
SALIDA exactamente en este formato:
• Señal: <una señal principal — ej. "lista para cerrar", "enfriándose", "objeción: precio", "sin respuesta hace X días">
• Próximo paso: <1-2 líneas, accionable>
Si conviene cambiar el stage del lead, decilo como SUGERENCIA (el humano decide, nunca automático).`,
    instruction: (_who) => `Analizá la conversación y devolvé la señal y el próximo paso.`,
    maxTokens: 350,
  },
};

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

  // ── Permiso server-side: módulo WhatsApp / submódulo IA (espejo de canAccess;
  // has_permission ya devuelve true para admin). ESTE gate controla el costo:
  // aunque oculten o burlen el botón, sin permiso IA no se llama a Claude.
  const { data: allowed, error: pErr } = await sb.rpc("has_permission", {
    _user_id: userId, _module: "WhatsApp", _submodule: "IA",
  });
  if (pErr || !allowed) return json({ ok: false, error: "forbidden" }, 403);

  if (!ANTHROPIC_API_KEY) return json({ ok: false, error: "ai_not_configured" }, 503);

  // ── Input ──────────────────────────────────────────────────────────────────
  let payload: { conversation_id?: string; action?: string } = {};
  try { payload = await req.json(); } catch { /* */ }
  const conversationId = payload.conversation_id;
  const action = (payload.action ?? "suggest").toLowerCase();
  if (!conversationId) return json({ ok: false, error: "missing_conversation" }, 400);
  const cfg = ACTIONS[action];
  if (!cfg) return json({ ok: false, error: "unknown_action" }, 400);

  // ── Contexto: conversación + contacto + lead del pipeline (best-effort) ─────
  const { data: conv } = await (sb as any)
    .from("wa_conversations")
    .select("id, contact_id, status, wa_contacts(display_name, instagram_handle, closer_creator_id)")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return json({ ok: false, error: "conversation_not_found" }, 404);

  const contact = conv.wa_contacts ?? {};
  const name = contact.display_name as string | null;
  const handle = contact.instagram_handle as string | null;

  // Historial reciente (últimos 12 — recortado para abaratar).
  const { data: msgs } = await (sb as any)
    .from("wa_conversation_messages")
    .select("direction, body, msg_type, sent_at")
    .eq("conversation_id", conversationId)
    .order("sent_at", { ascending: false })
    .limit(12);
  const history = ((msgs ?? []) as Array<{ direction: string; body: string | null; msg_type: string }>)
    .reverse()
    .map((m) => `${m.direction === "out" ? "Closer" : "Lead"}: ${m.body || `[${m.msg_type}]`}`)
    .join("\n");

  // Lead del pipeline (si el contacto está vinculado) — best-effort.
  let leadCtx = "";
  const ccId = contact.closer_creator_id as string | null;
  if (ccId) {
    try {
      const { data: lead } = await (sb as any)
        .from("closer_creators").select("*").eq("id", ccId).maybeSingle();
      if (lead) {
        const bits: string[] = [];
        if (lead.stage) bits.push(`stage: ${lead.stage}`);
        if (lead.country) bits.push(`país: ${lead.country}`);
        if (lead.quality) bits.push(`quality: ${lead.quality}`);
        if (lead.notes) bits.push(`nota: ${String(lead.notes).slice(0, 200)}`);
        if (bits.length) leadCtx = `\nDatos del lead en Maven (no inventes más allá de esto): ${bits.join(" · ")}`;
      }
    } catch (_e) { /* sin contexto de pipeline, seguimos */ }
  }

  const who = name || (handle ? "@" + String(handle).replace(/^@/, "") : "la creadora");
  const userMessage =
    `Creadora: ${who}${handle ? ` (IG @${String(handle).replace(/^@/, "")})` : ""}.` +
    leadCtx +
    `\n\nHistorial reciente del chat (lo más nuevo abajo):\n${history || "(sin mensajes previos — primer contacto)"}` +
    `\n\n${cfg.instruction(who)}`;

  // ── Cuota (6a.3): chequea y consume 1 uso ANTES de gastar en Claude ─────────
  // admin/manager = ilimitado; el resto, override del usuario > cuota del rol > 20.
  const { data: quotaRows, error: qErr } = await sb.rpc("wa_copilot_try_consume", { _user_id: userId });
  const quota = Array.isArray(quotaRows) ? quotaRows[0] : quotaRows;
  if (!qErr && quota && quota.allowed === false) {
    return json({ ok: false, error: "quota_exceeded", used: quota.used, limit: quota.lim }, 429);
  }
  // Si la RPC falla, fail-open: no bloqueamos por un error transitorio del contador.

  // ── Anthropic (Haiku) ───────────────────────────────────────────────────────
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
        max_tokens: cfg.maxTokens,
        system: cfg.system,
        messages: [{ role: "user", content: userMessage }],
      }),
    });
    if (!resp.ok) {
      const txt = await resp.text();
      return json({ ok: false, error: `anthropic ${resp.status}: ${txt.slice(0, 200)}` }, 502);
    }
    const data = await resp.json() as { content?: Array<{ type: string; text?: string }> };
    const result = (data.content ?? [])
      .filter((c) => c.type === "text").map((c) => c.text ?? "").join("").trim();
    if (!result) return json({ ok: false, error: "empty_result" }, 502);
    return json({ ok: true, action, result, used: quota?.used, limit: quota?.lim });
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
