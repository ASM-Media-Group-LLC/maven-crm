import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// tg-inbox-send-media — envía MEDIA saliente por la bandeja de Telegram. El frontend ya subió
// el archivo a storage (bucket tg-media) o nos pasa una URL existente (GIF de Giphy, sticker);
// acá resolvemos la conversación + gating por dueño y le pedimos al gateway que baje esa URL y
// la mande por MTProto (sendFile). Persistimos el saliente con su msg_type + media_url para que
// la bandeja lo renderice. Espejo de wa-inbox-send-media.
//
// kind: image | video | audio | voice | gif | sticker | document

const GW_URL = (Deno.env.get("TELEGRAM_GW_URL") || "http://telegram-gw.147.93.3.97.nip.io").replace(/\/+$/, "");
const GW_API_KEY = Deno.env.get("TELEGRAM_GW_API_KEY") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// kind → msg_type canónico que usa la bandeja para renderizar.
const KIND_TO_TYPE: Record<string, string> = {
  image: "photo", video: "video", audio: "audio", voice: "voice",
  gif: "gif", sticker: "sticker", document: "document",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) return json({ ok: false, error: "missing_auth" }, 401);

  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: uErr } = await sb.auth.getUser(token);
  if (uErr || !userData?.user) return json({ ok: false, error: "invalid_token" }, 401);
  const userId = userData.user.id;

  const { data: allowed, error: pErr } = await sb.rpc("has_permission", {
    _user_id: userId, _module: "Telegram", _submodule: "Bandeja",
  });
  if (pErr || !allowed) return json({ ok: false, error: "forbidden" }, 403);

  let payload: {
    conversation_id?: string; url?: string; kind?: string;
    caption?: string; file_name?: string; reply_to_message_id?: string;
  } = {};
  try { payload = await req.json(); } catch { /* */ }
  const conversationId = payload.conversation_id;
  const url = (payload.url ?? "").trim();
  const kind = (payload.kind ?? "document").toString();
  const caption = (payload.caption ?? "").trim();
  const replyToMessageId = payload.reply_to_message_id || null;
  if (!conversationId || !url) return json({ ok: false, error: "missing_conversation_or_url" }, 400);

  const { data: conv } = await (sb as any)
    .from("tg_conversations")
    .select("id, tenant_id, account_id, peer_id, peer_username, assigned_to")
    .eq("id", conversationId).maybeSingle();
  if (!conv) return json({ ok: false, error: "conversation_not_found" }, 404);

  if (conv.assigned_to !== userId) {
    const { data: isSup } = await sb.rpc("is_in_role_group", { _user_id: userId, _group: "supervisor_or_above" });
    if (!isSup) return json({ ok: false, error: "not_your_conversation" }, 200);
  }

  const to = (conv.peer_username as string | null) || (conv.peer_id as string);
  if (!to) return json({ ok: false, error: "peer_unresolved" }, 422);

  // Cita opcional → external_id nativo.
  let replyToExternalId: string | null = null;
  if (replyToMessageId) {
    const { data: q } = await (sb as any).from("tg_messages").select("external_id").eq("id", replyToMessageId).maybeSingle();
    replyToExternalId = (q?.external_id as string | undefined) ?? null;
  }

  const msgType = KIND_TO_TYPE[kind] ?? "document";
  const nowIso = new Date().toISOString();

  // Enviar por el gateway (baja la URL y hace sendFile).
  let sentOk = false, externalId: string | null = null, gwErr: string | null = null;
  if (!GW_API_KEY) { gwErr = "gateway_not_configured"; }
  else {
    try {
      const resp = await fetch(`${GW_URL}/message/sendMedia/${conv.account_id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: GW_API_KEY },
        body: JSON.stringify({ to, url, kind, caption: caption || undefined, replyTo: replyToExternalId ?? undefined, fileName: payload.file_name }),
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && (data as any)?.ok !== false) { sentOk = true; externalId = (data as any)?.id != null ? String((data as any).id) : null; }
      else gwErr = (data as any)?.error || `gateway ${resp.status}`;
    } catch (e) { gwErr = (e as Error).message; }
  }

  const preview = caption || `[${msgType}]`;

  if (!sentOk) {
    await sb.from("tg_messages").insert({
      tenant_id: conv.tenant_id, conversation_id: conversationId, direction: "out",
      external_id: null, sender_id: null, sender_user_id: userId, body: caption || null,
      msg_type: msgType, media_url: url, status: "failed", sent_at: nowIso,
      reply_to_message_id: replyToMessageId, reply_to_external_id: replyToExternalId,
    });
    await sb.from("tg_conversations").update({ last_message_at: nowIso, last_message_preview: preview.slice(0, 120) }).eq("id", conversationId);
    return json({ ok: false, reason: "send_failed", error: gwErr }, 200);
  }

  const { data: msg, error: mErr } = await sb.from("tg_messages").insert({
    tenant_id: conv.tenant_id, conversation_id: conversationId, direction: "out",
    external_id: externalId, sender_id: null, sender_user_id: userId, body: caption || null,
    msg_type: msgType, media_url: url, status: "sent", sent_at: nowIso,
    reply_to_message_id: replyToMessageId, reply_to_external_id: replyToExternalId,
  }).select("id").single();
  if (mErr) return json({ ok: false, error: "persist_failed: " + mErr.message }, 500);

  await sb.from("tg_conversations").update({ last_message_at: nowIso, last_message_preview: preview.slice(0, 120) }).eq("id", conversationId);
  return json({ ok: true, message_id: msg?.id, external_id: externalId });
});
