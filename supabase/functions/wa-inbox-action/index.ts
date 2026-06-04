import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { whatsappCors } from "../_shared/whatsapp.ts";

// wa-inbox-action — acciones sobre un mensaje del inbox: reaccionar o eliminar
// (para todos). Resuelve el external_id (id de WhatsApp) + fromMe del mensaje y
// la instancia del CANAL de la conversación, y llama al gateway.
//
// Input: { message_id (uuid de wa_conversation_messages), action: "react"|"delete", emoji? }
// Auth propia: JWT (getUser) + permiso WhatsApp/Bandeja. service_role para escribir.

const EVOLUTION_URL = Deno.env.get("WHATSAPP_EVOLUTION_URL") ?? "";
const EVOLUTION_API_KEY = Deno.env.get("WHATSAPP_EVOLUTION_API_KEY") ?? "";
const EVOLUTION_INSTANCE = Deno.env.get("WHATSAPP_EVOLUTION_INSTANCE") ?? "maven-bot";
const TENANT_ID = "30869615-f579-4981-8a1f-dbebc61eae2d";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...whatsappCors, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: whatsappCors });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "");
  if (!token) return json({ ok: false, error: "missing_auth" }, 401);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: uErr } = await sb.auth.getUser(token);
  if (uErr || !userData?.user) return json({ ok: false, error: "invalid_token" }, 401);
  const userId = userData.user.id;

  const { data: allowed, error: pErr } = await sb.rpc("has_permission", {
    _user_id: userId, _module: "WhatsApp", _submodule: "Bandeja",
  });
  if (pErr || !allowed) return json({ ok: false, error: "forbidden" }, 403);

  let payload: { message_id?: string; action?: string; emoji?: string } = {};
  try { payload = await req.json(); } catch { /* */ }
  const messageId = payload.message_id;
  const action = (payload.action ?? "").toLowerCase();
  if (!messageId || !["react", "delete"].includes(action)) {
    return json({ ok: false, error: "missing_or_invalid_action" }, 400);
  }

  // ── Resolver el mensaje (external_id + direction) + su conversación ──────────
  const { data: msg } = await (sb as any)
    .from("wa_conversation_messages")
    .select("id, external_id, direction, conversation_id")
    .eq("id", messageId)
    .maybeSingle();
  if (!msg) return json({ ok: false, error: "message_not_found" }, 404);
  if (!msg.external_id) return json({ ok: false, error: "message_has_no_external_id" }, 422);
  const fromMe = msg.direction === "out";

  const { data: conv } = await (sb as any)
    .from("wa_conversations")
    .select("id, channel_id, channel_jid, wa_contacts(wa_jid)")
    .eq("id", msg.conversation_id)
    .maybeSingle();
  if (!conv) return json({ ok: false, error: "conversation_not_found" }, 404);
  const waJid = conv.wa_contacts?.wa_jid as string | undefined;
  if (!waJid) return json({ ok: false, error: "contact_jid_missing" }, 422);

  let instance = (conv.channel_jid as string | null) || EVOLUTION_INSTANCE;
  if (conv.channel_id) {
    const { data: ch } = await (sb as any)
      .from("wa_channels").select("evolution_instance").eq("id", conv.channel_id).maybeSingle();
    if (ch?.evolution_instance) instance = ch.evolution_instance as string;
  }

  // ── Llamar al gateway ───────────────────────────────────────────────────────
  if (!EVOLUTION_URL || !EVOLUTION_API_KEY) return json({ ok: false, error: "evolution_not_configured" }, 500);
  const base = EVOLUTION_URL.replace(/\/$/, "");
  const endpoint = action === "react"
    ? `${base}/message/react/${instance}`
    : `${base}/message/delete/${instance}`;
  const reqBody = action === "react"
    ? { number: waJid, messageId: msg.external_id, fromMe, emoji: payload.emoji ?? "" }
    : { number: waJid, messageId: msg.external_id, fromMe };

  try {
    const resp = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "apikey": EVOLUTION_API_KEY },
      body: JSON.stringify(reqBody),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return json({ ok: false, error: `evolution ${resp.status}: ${t.slice(0, 200)}` }, 502);
    }
  } catch (e) {
    return json({ ok: false, error: (e as Error).message }, 502);
  }

  // ── Reflejar en la DB ────────────────────────────────────────────────────────
  if (action === "delete") {
    await sb.from("wa_conversation_messages")
      .update({ body: "🚫 Mensaje eliminado", msg_type: "deleted", media_url: null })
      .eq("id", messageId);
  } else if (action === "react") {
    // Guardamos la reacción del agente en el propio mensaje (texto simple) para
    // reflejarla en la UI. "" la quita.
    await sb.from("wa_conversation_messages")
      .update({ agent_reaction: payload.emoji || null })
      .eq("id", messageId);
  }

  return json({ ok: true });
});
