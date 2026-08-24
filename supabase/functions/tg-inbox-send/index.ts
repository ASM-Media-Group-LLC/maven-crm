import { corsFor } from "../_shared/cors.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// tg-inbox-send (S3.2) — envía un mensaje SALIENTE desde la bandeja de Telegram
// (responder a una conversación) y lo persiste como tg_messages(direction='out').
//
// Flujo (espejo de wa-inbox-send): valida el JWT del usuario → permiso
// Telegram/Bandeja → resuelve la conversación (account_id + peer) → gating por
// dueño (mismo criterio que la RLS de lectura) → manda por el gateway MTProto
// (POST /message/sendText/:accountId {to,text}) → guarda el saliente + actualiza
// la metadata. Escribe con service_role (bypassa RLS deny-all de escritura).
//
// El "to" del gateway acepta username | t.me url | id numérico → preferimos el
// @username del peer (estable) y caemos al peer_id (user id numérico) si no hay.

const GW_URL = (Deno.env.get("TELEGRAM_GW_URL") || "http://telegram-gw.147.93.3.97.nip.io").replace(/\/+$/, "");
const GW_API_KEY = Deno.env.get("TELEGRAM_GW_API_KEY") || "";

const cors = (req: Request) => corsFor(req);
function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors(req), "Content-Type": "application/json" } });
}

// Envía por el gateway de Telegram. Devuelve el id del mensaje si sale OK.
async function sendViaGateway(
  accountId: string,
  to: string,
  text: string,
  replyTo?: string | null,
): Promise<{ ok: boolean; externalId?: string | null; error?: string }> {
  if (!GW_API_KEY) return { ok: false, error: "gateway_not_configured" };
  try {
    const resp = await fetch(`${GW_URL}/message/sendText/${accountId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: GW_API_KEY },
      body: JSON.stringify({ to, text, replyTo: replyTo ?? undefined }),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || (data as any)?.ok === false) {
      return { ok: false, error: (data as any)?.error || `gateway ${resp.status}` };
    }
    return { ok: true, externalId: (data as any)?.id != null ? String((data as any).id) : null };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  // ── Auth: JWT del usuario ──────────────────────────────────────────────────
  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json(req, { ok: false, error: "missing_auth" }, 401);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: uErr } = await sb.auth.getUser(token);
  if (uErr || !userData?.user) return json(req, { ok: false, error: "invalid_token" }, 401);
  const userId = userData.user.id;

  // ── Permiso: Telegram / Bandeja (has_permission ya devuelve true para admin) ──
  const { data: allowed, error: pErr } = await sb.rpc("has_permission", {
    _user_id: userId, _module: "Telegram", _submodule: "Bandeja",
  });
  if (pErr || !allowed) return json(req, { ok: false, error: "forbidden" }, 403);

  // ── Input ────────────────────────────────────────────────────────────────
  let payload: { conversation_id?: string; body?: string; reply_to_message_id?: string } = {};
  try { payload = await req.json(); } catch { /* */ }
  const conversationId = payload.conversation_id;
  const text = (payload.body ?? "").trim();
  const replyToMessageId = payload.reply_to_message_id || null;
  if (!conversationId || !text) return json(req, { ok: false, error: "missing_conversation_or_body" }, 400);

  // Cita: resolvemos el id nativo (external_id) del mensaje citado para pasárselo al gateway.
  let replyToExternalId: string | null = null;
  if (replyToMessageId) {
    const { data: q } = await (sb as any)
      .from("tg_messages").select("external_id").eq("id", replyToMessageId).maybeSingle();
    replyToExternalId = (q?.external_id as string | undefined) ?? null;
  }

  // ── Resolver conversación → account_id + peer ───────────────────────────────
  const { data: conv } = await (sb as any)
    .from("tg_conversations")
    .select("id, tenant_id, account_id, peer_id, peer_username, assigned_to")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv) return json(req, { ok: false, error: "conversation_not_found" }, 404);

  // ── Gating por dueño: mismo criterio que la RLS de lectura (supervisor+ o dueño) ─
  if (conv.assigned_to !== userId) {
    const { data: isSup } = await sb.rpc("is_in_role_group", {
      _user_id: userId, _group: "supervisor_or_above",
    });
    if (!isSup) return json(req, { ok: false, error: "not_your_conversation" }, 200);
  }

  // Destino: preferimos @username (estable); si no hay, el user id numérico.
  const to = (conv.peer_username as string | null) || (conv.peer_id as string);
  if (!to) return json(req, { ok: false, error: "peer_unresolved" }, 422);

  // ── Enviar por el gateway ───────────────────────────────────────────────────
  const sent = await sendViaGateway(conv.account_id as string, to, text, replyToExternalId);
  const nowIso = new Date().toISOString();

  if (!sent.ok) {
    // Registramos el intento como FALLIDO (queda en rojo en el hilo) + aviso claro.
    await sb.from("tg_messages").insert({
      tenant_id: conv.tenant_id, conversation_id: conversationId, direction: "out",
      external_id: null, sender_id: null, sender_user_id: userId, body: text, msg_type: "text",
      status: "failed", source: "maven", sent_at: nowIso,
      reply_to_message_id: replyToMessageId, reply_to_external_id: replyToExternalId,
    });
    await sb.from("tg_conversations")
      .update({ last_message_at: nowIso, last_message_preview: text.slice(0, 120) })
      .eq("id", conversationId);
    return json(req, { ok: false, reason: "send_failed", error: sent.error, to }, 200);
  }

  // ── Persistir el saliente + actualizar metadata ─────────────────────────────
  // UPSERT por (conversation_id, external_id): si el ECO de este mismo envío ya llegó por el
  // listener del gateway y lo insertó como source='external', acá lo CORREGIMOS a 'maven' (con
  // emisor). external_id null → NULLs distintos en PG → se comporta como insert (igual que WA).
  const { data: msg, error: mErr } = await sb
    .from("tg_messages")
    .upsert({
      tenant_id: conv.tenant_id,
      conversation_id: conversationId,
      direction: "out",
      external_id: sent.externalId ?? null,
      sender_id: null,
      sender_user_id: userId,
      body: text,
      msg_type: "text",
      status: "sent",
      source: "maven",
      sent_at: nowIso,
      reply_to_message_id: replyToMessageId,
      reply_to_external_id: replyToExternalId,
    }, { onConflict: "conversation_id,external_id" })
    .select("id")
    .single();
  if (mErr) return json(req, { ok: false, error: "persist_failed: " + mErr.message }, 500);

  await sb.from("tg_conversations")
    .update({ last_message_at: nowIso, last_message_preview: text.slice(0, 120) })
    .eq("id", conversationId);

  return json(req, { ok: true, message_id: msg?.id, external_id: sent.externalId ?? null });
});
