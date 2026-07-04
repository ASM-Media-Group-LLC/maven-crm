import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// tg-inbox-action — reaccionar (emoji) o borrar (revoke) un mensaje de la bandeja de Telegram.
// Espejo de wa-inbox-action. Auth JWT + permiso Telegram/Bandeja + gating por dueño de la
// conversación (igual que la RLS de lectura). Llama al gateway (MTProto) y persiste el efecto:
//   · react  → gateway /message/react + UPDATE tg_messages.reaction (toggle si repite emoji).
//   · delete → gateway /message/delete (revoke) + soft-delete (UPDATE deleted_at).

const GW_URL = (Deno.env.get("TELEGRAM_GW_URL") || "http://telegram-gw.147.93.3.97.nip.io").replace(/\/+$/, "");
const GW_API_KEY = Deno.env.get("TELEGRAM_GW_API_KEY") || "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

async function gw(path: string, body: unknown): Promise<{ ok: boolean; error?: string }> {
  if (!GW_API_KEY) return { ok: false, error: "gateway_not_configured" };
  try {
    const resp = await fetch(`${GW_URL}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: GW_API_KEY },
      body: JSON.stringify(body),
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok || (data as any)?.ok === false) return { ok: false, error: (data as any)?.error || `gateway ${resp.status}` };
    return { ok: true };
  } catch (e) { return { ok: false, error: (e as Error).message }; }
}

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

  let payload: { message_id?: string; action?: "react" | "delete"; emoji?: string } = {};
  try { payload = await req.json(); } catch { /* */ }
  const messageId = payload.message_id;
  const action = payload.action;
  const emoji = payload.emoji || "";
  if (!messageId || (action !== "react" && action !== "delete")) {
    return json({ ok: false, error: "missing_message_or_action" }, 400);
  }

  // Mensaje → conversación (account_id + peer + external_id + reacción actual).
  const { data: msg } = await (sb as any)
    .from("tg_messages")
    .select("id, external_id, reaction, conversation_id")
    .eq("id", messageId).maybeSingle();
  if (!msg) return json({ ok: false, error: "message_not_found" }, 404);
  if (!msg.external_id) return json({ ok: false, error: "message_not_on_telegram" }, 422);

  const { data: conv } = await (sb as any)
    .from("tg_conversations")
    .select("id, account_id, peer_id, peer_username, assigned_to")
    .eq("id", msg.conversation_id).maybeSingle();
  if (!conv) return json({ ok: false, error: "conversation_not_found" }, 404);

  // Gating por dueño (igual que tg-inbox-send): dueño o supervisor+.
  if (conv.assigned_to !== userId) {
    const { data: isSup } = await sb.rpc("is_in_role_group", { _user_id: userId, _group: "supervisor_or_above" });
    if (!isSup) return json({ ok: false, error: "not_your_conversation" }, 200);
  }

  const to = (conv.peer_username as string | null) || (conv.peer_id as string);
  const acct = conv.account_id as string;

  if (action === "delete") {
    const r = await gw(`/message/delete/${acct}`, { msgId: msg.external_id, revoke: true });
    if (!r.ok) return json({ ok: false, error: r.error }, 200);
    await sb.from("tg_messages").update({ deleted_at: new Date().toISOString() }).eq("id", messageId);
    return json({ ok: true });
  }

  // react — toggle: si ya tenía este emoji, lo quitamos (emoticon vacío).
  const clearing = (msg.reaction as string | null) === emoji;
  const emoticon = clearing ? "" : emoji;
  const r = await gw(`/message/react/${acct}`, { to, msgId: msg.external_id, emoticon });
  if (!r.ok) return json({ ok: false, error: r.error }, 200);
  await sb.from("tg_messages").update({ reaction: clearing ? null : emoji }).eq("id", messageId);
  return json({ ok: true, reaction: clearing ? null : emoji });
});
