// telegram-ingest — recibe mensajes entrantes/salientes del telegram-gateway y los
// guarda en la bandeja (tg_conversations + tg_messages). Espejo de whatsapp-ingest:
//   · conversación NUEVA → auto-asigna según tg_channels.default_assignees de la línea
//     (assigned_to = 1º del array + TODOS en tg_conversation_assignees, como WhatsApp).
//   · entrante (direction='in') → tg_bump_unread (sin esto no hay badge de no-leídos).
//   · upsertea tg_channels lazy (para que la línea aparezca en la config de Cuentas).
//
// AUTH: token compartido (header x-telegram-ingest-token o ?token=) vs TELEGRAM_INGEST_TOKEN.
// verify_jwt=false (webhook). Escribe con service_role.
//
// PAYLOAD (lo arma el gateway en S2.3):
// { accountId, peer: { id, username?, name?, phone? },
//   message: { id, direction:"in"|"out", text?, type?, mediaUrl?, senderId?, date? } }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INGEST_TOKEN = Deno.env.get("TELEGRAM_INGEST_TOKEN") ?? "";
// Inbox v1 mono-tenant (igual que wa-inbox-send). Explícito porque current_tenant_id()
// da NULL para service_role → sin esto las filas quedan invisibles a la RLS por tenant.
const TENANT_ID = "30869615-f579-4981-8a1f-dbebc61eae2d"; // ASM Tech

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-telegram-ingest-token",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const url = new URL(req.url);
  const token =
    req.headers.get("x-telegram-ingest-token") ?? url.searchParams.get("token") ?? "";
  if (!INGEST_TOKEN || token !== INGEST_TOKEN) return json({ ok: false, error: "unauthorized" }, 401);

  let payload: any;
  try { payload = await req.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }

  const { accountId, peer, message } = payload ?? {};
  if (!accountId || !peer?.id || !message) return json({ ok: false, error: "missing_fields" }, 400);

  const sb = createClient(PROJECT_URL, SERVICE_KEY);

  const acct = String(accountId);
  const peerId = String(peer.id);
  const direction = message.direction === "out" ? "out" : "in";
  const preview = String(message.text ?? `[${message.type || "media"}]`).slice(0, 120);
  const sentAt = message.date
    ? new Date(Number(message.date) * 1000).toISOString()
    : new Date().toISOString();
  const nowIso = new Date().toISOString();

  // 0) La línea existe en la config (lazy): así aparece en Cuentas para setear
  //    auto-asignación aunque nunca se haya tocado a mano.
  await sb.from("tg_channels")
    .upsert({ tenant_id: TENANT_ID, account_id: acct, label: acct }, { onConflict: "account_id", ignoreDuplicates: true });

  // 1) find-or-create de la conversación por (account_id, peer_id) — split explícito
  //    porque la NUEVA se auto-asigna con los defaults de la línea (como whatsapp-ingest).
  const { data: existing } = await sb
    .from("tg_conversations")
    .select("id")
    .eq("account_id", acct)
    .eq("peer_id", peerId)
    .maybeSingle();

  let conversationId: string;
  if (existing) {
    conversationId = existing.id as string;
    await sb.from("tg_conversations").update({
      peer_username: peer.username ?? null,
      peer_name: peer.name ?? null,
      peer_phone: peer.phone ?? null,
      last_message_at: sentAt,
      last_message_preview: preview,
      updated_at: nowIso,
    }).eq("id", conversationId);
  } else {
    // Auto-asignación por línea: assigned_to = 1º del array; N:N con TODOS (abajo).
    let channelDefaults: string[] = [];
    const { data: ch } = await sb
      .from("tg_channels").select("default_assignees")
      .eq("account_id", acct).maybeSingle();
    if (Array.isArray(ch?.default_assignees)) channelDefaults = ch!.default_assignees as string[];

    const { data: created, error: cErr } = await sb
      .from("tg_conversations")
      .insert({
        tenant_id: TENANT_ID,
        account_id: acct,
        peer_id: peerId,
        peer_username: peer.username ?? null,
        peer_name: peer.name ?? null,
        peer_phone: peer.phone ?? null,
        status: "open",
        assigned_to: channelDefaults[0] ?? null,
        last_message_at: sentAt,
        last_message_preview: preview,
      })
      .select("id")
      .single();
    if (cErr || !created) return json({ ok: false, error: "conv_insert: " + (cErr?.message ?? "?") }, 500);
    conversationId = created.id as string;

    if (channelDefaults.length > 0) {
      await sb.from("tg_conversation_assignees").upsert(
        channelDefaults.map((uid) => ({ conversation_id: conversationId, user_id: uid })),
        { onConflict: "conversation_id,user_id", ignoreDuplicates: true },
      );
    }
  }

  const externalId = message.id != null ? String(message.id) : null;

  // 1b) Media entrante: el gateway la manda en base64 (mediaB64/mediaMime/mediaName). La
  //     subimos al bucket público tg-media y guardamos su URL → la bandeja la renderiza.
  let mediaUrl: string | null = message.mediaUrl ?? null;
  if (!mediaUrl && message.mediaB64 && externalId) {
    try {
      const bytes = Uint8Array.from(atob(String(message.mediaB64)), (ch) => ch.charCodeAt(0));
      const path = `${conversationId}/${externalId}_${message.mediaName || "media.bin"}`;
      const { error: upErr } = await sb.storage.from("tg-media").upload(path, bytes, {
        contentType: message.mediaMime || "application/octet-stream",
        upsert: true,
      });
      if (!upErr) mediaUrl = sb.storage.from("tg-media").getPublicUrl(path).data.publicUrl;
      else console.warn("tg-media upload:", upErr.message);
    } catch (e) { console.warn("tg-media decode/upload:", (e as Error).message); }
  }

  // 1c) Cita entrante: resolver el id nativo del mensaje citado → nuestra fila (si la tenemos).
  const replyExt = message.replyToExternalId != null ? String(message.replyToExternalId) : null;
  let replyToMessageId: string | null = null;
  if (replyExt) {
    const { data: q } = await sb.from("tg_messages")
      .select("id").eq("conversation_id", conversationId).eq("external_id", replyExt).maybeSingle();
    replyToMessageId = (q?.id as string | undefined) ?? null;
  }

  // 2) insert idempotente del mensaje por (conversation_id, external_id).
  const { error: mErr } = await sb
    .from("tg_messages")
    .upsert(
      {
        tenant_id: TENANT_ID,
        conversation_id: conversationId,
        direction,
        external_id: externalId,
        sender_id: message.senderId != null ? String(message.senderId) : null,
        // Saliente que llega por el listener = enviado desde OTRO dispositivo (celular/Telegram
        // web) con esta línea → 'external'. Los enviados por Maven ya se insertaron con
        // source='maven' (tg-inbox-send upsert) y ignoreDuplicates deja esa fila intacta.
        source: direction === "out" ? "external" : null,
        body: message.text ?? null,
        msg_type: message.type ?? "text",
        media_url: mediaUrl,
        reply_to_external_id: replyExt,
        reply_to_message_id: replyToMessageId,
        sent_at: sentAt,
      },
      { onConflict: "conversation_id,external_id", ignoreDuplicates: true },
    );
  if (mErr) return json({ ok: false, error: "msg_upsert: " + mErr.message }, 500);

  // 3) Entrante → sube el contador de no-leídos (badge lista + sidebar + filtro).
  if (direction === "in") {
    await sb.rpc("tg_bump_unread", { p_conversation_id: conversationId });
  }

  return json({ ok: true, conversationId });
});
