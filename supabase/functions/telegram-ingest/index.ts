// telegram-ingest — recibe mensajes entrantes/salientes del telegram-gateway y los
// guarda en la bandeja (tg_conversations + tg_messages). Espejo minimalista de
// whatsapp-ingest, pero con identificadores nativos de Telegram (account_id de la
// línea + peer_id del interlocutor).
//
// AUTH: token compartido con el gateway (header `x-telegram-ingest-token` o `?token=`),
// validado contra el secret TELEGRAM_INGEST_TOKEN. verify_jwt=false (es un webhook).
// Escribe con service_role → pasa por encima de la RLS deny-all de las tablas tg_*.
//
// PAYLOAD esperado (lo arma el gateway en S2.3):
// {
//   accountId: "main",                      // id de la línea en el gateway
//   peer: { id, username?, name?, phone? }, // interlocutor
//   message: { id, direction:"in"|"out", text?, type?, mediaUrl?, senderId?, date? }  // date = unix secs
// }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PROJECT_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INGEST_TOKEN = Deno.env.get("TELEGRAM_INGEST_TOKEN") ?? "";
// Inbox v1 mono-tenant (igual que wa-inbox-send). Se setea explícito porque el default
// current_tenant_id() da NULL para service_role → sin esto las filas quedan invisibles a
// la RLS de la bandeja (tenant_id = current_tenant_id()).
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

  // ── auth por token compartido ────────────────────────────────────────────
  const url = new URL(req.url);
  const token =
    req.headers.get("x-telegram-ingest-token") ?? url.searchParams.get("token") ?? "";
  if (!INGEST_TOKEN || token !== INGEST_TOKEN) return json({ ok: false, error: "unauthorized" }, 401);

  let payload: any;
  try { payload = await req.json(); } catch { return json({ ok: false, error: "bad_json" }, 400); }

  const { accountId, peer, message } = payload ?? {};
  if (!accountId || !peer?.id || !message) return json({ ok: false, error: "missing_fields" }, 400);

  const sb = createClient(PROJECT_URL, SERVICE_KEY);

  const direction = message.direction === "out" ? "out" : "in";
  const preview = String(message.text ?? `[${message.type || "media"}]`).slice(0, 120);
  const sentAt = message.date
    ? new Date(Number(message.date) * 1000).toISOString()
    : new Date().toISOString();

  // 1) upsert de la conversación por (account_id, peer_id). Solo pisa los campos "vivos".
  const { data: conv, error: cErr } = await sb
    .from("tg_conversations")
    .upsert(
      {
        tenant_id: TENANT_ID,
        account_id: String(accountId),
        peer_id: String(peer.id),
        peer_username: peer.username ?? null,
        peer_name: peer.name ?? null,
        peer_phone: peer.phone ?? null,
        last_message_at: sentAt,
        last_message_preview: preview,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id,peer_id" },
    )
    .select("id")
    .single();
  if (cErr) return json({ ok: false, error: "conv_upsert: " + cErr.message }, 500);

  // 2) insert idempotente del mensaje por (conversation_id, external_id).
  const { error: mErr } = await sb
    .from("tg_messages")
    .upsert(
      {
        tenant_id: TENANT_ID,
        conversation_id: conv.id,
        direction,
        external_id: message.id != null ? String(message.id) : null,
        sender_id: message.senderId != null ? String(message.senderId) : null,
        body: message.text ?? null,
        msg_type: message.type ?? "text",
        media_url: message.mediaUrl ?? null,
        sent_at: sentAt,
      },
      { onConflict: "conversation_id,external_id", ignoreDuplicates: true },
    );
  if (mErr) return json({ ok: false, error: "msg_upsert: " + mErr.message }, 500);

  return json({ ok: true, conversationId: conv.id });
});
